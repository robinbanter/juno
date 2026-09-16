"""Veil auto-blur — Strategy B single-model pipeline.

One predict() call takes a raw image or video and returns the blurred derivative
with explicit regions covered, audio preserved. Internally it runs the same
chain we validated stage-by-stage in P0–P1:

    Grounding DINO (detect boxes) -> box centers -> SAM2 (mask / track)
    -> feathered Gaussian blur composited over the sharp original (ffmpeg/cv2)

Fail-closed: if nothing is detected we blur the WHOLE frame and report
detected_regions=0 so the orchestrator routes to manual review (never auto-publish).

NOTE: model/library APIs (groundingdino-py, sam2) and weight paths shift between
releases — pin and verify them at `cog build` time. This file is logic-complete
but has not been GPU-run in this repo.
"""

import os
import subprocess
import tempfile
from typing import List, Tuple

import cv2
import numpy as np
import torch
from cog import BasePredictor, BaseModel, Input, Path

# Region taxonomy — keep in sync with lib/blur/replicate.ts DESIRED_REGIONS.
DEFAULT_REGIONS = "breast,breasts,nipple,nipples,areola,areolas,penis,erect penis,testicles,scrotum,vagina,vulva,labia,pubic area,genitals,genital area,crotch,anus,anal area,buttocks,bare buttocks,sex toy,dildo,vibrator"
SAM2_WEIGHTS = "/weights/sam2_hiera_large.pt"
SAM2_CFG = "sam2_hiera_l.yaml"
GDINO_WEIGHTS = "/weights/groundingdino_swint_ogc.pth"


class Output(BaseModel):
    media: Path
    detected_regions: int
    max_confidence: float


class Predictor(BasePredictor):
    def setup(self) -> None:
        """Load Grounding DINO + SAM2 once per container boot."""
        self.device = "cuda" if torch.cuda.is_available() else "cpu"

        from groundingdino.util.inference import load_model

        # groundingdino-py ships the swinT config; weights pre-baked in the image.
        cfg = os.path.join(
            os.path.dirname(__import__("groundingdino").__file__),
            "config",
            "GroundingDINO_SwinT_OGC.py",
        )
        self.gdino = load_model(cfg, GDINO_WEIGHTS).to(self.device)

        from sam2.build_sam import build_sam2, build_sam2_video_predictor
        from sam2.sam2_image_predictor import SAM2ImagePredictor

        self.sam2_image = SAM2ImagePredictor(
            build_sam2(SAM2_CFG, SAM2_WEIGHTS, device=self.device)
        )
        self.sam2_video = build_sam2_video_predictor(
            SAM2_CFG, SAM2_WEIGHTS, device=self.device
        )

    # ── detection ────────────────────────────────────────────────────────────
    def _detect(
        self, image_bgr: np.ndarray, caption: str, box_threshold: float
    ) -> Tuple[List[Tuple[int, int, int, int]], float]:
        """Grounding DINO → list of (x1,y1,x2,y2) pixel boxes + max confidence."""
        from groundingdino.util.inference import predict
        import groundingdino.datasets.transforms as T
        from PIL import Image

        h, w = image_bgr.shape[:2]
        pil = Image.fromarray(cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB))
        transform = T.Compose(
            [
                T.RandomResize([800], max_size=1333),
                T.ToTensor(),
                T.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
            ]
        )
        image_tensor, _ = transform(pil, None)

        boxes, logits, _phrases = predict(
            model=self.gdino,
            image=image_tensor,
            caption=caption.replace(",", " . "),
            box_threshold=box_threshold,
            text_threshold=0.25,
            device=self.device,
        )
        # boxes: normalized cx,cy,w,h -> pixel x1,y1,x2,y2
        out: List[Tuple[int, int, int, int]] = []
        for cx, cy, bw, bh in boxes.cpu().numpy():
            x1 = int((cx - bw / 2) * w)
            y1 = int((cy - bh / 2) * h)
            x2 = int((cx + bw / 2) * w)
            y2 = int((cy + bh / 2) * h)
            out.append((max(0, x1), max(0, y1), min(w, x2), min(h, y2)))
        max_conf = float(logits.max().item()) if len(logits) else 0.0
        return out, max_conf

    # ── compositing ──────────────────────────────────────────────────────────
    @staticmethod
    def _composite(
        frame_bgr: np.ndarray, mask: np.ndarray, blur_strength: int, feather: int
    ) -> np.ndarray:
        """Blur only inside `mask` (0/255), with an outward-feathered edge."""
        k = blur_strength * 2 + 1
        blurred = cv2.GaussianBlur(frame_bgr, (k, k), 0)
        alpha = mask.astype(np.float32)
        if feather >= 1:
            fk = feather * 2 + 1
            soft = cv2.GaussianBlur(mask, (fk, fk), 0).astype(np.float32)
            alpha = np.maximum(alpha, soft)  # outward-only feather (coverage kept)
        alpha = (alpha / 255.0)[:, :, None]
        return (blurred * alpha + frame_bgr * (1 - alpha)).astype(np.uint8)

    @staticmethod
    def _mux_audio(silent_video: str, source_with_audio: str, out_path: str) -> None:
        """Copy the original audio track onto the composited video (optional)."""
        subprocess.run(
            ["ffmpeg", "-y", "-i", silent_video, "-i", source_with_audio,
             "-map", "0:v", "-map", "1:a?", "-c:v", "copy", "-c:a", "copy",
             "-movflags", "+faststart", out_path],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )

    # ── entrypoint ─────────────────────────────────────────────────────────────
    def predict(
        self,
        media: Path = Input(description="Source image or video"),
        media_type: str = Input(default="image", choices=["image", "video"]),
        regions: str = Input(default=DEFAULT_REGIONS),
        box_threshold: float = Input(default=0.3, ge=0, le=1),
        dilation: int = Input(default=12, description="px to dilate the mask"),
        blur_strength: int = Input(default=30),
        feather: int = Input(default=16, description="px edge feather, 0=hard"),
    ) -> Output:
        if media_type == "video":
            return self._predict_video(
                str(media), regions, box_threshold, dilation, blur_strength, feather
            )
        return self._predict_image(
            str(media), regions, box_threshold, dilation, blur_strength, feather
        )

    def _predict_image(self, path, regions, box_threshold, dilation, blur_strength, feather) -> Output:
        frame = cv2.imread(path)
        boxes, max_conf = self._detect(frame, regions, box_threshold)
        out_path = tempfile.mktemp(suffix=".jpg")

        if not boxes:
            # Fail-closed: blur everything, report 0 regions → manual review.
            full = np.full(frame.shape[:2], 255, np.uint8)
            cv2.imwrite(out_path, self._composite(frame, full, blur_strength, feather))
            return Output(media=Path(out_path), detected_regions=0, max_confidence=max_conf)

        self.sam2_image.set_image(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        mask = np.zeros(frame.shape[:2], np.uint8)
        for box in boxes:
            masks, _scores, _ = self.sam2_image.predict(
                box=np.array(box)[None, :], multimask_output=False
            )
            mask = np.maximum(mask, (masks[0] * 255).astype(np.uint8))
        if dilation > 0:
            mask = cv2.dilate(mask, np.ones((dilation, dilation), np.uint8))

        cv2.imwrite(out_path, self._composite(frame, mask, blur_strength, feather))
        return Output(media=Path(out_path), detected_regions=len(boxes), max_confidence=max_conf)

    def _predict_video(self, path, regions, box_threshold, dilation, blur_strength, feather) -> Output:
        cap = cv2.VideoCapture(path)
        fps = cap.get(cv2.CAP_PROP_FPS) or 30
        ok, first = cap.read()
        cap.release()
        if not ok:
            raise RuntimeError("could not read video")

        boxes, max_conf = self._detect(first, regions, box_threshold)
        state = self.sam2_video.init_state(path)
        for i, box in enumerate(boxes):
            # SAM2 takes the box (or its center point) seeded at frame 0.
            self.sam2_video.add_new_points_or_box(
                state, frame_idx=0, obj_id=i, box=np.array(box)
            )

        # Per-frame mask track → composite.
        masks_by_frame = {}
        if boxes:
            for f_idx, _obj_ids, mask_logits in self.sam2_video.propagate_in_video(state):
                m = (mask_logits[0, 0] > 0).cpu().numpy().astype(np.uint8) * 255
                masks_by_frame[f_idx] = m

        cap = cv2.VideoCapture(path)
        w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        silent = tempfile.mktemp(suffix=".mp4")
        writer = cv2.VideoWriter(silent, cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))
        idx = 0
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            mask = masks_by_frame.get(idx)
            if mask is None:
                mask = np.full((h, w), 255, np.uint8) if not boxes else np.zeros((h, w), np.uint8)
            elif dilation > 0:
                mask = cv2.dilate(mask, np.ones((dilation, dilation), np.uint8))
            writer.write(self._composite(frame, mask, blur_strength, feather))
            idx += 1
        cap.release()
        writer.release()

        out_path = tempfile.mktemp(suffix=".mp4")
        self._mux_audio(silent, path, out_path)
        return Output(media=Path(out_path), detected_regions=len(boxes), max_confidence=max_conf)

# veil-autoblur — single-model auto-blur (Strategy B)

Collapses the whole pipeline (detect → track → composite) into **one** hosted
Replicate model. The orchestrator then makes a single prediction per asset with
one webhook, instead of chaining Grounding DINO → SAM2 → ffmpeg across three
serverless round-trips.

## Build & push

Requires Docker + the [cog CLI](https://github.com/replicate/cog) + a Replicate account.

```bash
cd auto-blur/cog
cog build                                   # builds the GPU image locally
cog predict -i media=@../NSFW.png -i media_type=image   # optional local smoke test
cog push r8.im/<your-username>/veil-autoblur
```

`cog push` prints the version hash. Then in the app:

```env
# .env.local / Vercel project env
REPLICATE_VEIL_AUTOBLUR_VERSION=<hash>
```

When that var is set, `lib/blur/state.ts` `startPipeline()` routes ingest to the
single-call Cog path (stage `cog`) instead of the multi-stage chain — no other
code changes needed.

## Interface

**Input:** `media` (file), `media_type` (`image|video`), `regions`,
`box_threshold`, `dilation`, `blur_strength`, `feather`.

**Output:** `{ media: <blurred file>, detected_regions: int, max_confidence: float }`.

Fail-closed: when nothing is detected the model blurs the **entire** frame and
returns `detected_regions: 0`, so `onCogComplete` routes the job to
`manual_review` and never auto-publishes.

## Caveats

- `predict.py` is logic-complete but **not GPU-run in this repo** — verify the
  `groundingdino-py` / `sam2` APIs and the pinned weight URLs in `cog.yaml` at
  build time; they drift between releases.
- Long videos still process in one call here (ffmpeg on the GPU box). For very
  long assets, combine with chunking (P4).

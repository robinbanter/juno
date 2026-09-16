import sharp from "sharp";

// NOTE: sharp is a native Node module — it is NOT available in the Edge
// runtime. Any route or worker that calls this must run on Node.js
// (`export const runtime = "nodejs"`).

export async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetch ${res.status} for ${url.split("?")[0]}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Fraction of the mask that is "on" (white), in 0..1.
 *
 * grounded_sam always returns a mask file — even when it detects nothing, the
 * mask is simply all-black. So "no region detected" is an ~all-black mask, not
 * a missing file. The pipeline fails closed below a tiny coverage threshold.
 */
export async function maskCoverage(maskUrl: string): Promise<number> {
  const buf = await fetchBuffer(maskUrl);
  const stats = await sharp(buf).toColourspace("b-w").stats();
  return (stats.channels[0]?.mean ?? 0) / 255;
}

export type BlurOptions = {
  /** Gaussian blur strength applied inside the region (higher = heavier). */
  blurSigma?: number;
  /**
   * Edge feather radius in px. 0 = hard cutoff (legacy). Higher = softer,
   * more natural falloff. Feathering is OUTWARD ONLY so the fully-blurred
   * core keeps the mask's original coverage; the softness extends into the
   * surrounding area instead of eating into the masked region.
   */
  featherSigma?: number;
};

/**
 * Turn the B&W mask into a soft alpha channel sized to the image.
 *
 * white = blur here, black = keep sharp. With featherSigma > 0 we composite
 * `max(hardMask, blur(hardMask))` so the inside stays fully opaque (coverage
 * preserved exactly) while the boundary ramps 255→0 outward over the feather
 * band — the blur fades into the sharp original instead of stopping abruptly.
 */
async function buildAlpha(
  maskBuf: Buffer,
  width: number,
  height: number,
  featherSigma: number,
): Promise<Buffer> {
  const hard = await sharp(maskBuf)
    .resize(width, height, { fit: "fill" })
    .toColourspace("b-w")
    .toBuffer();

  if (featherSigma < 0.3) return hard; // sharp.blur() requires sigma >= 0.3

  const soft = await sharp(hard).blur(featherSigma).toBuffer();

  // `lighten` = per-pixel max → inside stays 255 (full coverage preserved),
  // outside gets the decaying half of the ramp (outward-only feather).
  return sharp(hard)
    .composite([{ input: soft, blend: "lighten" }])
    .toColourspace("b-w")
    .png()
    .toBuffer();
}

/**
 * Apply a heavy Gaussian blur inside the masked region, blended into the sharp
 * original via a feathered alpha edge. Operates on in-memory buffers.
 */
export async function compositeBlurBuffers(
  imgBuf: Buffer,
  maskBuf: Buffer,
  opts: BlurOptions = {},
): Promise<Buffer> {
  const blurSigma = opts.blurSigma ?? Number(process.env.BLUR_STRENGTH ?? 30);
  const featherSigma =
    opts.featherSigma ?? Number(process.env.BLUR_FEATHER ?? 12);

  const base = sharp(imgBuf);
  const { width, height } = await base.metadata();
  if (!width || !height) throw new Error("could not read image dimensions");

  // Fully-blurred, 3-channel copy of the whole image (strip any alpha so the
  // mask we join below becomes the sole alpha channel).
  const blurred = await base.clone().blur(blurSigma).removeAlpha().toBuffer();

  const alpha = await buildAlpha(maskBuf, width, height, featherSigma);

  const blurredMasked = await sharp(blurred)
    .joinChannel(alpha)
    .png()
    .toBuffer();

  // Composite the masked-blur layer over the sharp original.
  return sharp(imgBuf)
    .removeAlpha()
    .composite([{ input: blurredMasked, blend: "over" }])
    .jpeg({ quality: 85 })
    .toBuffer();
}

/**
 * URL-based entry point (production path): fetch the source image + mask, then
 * composite. mask: white = blur here, black = keep sharp.
 *
 * @param imageUrl  source image (HTTP(S) URL — e.g. a signed blob URL)
 * @param maskUrl   the clean B&W mask (grounded_sam output index 2)
 */
export async function compositeImageBlur(
  imageUrl: string,
  maskUrl: string,
  opts: BlurOptions = {},
): Promise<Buffer> {
  const [imgBuf, maskBuf] = await Promise.all([
    fetchBuffer(imageUrl),
    fetchBuffer(maskUrl),
  ]);
  return compositeBlurBuffers(imgBuf, maskBuf, opts);
}

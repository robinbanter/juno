// Procedural PNG generator for demo content (no native deps — zlib only).
// Produces a colorful gradient "premium" image and a degraded low-res preview.
import { deflateSync } from "node:zlib";

function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(
  size: number,
  pixel: (x: number, y: number) => [number, number, number],
): Buffer {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y);
      raw[p++] = r;
      raw[p++] = g;
      raw[p++] = b;
      raw[p++] = 255;
    }
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Two-tone diagonal gradient with soft radial highlight, seeded per post.
function gradient(seed: number) {
  const a = [(seed * 53) % 256, (seed * 97) % 256, (seed * 193) % 256];
  const b = [(seed * 131) % 256, (seed * 31) % 256, (seed * 71) % 256];
  return (x: number, y: number, size: number): [number, number, number] => {
    const t = (x + y) / (2 * size);
    const cx = size * 0.5;
    const cy = size * 0.42;
    const d = Math.hypot(x - cx, y - cy) / size;
    const glow = Math.max(0, 1 - d * 1.6) * 0.5;
    const mix = (i: number) =>
      Math.min(255, Math.round(a[i] * (1 - t) + b[i] * t + glow * 180));
    return [mix(0), mix(1), mix(2)];
  };
}

/** Full-resolution "premium" image. */
export function makeFull(seed: number, size = 768): Buffer {
  const g = gradient(seed);
  return encodePng(size, (x, y) => g(x, y, size));
}

/** Degraded preview: rendered at low res then nearest-neighbor upscaled (blocky/blurry). */
export function makePreview(seed: number, size = 384, blocks = 16): Buffer {
  const g = gradient(seed);
  const cell = size / blocks;
  return encodePng(size, (x, y) => {
    const bx = Math.floor(x / cell) * cell + cell / 2;
    const by = Math.floor(y / cell) * cell + cell / 2;
    return g(bx, by, size);
  });
}

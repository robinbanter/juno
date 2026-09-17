// Generates Juno's PWA and favicon set from one vector source.
//
// Drawn here rather than resized from a bitmap so the mark stays crisp at 32px
// (the browser tab) and 512px (the PWA splash) without shipping four artboards.
// The palette is the same one `app/globals.css` defines under `.juno`:
// canvas --j-bg #0d0b12, brand --j-brand #ffb020.
import { mkdirSync } from "node:fs";
import sharp from "sharp";

/**
 * The banded gas giant, matching `components/juno/ui/JunoMark`.
 *
 * Bands are clipped to the planet circle and drawn at low opacity over the
 * amber sphere, so the silhouette reads as a disc at small sizes and the
 * banding only resolves when there is room for it.
 */
const svg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="planet" cx="35%" cy="30%" r="80%">
      <stop offset="0%" stop-color="#ffe066"/>
      <stop offset="45%" stop-color="#ffb020"/>
      <stop offset="100%" stop-color="#8f5600"/>
    </radialGradient>
    <clipPath id="disc"><circle cx="256" cy="256" r="168"/></clipPath>
  </defs>
  <rect width="512" height="512" fill="#0d0b12"/>
  <circle cx="256" cy="256" r="168" fill="url(#planet)"/>
  <g clip-path="url(#disc)" fill="#5c3500" opacity="0.28">
    <rect x="88" y="168" width="336" height="26" rx="13"/>
    <rect x="88" y="232" width="336" height="18" rx="9"/>
    <rect x="88" y="286" width="336" height="30" rx="15"/>
    <rect x="88" y="348" width="336" height="16" rx="8"/>
  </g>
</svg>`;

async function makeIcon(size, output) {
  await sharp(Buffer.from(svg(size))).png().toFile(output);
}

mkdirSync("public", { recursive: true });
await Promise.all([
  makeIcon(192, "public/icon-192.png"),
  makeIcon(512, "public/icon-512.png"),
  makeIcon(180, "public/apple-touch-icon.png"),
  // Next serves this as the favicon.
  makeIcon(256, "app/icon.png"),
]);

console.log("icons written: 192, 512, apple-touch (180), app/icon (256)");

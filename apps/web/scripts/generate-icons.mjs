// Renders the app icon to PNG at every size a PWA install needs.
//
// iOS ignores SVG for home-screen icons (it falls back to a page
// screenshot), and Chrome's install criteria expect raster 192/512 icons,
// so the SVG in public/icons isn't enough on its own. There's no image
// library in this repo, so this draws the same design analytically —
// supersampled for antialiasing — and encodes PNG by hand with zlib.
//
// Run: node apps/web/scripts/generate-icons.mjs   (outputs are committed)
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, "../public/icons");
mkdirSync(outDir, { recursive: true });

const BG = [0x1c, 0x1c, 0x1f];
const RING = [0x3a, 0x3a, 0x40];
const AMBER = [0xff, 0xb0, 0x20];
const YELLOW = [0xf5, 0xc4, 0x00];
const SS = 4; // supersampling per axis

/** Design in a 512-unit space, matching public/icons/icon.svg. */
function sample(x, y, { maskable }) {
  const cx = 256;
  const cy = 256;
  // Maskable icons must keep content inside the central 80% safe zone and
  // fill the whole square (the OS applies its own mask shape).
  const scale = maskable ? 0.78 : 1;
  const dx = (x - cx) / scale;
  const dy = (y - cy) / scale;
  const r = Math.hypot(dx, dy);

  if (!maskable) {
    // Rounded-square background, radius 96.
    const qx = Math.max(Math.abs(x - cx) - (256 - 96), 0);
    const qy = Math.max(Math.abs(y - cy) - (256 - 96), 0);
    if (Math.hypot(qx, qy) > 96) return null; // transparent
  }

  // Cue marker at 12 o'clock (drawn above the rings).
  if (Math.abs(dx) <= 10 && dy >= -196 && dy <= -126) return YELLOW;
  if (r <= 22) return AMBER; // centre spindle
  if (Math.abs(r - 120) <= 7) return AMBER; // inner ring
  if (Math.abs(r - 180) <= 9) return RING; // outer platter edge
  return BG;
}

function render(size, options) {
  const pixels = Buffer.alloc(size * size * 4);
  const unit = 512 / size;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const color = sample((px + (sx + 0.5) / SS) * unit, (py + (sy + 0.5) / SS) * unit, options);
          if (!color) continue;
          r += color[0];
          g += color[1];
          b += color[2];
          a += 1;
        }
      }
      const i = (py * size + px) * 4;
      const n = SS * SS;
      if (a > 0) {
        // Colour averaged over covered samples only; coverage becomes alpha.
        pixels[i] = Math.round(r / a);
        pixels[i + 1] = Math.round(g / a);
        pixels[i + 2] = Math.round(b / a);
      }
      pixels[i + 3] = Math.round((a / n) * 255);
    }
  }
  return pixels;
}

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type RGBA
  // Each scanline is prefixed with filter type 0 (none).
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const outputs = [
  { file: "icon-192.png", size: 192, maskable: false },
  { file: "icon-512.png", size: 512, maskable: false },
  { file: "icon-maskable-512.png", size: 512, maskable: true },
  // iOS draws its own rounded mask and shows transparency as black, so the
  // apple-touch-icon uses the full-bleed (maskable) variant.
  { file: "apple-touch-icon.png", size: 180, maskable: true },
  { file: "favicon-32.png", size: 32, maskable: false },
];

for (const { file, size, maskable } of outputs) {
  writeFileSync(path.join(outDir, file), encodePng(size, render(size, { maskable })));
  console.log(`wrote ${file} (${size}x${size})`);
}

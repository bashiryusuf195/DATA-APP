/**
 * Draws field-map rectangles directly onto each PNG template using pngjs.
 * RED boxes = text fields, BLUE boxes = photo zone, GREEN boxes = QR zone.
 * Output: overlay-<name>.png in project root.
 *
 * Run: node scripts/overlay-fields.js
 */

const fs    = require("fs");
const path  = require("path");
const { PNG } = require("pngjs");

const { FIELD_MAP } = require("../dist/modules/transactions/pdf/field-map");
const TEMPLATES_DIR = path.resolve(__dirname, "../src/modules/transactions/pdf/templates");

function drawRect(png, x1, y1, x2, y2, r, g, b) {
  const W = png.width, H = png.height;
  x1 = Math.max(0, Math.round(x1)); y1 = Math.max(0, Math.round(y1));
  x2 = Math.min(W-1, Math.round(x2)); y2 = Math.min(H-1, Math.round(y2));
  // Draw 2-pixel thick border
  for (let t = 0; t < 2; t++) {
    for (let x = x1+t; x <= x2-t; x++) {
      setPixel(png, x, y1+t, r, g, b);
      setPixel(png, x, y2-t, r, g, b);
    }
    for (let y = y1+t; y <= y2-t; y++) {
      setPixel(png, x1+t, y, r, g, b);
      setPixel(png, x2-t, y, r, g, b);
    }
  }
}

function setPixel(png, x, y, r, g, b) {
  if (x < 0 || x >= png.width || y < 0 || y >= png.height) return;
  const idx = (png.width * y + x) * 4;
  png.data[idx]   = r;
  png.data[idx+1] = g;
  png.data[idx+2] = b;
  png.data[idx+3] = 255;
}

// Label a box with a small marker at top-left
function labelBox(png, x, y, text) {
  // Just draw a small filled square at the corner
  for (let dy = 0; dy < 6; dy++)
    for (let dx = 0; dx < 6; dx++)
      setPixel(png, Math.round(x)+dx, Math.round(y)+dy, 255, 165, 0);
}

async function overlayTemplate(key, map) {
  const tplPath = path.join(TEMPLATES_DIR, map.templateFile);
  const raw = fs.readFileSync(tplPath);

  return new Promise((resolve, reject) => {
    const png = PNG.sync.read(raw);
    const W   = png.width;
    const H   = png.height;

    console.log(`\n${key}: ${W}×${H}px`);

    // Text fields (RED)
    for (const [name, def] of Object.entries(map.fields)) {
      const x1 = def.x * W;
      const y1 = def.y * H;
      const x2 = x1 + def.w * W;
      const y2 = y1 + def.h * H;
      drawRect(png, x1, y1, x2, y2, 220, 30, 30);
      labelBox(png, x1, y1);
      console.log(`  RED  ${name.padEnd(26)} (${x1.toFixed(0)},${y1.toFixed(0)})→(${x2.toFixed(0)},${y2.toFixed(0)})`);
    }

    // Photo zone (BLUE)
    if (map.photo) {
      const { x, y, w, h } = map.photo;
      const x1 = x * W, y1 = y * H, x2 = x1 + w * W, y2 = y1 + h * H;
      drawRect(png, x1, y1, x2, y2, 30, 80, 220);
      console.log(`  BLUE [photo]                      (${x1.toFixed(0)},${y1.toFixed(0)})→(${x2.toFixed(0)},${y2.toFixed(0)})`);
    }

    // QR zone (GREEN)
    if (map.qr) {
      // QR zone: x/y are fractions of PDF dims but we need PNG fractions
      // The QR coordinates in field-map use PDF fractions directly.
      // To convert to PNG pixel positions:
      //   png_x = qr.x * W_pdf / W_pdf * W_png = qr.x * W_png  (since same fraction)
      //   png_y = qr.y * H_pdf / H_pdf * H_png = qr.y * H_png
      //   size  = qr.w * W_pdf * H_png / H_pdf  (QR size in PNG pixels, square)
      const { x, y, w } = map.qr;
      const qrSizePdf = w * map.W;
      const qrSizePng = (qrSizePdf / map.H) * H;  // scale to PNG pixels
      const x1 = x * W, y1 = y * H;
      const x2 = x1 + (w * map.W / map.W) * W;    // = x1 + w * W  (same fraction)
      const y2 = y1 + qrSizePng;
      drawRect(png, x1, y1, x2, y2, 30, 180, 30);
      console.log(`  GRN  [qr]                         (${x1.toFixed(0)},${y1.toFixed(0)})→(${x2.toFixed(0)},${y2.toFixed(0)})`);
    }

    const outPath = path.resolve(__dirname, `../overlay-${key}.png`);
    const outBuf  = PNG.sync.write(png, { colorType: 2 });
    fs.writeFileSync(outPath, outBuf);
    console.log(`  → ${outPath}`);
    resolve();
  });
}

(async () => {
  for (const [key, map] of Object.entries(FIELD_MAP)) {
    await overlayTemplate(key, map);
  }
  console.log("\nDone — open overlay-*.png to inspect field positions.");
})().catch(e => { console.error(e); process.exit(1); });

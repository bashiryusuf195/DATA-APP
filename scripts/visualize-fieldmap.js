/**
 * Visualize field-map coordinates overlaid on each PNG template.
 * Draws translucent red rectangles for text fields and blue for photo/QR zones.
 * Output: calibration-<name>.png in project root — view with any image viewer.
 *
 * Run: node scripts/visualize-fieldmap.js
 *
 * No npm deps beyond what's already installed — uses only the built JS.
 */

const fs   = require("fs");
const path = require("path");

// Load the compiled field-map (after npm run build)
const { FIELD_MAP } = require("../dist/modules/transactions/pdf/field-map");
const TEMPLATES_DIR = path.resolve(__dirname, "../src/modules/transactions/pdf/templates");

// ── Minimal PNG read/write using pure JS ─────────────────────────────────────
// We need to draw colored rectangles on PNG files without external deps.
// Strategy: use the jimp-like approach but with the pngjs pattern.
// Since we don't have canvas/jimp, we'll use a different trick:
// output the field coordinates as a JSON report instead, then render
// a separate HTML visualization.

// Actually, let's just output precise JSON with pixel coords for each template.
// Then we'll manually verify.

const SCALE = 1; // fields are expressed as fractions of PNG dims

function analyzeTemplate(key, map) {
  const tplPath = path.join(TEMPLATES_DIR, map.templateFile);
  const buf     = fs.readFileSync(tplPath);
  const pngW    = buf.readUInt32BE(16);
  const pngH    = buf.readUInt32BE(20);

  console.log(`\n=== ${key} ===`);
  console.log(`PNG: ${pngW} × ${pngH} px   PDF: ${map.W} × ${map.H} pt`);
  console.log(`Scale: px→pt X=${(map.W/pngW).toFixed(4)}  Y=${(map.H/pngH).toFixed(4)}\n`);

  // Fields
  for (const [name, def] of Object.entries(map.fields)) {
    const pxX = Math.round(def.x * pngW);
    const pxY = Math.round(def.y * pngH);
    const pxW = Math.round(def.w * pngW);
    const pxH = Math.round(def.h * pngH);
    const ptX = (def.x * map.W).toFixed(1);
    const ptY = (map.H - (def.y + def.h) * map.H).toFixed(1);  // PDF bottom of box
    const ptYt = (map.H - def.y * map.H).toFixed(1);           // PDF top of box
    console.log(
      `  ${name.padEnd(26)} px(${pxX},${pxY},w${pxW},h${pxH})   pt x=${ptX} y_bot=${ptY} y_top=${ptYt}   size=${def.size||9}`
    );
  }

  if (map.photo) {
    const { x, y, w, h } = map.photo;
    console.log(`  ${"[photo]".padEnd(26)} px(${Math.round(x*pngW)},${Math.round(y*pngH)},w${Math.round(w*pngW)},h${Math.round(h*pngH)})   pt x=${(x*map.W).toFixed(1)} y_bot=${(map.H-(y+h)*map.H).toFixed(1)}`);
  }
  if (map.qr) {
    const { x, y, w } = map.qr;
    const qrSize = w * map.W;
    console.log(`  ${"[qr]".padEnd(26)} px(${Math.round(x*pngW)},${Math.round(y*pngH)},w${Math.round(w*pngW)},h${Math.round(w*pngW)})   pt x=${(x*map.W).toFixed(1)} y_bot=${(map.H - y*map.H - qrSize).toFixed(1)}`);
  }
}

for (const [key, map] of Object.entries(FIELD_MAP)) {
  analyzeTemplate(key, map);
}

import { readFileSync } from "fs";
import { resolve } from "path";
import { PNG } from "pngjs";

// Scan the comparison image to find form element positions
// This image has the template + blue rectangles drawn on it
const buf = readFileSync(resolve("docs/identity-reference/extracted/photo-box-comparison.png"));
const png = new PNG();
await new Promise((res, rej) => png.parse(buf, (err) => err ? rej(err) : res()));
const { width: W, height: H, data } = png;
console.log(`photo-box-comparison.png: ${W} x ${H}`);

function pixel(x, y) {
  const i = (y * W + x) * 4;
  return { r: data[i], g: data[i+1], b: data[i+2], a: data[i+3] };
}

function avgDarkness(row, xFrac0, xFrac1) {
  const x0 = Math.round(W * xFrac0), x1 = Math.round(W * xFrac1);
  let sum = 0;
  for (let x = x0; x < x1; x++) {
    const i = (row * W + x) * 4;
    sum += 255 - (0.299*data[i] + 0.587*data[i+1] + 0.114*data[i+2]);
  }
  return sum / (x1 - x0);
}

function findBands(xFrac0, xFrac1, threshold = 15) {
  const bands = [];
  let inBand = false, bStart = 0, bSum = 0, bCnt = 0, bPeak = 0;
  for (let y = 0; y < H; y++) {
    const d = avgDarkness(y, xFrac0, xFrac1);
    if (d > threshold) {
      if (!inBand) { inBand = true; bStart = y; bSum = 0; bCnt = 0; bPeak = 0; }
      if (d > bPeak) bPeak = d;
      bSum += y / H; bCnt++;
    } else if (inBand) {
      inBand = false;
      bands.push({ top: bStart/H, bot: (bStart+bCnt-1)/H, center: bSum/bCnt, peak: bPeak, h: bCnt });
    }
  }
  return bands;
}

// Find blue-ish rectangles (the debug photo overlays)
function findBlueRegions() {
  const rows = [];
  for (let y = 0; y < H; y++) {
    let blueCount = 0;
    const x0 = Math.round(W*0.01), x1 = Math.round(W*0.99);
    let blueMinX = W, blueMaxX = 0;
    for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * 4;
      const r = data[i], g = data[i+1], b = data[i+2];
      // Blue: high b, low r, low g
      if (b > 150 && b > r * 1.5 && b > g * 1.5) {
        blueCount++;
        if (x < blueMinX) blueMinX = x;
        if (x > blueMaxX) blueMaxX = x;
      }
    }
    if (blueCount > 5) rows.push({ y, yFrac: y/H, blueCount, xMin: blueMinX/W, xMax: blueMaxX/W });
  }
  return rows;
}

console.log("\n=== LABEL COLUMN bands (x=2-20%) ===");
const labelBands = findBands(0.02, 0.20, 12);
for (const b of labelBands) {
  console.log(`  y_top=${b.top.toFixed(4)} y_bot=${b.bot.toFixed(4)} center=${b.center.toFixed(4)} peak=${b.peak.toFixed(1)} h=${b.h}px`);
}

console.log("\n=== FULL-WIDTH dark bands (x=5-95%) ===");
const fullBands = findBands(0.05, 0.95, 25);
for (const b of fullBands) {
  console.log(`  y_top=${b.top.toFixed(4)} y_bot=${b.bot.toFixed(4)} center=${b.center.toFixed(4)} peak=${b.peak.toFixed(1)} h=${b.h}px`);
}

console.log("\n=== BLUE debug rectangles ===");
const blueRows = findBlueRegions();
if (blueRows.length === 0) {
  console.log("  No blue pixels found");
} else {
  // Find contiguous groups
  let gStart = blueRows[0], gPrev = blueRows[0];
  const groups = [];
  for (let i = 1; i < blueRows.length; i++) {
    const r = blueRows[i];
    if (r.y - gPrev.y > 3) {
      groups.push({ yTop: gStart.yFrac, yBot: gPrev.yFrac, xMin: Math.min(...groups.map?.(g=>g.xMin) ?? [gStart.xMin]), xMax: Math.max(...groups.map?.(g=>g.xMax) ?? [gStart.xMax]), rows: i });
      // recalculate x range for the group
      const groupRows = blueRows.slice(groups.length > 1 ? groups[groups.length-2].rows : 0, i);
      groups[groups.length-1].xMin = Math.min(...groupRows.map(r=>r.xMin));
      groups[groups.length-1].xMax = Math.max(...groupRows.map(r=>r.xMax));
      gStart = r;
    }
    gPrev = r;
  }
  // Last group
  const lastGroup = blueRows.slice(groups.reduce((s,g)=>s+g.rows,0));
  if (lastGroup.length > 0) {
    groups.push({
      yTop: gStart.yFrac, yBot: gPrev.yFrac,
      xMin: Math.min(...lastGroup.map(r=>r.xMin)),
      xMax: Math.max(...lastGroup.map(r=>r.xMax)),
      rows: lastGroup.length
    });
  }

  // Simple approach: just print all rows
  console.log(`  Total blue rows: ${blueRows.length}`);
  console.log(`  First blue row: y=${blueRows[0].yFrac.toFixed(4)} x=${blueRows[0].xMin.toFixed(4)}-${blueRows[0].xMax.toFixed(4)}`);
  console.log(`  Last blue row:  y=${blueRows[blueRows.length-1].yFrac.toFixed(4)} x=${blueRows[blueRows.length-1].xMin.toFixed(4)}-${blueRows[blueRows.length-1].xMax.toFixed(4)}`);

  // Find x extent from all blue rows
  const allXMin = Math.min(...blueRows.map(r=>r.xMin));
  const allXMax = Math.max(...blueRows.map(r=>r.xMax));
  console.log(`  Blue rect extents: x=${allXMin.toFixed(4)}-${allXMax.toFixed(4)}, y=${blueRows[0].yFrac.toFixed(4)}-${blueRows[blueRows.length-1].yFrac.toFixed(4)}`);
}

// Print sample pixels at key positions
console.log("\n=== Sample pixels at key positions ===");
const tests = [
  [0.05, 0.15], [0.15, 0.15], [0.30, 0.15], [0.50, 0.15],
  [0.05, 0.20], [0.15, 0.20], [0.30, 0.20], [0.50, 0.20],
  [0.05, 0.30], [0.30, 0.30], [0.50, 0.30],
];
for (const [xf, yf] of tests) {
  const p = pixel(Math.round(W*xf), Math.round(H*yf));
  console.log(`  (x=${xf}, y=${yf}): rgb(${p.r},${p.g},${p.b})`);
}

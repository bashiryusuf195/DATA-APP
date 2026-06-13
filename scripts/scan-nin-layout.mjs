import { readFileSync } from "fs";
import { resolve } from "path";
import { PNG } from "pngjs";

const buf = readFileSync(resolve("src/modules/transactions/pdf/templates/NIN Information.png"));
const png = new PNG();
await new Promise((res, rej) => png.parse(buf, (err) => err ? rej(err) : res()));
const { width: W, height: H, data } = png;

function avgDarkness(row, xFrac0, xFrac1) {
  const x0 = Math.round(W * xFrac0), x1 = Math.round(W * xFrac1);
  let sum = 0;
  for (let x = x0; x < x1; x++) {
    const i = (row * W + x) * 4;
    sum += 255 - (0.299*data[i] + 0.587*data[i+1] + 0.114*data[i+2]);
  }
  return sum / (x1 - x0);
}

// Find "band peaks" — local maxima in darkness profile
function findBands(xFrac0, xFrac1, threshold = 20) {
  const profile = [];
  for (let y = 0; y < H; y++) profile.push({ y, d: avgDarkness(y, xFrac0, xFrac1) });

  const bands = [];
  let inBand = false, bStart = 0, bPeak = 0, bPeakY = 0, bSum = 0, bCnt = 0;
  for (const { y, d } of profile) {
    if (d > threshold) {
      if (!inBand) { inBand = true; bStart = y; bPeak = 0; bPeakY = y; bSum = 0; bCnt = 0; }
      if (d > bPeak) { bPeak = d; bPeakY = y; }
      bSum += y / H; bCnt++;
    } else if (inBand) {
      inBand = false;
      bands.push({
        top:    bStart / H,
        bot:    (y - 1) / H,
        center: bSum / bCnt,
        peak:   bPeak,
        peakY:  bPeakY / H,
        hPx:    y - bStart,
      });
    }
  }
  return bands;
}

console.log(`PNG: ${W} x ${H}`);
console.log("Coordinate system: fractions of image height (top=0, bot=1)");
console.log("PDF field def.y = band.top (image-space top-left origin)");
console.log();

// ── Label column (x=3-22%) ───────────────────────────────────────────────────
console.log("=== LABEL COLUMN bands (x=3-22%, threshold=15) ===");
const labelBands = findBands(0.03, 0.22, 15);
for (const b of labelBands) {
  console.log(`  top=${b.top.toFixed(4)} bot=${b.bot.toFixed(4)} center=${b.center.toFixed(4)} peak=${b.peak.toFixed(1)} h=${b.hPx}px`);
}
console.log();

// ── Value / right-of-photo column (x=48-90%) ────────────────────────────────
console.log("=== RIGHT COLUMN bands (x=48-90%, threshold=15) ===");
const rightBands = findBands(0.48, 0.90, 15);
for (const b of rightBands) {
  console.log(`  top=${b.top.toFixed(4)} bot=${b.bot.toFixed(4)} center=${b.center.toFixed(4)} peak=${b.peak.toFixed(1)} h=${b.hPx}px`);
}
console.log();

// ── Full-width scan (for thick bars/separators) ───────────────────────────────
console.log("=== FULL-WIDTH bands (x=5-95%, threshold=30) ===");
const fullBands = findBands(0.05, 0.95, 30);
for (const b of fullBands) {
  console.log(`  top=${b.top.toFixed(4)} bot=${b.bot.toFixed(4)} center=${b.center.toFixed(4)} peak=${b.peak.toFixed(1)} h=${b.hPx}px`);
}
console.log();

// ── White-box detector (photo placeholder, x=24-48%) ─────────────────────────
console.log("=== PHOTO PLACEHOLDER (x=24-48%, brightness > 230) ===");
function brightBands(xFrac0, xFrac1, threshold = 230) {
  const bands = [];
  let inBand = false, bStart = 0;
  for (let y = 0; y < H; y++) {
    const x0 = Math.round(W * xFrac0), x1 = Math.round(W * xFrac1);
    let sum = 0;
    for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * 4;
      sum += 0.299*data[i] + 0.587*data[i+1] + 0.114*data[i+2];
    }
    const avg = sum / (x1 - x0);
    if (avg > threshold) {
      if (!inBand) { inBand = true; bStart = y; }
    } else if (inBand) {
      inBand = false;
      if (y - bStart > 5) bands.push({ top: bStart/H, bot: (y-1)/H, hPx: y-bStart });
    }
  }
  return bands;
}
const photoBands = brightBands(0.24, 0.48, 230);
for (const b of photoBands) {
  console.log(`  top=${b.top.toFixed(4)} bot=${b.bot.toFixed(4)} h=${b.hPx}px`);
}

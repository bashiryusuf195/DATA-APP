/**
 * Generates clean identity-verification PDF templates from the sample originals.
 *
 * The sample PDFs in templates/sample/ contain baked-in personal data (photo, name,
 * NIN, QR, etc.) from the provider's demo identity.  This script masks those zones
 * with opaque white rectangles so the production renderer can draw real data on top.
 *
 * Run:  npx tsx scripts/prepare-identity-pdf-templates.ts
 * Output: src/modules/transactions/pdf/templates/{nin-premium,bvn-basic,nin-information,nin-standard}.pdf
 */

import { PDFDocument, rgb } from "pdf-lib";
import * as fs from "fs";
import * as path from "path";

const SAMPLE_DIR  = path.join(__dirname, "../src/modules/transactions/pdf/templates/sample");
const OUT_DIR     = path.join(__dirname, "../src/modules/transactions/pdf/templates");

const WHITE = rgb(1, 1, 1);

interface MaskZone {
  x: number;
  y: number; // pdf-lib page space (from bottom)
  w: number;
  h: number;
}

// ── Per-template mask zones ────────────────────────────────────────────────────
//
// All coordinates are in pdf-lib page space (origin = bottom-left, y increases up).
// Derived from CTM analysis of the vector content streams.
//
// nin-premium  (595.3 × 841.9 pt, A4)
// Card interior is white.  The outer card background fills x≈78-539, y≈546-747.
// Personal-data zones identified via CTM: page_x = 0.5443·tx + 81.65,
//                                          page_y = −0.5443·ty + 744.48
//
// bvn-basic  (595.3 × 841.9 pt, A4)
// Same card-interior white, similar nested CTM structure.
//
// nin-information / nin-standard  (595.3 × 1008 pt / 595.3 × 841.9 pt)
// Full-page raster XObjects (/I0 Do).  The entire visual is one image so we draw
// opaque white on top of the raster, which works since the renderer overlays text
// after the image in the content stream order.

const MASKS: Record<string, MaskZone[]> = {
  // ── NIN Premium ────────────────────────────────────────────────────────────
  // H = 841.9.  All zones use WHITE (card interior confirmed white via `1 1 1 rg`).
  "nin-premium": [
    // Photo XObject X15 sits at page x≈107-156, y≈626-691.
    // Add a 10pt margin on all sides to be safe.
    { x:  95, y: 614, w:  75, h:  90 },

    // Name block: surname at y≈671, given at y≈658.
    // NIN large number runs from x≈275 to x≈430 at y≈644, size ≈20pt.
    // QR (X13) at x≈260-315, y≈654-709 — included in the right-hand zone.
    // Single wide rect covers all text + QR in the right panel:
    { x: 163, y: 630, w: 205, h:  68 },  // surname + given names
    { x: 163, y: 608, w: 380, h:  28 },  // DOB / gender / issue date row + NIN

    // QR code (XObject X13) at page x≈260-315, y≈654-709
    { x: 252, y: 646, w:  72, h:  72 },
  ],

  // ── BVN Basic ──────────────────────────────────────────────────────────────
  // H = 841.9, same page size.  Card interior white.
  // Nested CTM similar to nin-premium; personal data spans most of the card.
  "bvn-basic": [
    // Photo — upper-right quadrant of the card
    { x: 243, y: 556, w: 110, h: 120 },

    // Left-column text rows: first_name / middle_name / last_name / dob / gender /
    // marital / phone — approx y range 555-715
    { x:  30, y: 555, w: 215, h: 168 },

    // Right-column extra fields (NIN, enrollment institution/branch, origin/residence
    // state+LGA) — same vertical band
    { x: 248, y: 555, w: 340, h: 168 },

    // Address row below — wider strip
    { x:  30, y: 390, w: 558, h: 170 },
  ],

  // ── NIN Information ────────────────────────────────────────────────────────
  // H = 1008.  Full-page raster background.  White rects drawn on the raster.
  "nin-information": [
    // Photo area (card top-right quadrant)
    { x: 192, y: 1008 - 320, w: 132, h: 185 },

    // Name / DOB / gender text fields (left column)
    { x: 155, y: 1008 - 290, w: 230, h: 148 },

    // NIN large number
    { x: 145, y: 1008 - 380, w: 330, h:  42 },

    // Footer rows: tracking_id, phone, residence state/LGA, birth state/LGA, address
    { x: 130, y: 1008 - 465, w: 390, h:  80 },
  ],

  // ── NIN Standard ──────────────────────────────────────────────────────────
  // H = 1008.  Full-page raster background.
  "nin-standard": [
    // Photo
    { x:  40, y: 1008 - 205, w: 110, h: 132 },

    // Surname + given names (right of photo)
    { x: 140, y: 1008 - 205, w: 290, h: 135 },

    // DOB
    { x: 140, y: 1008 - 240, w: 200, h:  45 },

    // NIN large
    { x:  90, y: 1008 - 270, w: 260, h:  45 },

    // QR code
    { x: 320, y: 1008 - 220, w:  90, h:  90 },
  ],
};

async function maskTemplate(name: string): Promise<void> {
  const samplePath = path.join(SAMPLE_DIR, name + ".pdf");
  const outPath    = path.join(OUT_DIR,    name + ".pdf");

  if (!fs.existsSync(samplePath)) {
    console.error(`  [SKIP] sample not found: ${samplePath}`);
    return;
  }

  const pdfDoc = await PDFDocument.load(fs.readFileSync(samplePath));
  const [page] = pdfDoc.getPages();
  const H = page.getHeight();
  const W = page.getWidth();

  const zones = MASKS[name];
  if (!zones || zones.length === 0) {
    console.warn(`  [WARN] no mask zones defined for ${name} — copying as-is`);
    fs.copyFileSync(samplePath, outPath);
    return;
  }

  for (const z of zones) {
    // Clamp to page bounds to avoid pdf-lib warnings
    const x = Math.max(0, z.x);
    const y = Math.max(0, z.y);
    const w = Math.min(z.w, W - x);
    const h = Math.min(z.h, H - y);
    page.drawRectangle({ x, y, width: w, height: h, color: WHITE, opacity: 1 });
  }

  fs.writeFileSync(outPath, Buffer.from(await pdfDoc.save()));
  console.log(`  [OK]   ${name}  (${W.toFixed(0)}×${H.toFixed(0)})  →  ${path.relative(process.cwd(), outPath)}`);
}

(async () => {
  console.log("Generating clean identity-verification PDF templates…\n");
  for (const name of Object.keys(MASKS)) {
    await maskTemplate(name);
  }
  console.log("\nDone. Run `npm run build` to copy templates to dist/.");
})().catch((e) => { console.error(e); process.exit(1); });

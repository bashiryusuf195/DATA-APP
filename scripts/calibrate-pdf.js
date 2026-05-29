/**
 * PDF coordinate calibration tool.
 * Generates debug PDFs with a coordinate grid + field markers overlaid on each template.
 * Run: node scripts/calibrate-pdf.js
 * Output: calibration-*.pdf in the project root
 */

const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const fs = require("fs");
const path = require("path");

const TEMPLATES_DIR = path.join(__dirname, "../dist/modules/transactions/pdf/templates");

// Current field estimates — these get marked with RED dots so we can see how wrong they are.
const CURRENT_ESTIMATES = {
  "nin-information": {
    H: 1008,
    marks: [
      { label: "first_name",       x: 155, yFromTop: 154 },
      { label: "middle_name",      x: 155, yFromTop: 183 },
      { label: "last_name",        x: 155, yFromTop: 213 },
      { label: "date_of_birth",    x: 155, yFromTop: 249 },
      { label: "gender",           x: 155, yFromTop: 285 },
      { label: "photo_TL",         x: 192, yFromTop: 135 },
      { label: "photo_BR",         x: 324, yFromTop: 320 },
      { label: "nin_large",        x: 190, yFromTop: 345 },
      // Footer rows — baselines confirmed from template: tracking=611, residence=595, birth=579, address=561
      { label: "tracking_id",      x: 145, yFromTop: 397 },
      { label: "phone",            x: 360, yFromTop: 397 },
      { label: "residence_state",  x: 145, yFromTop: 413 },
      { label: "residence_lga",    x: 360, yFromTop: 413 },
      { label: "birth_state",      x: 145, yFromTop: 429 },
      { label: "birth_lga",        x: 360, yFromTop: 429 },
      { label: "address",          x: 145, yFromTop: 447 },
    ],
  },
  "bvn-basic": {
    H: 841.9,
    marks: [
      // Row 1 — confirmed from calibration-bvn-basic.pdf green dots
      { label: "first_name",              x: 148, yFromTop: 158 },
      { label: "middle_name",             x: 148, yFromTop: 183 },
      { label: "last_name",               x: 148, yFromTop: 203 },
      { label: "dob",                     x: 148, yFromTop: 223 },
      { label: "gender",                  x: 148, yFromTop: 243 },
      { label: "marital",                 x: 148, yFromTop: 263 },
      { label: "phone",                   x: 148, yFromTop: 283 },
      { label: "photo_TL",                x: 243, yFromTop: 145 },
      { label: "photo_BR",                x: 343, yFromTop: 273 },
      { label: "nin",                     x: 340, yFromTop: 283 },
      // Row 2 — 20 pt spacing estimated; address confirmed from calibration
      { label: "enrollment_institution",  x: 235, yFromTop: 329 },
      { label: "enrollment_branch",       x: 440, yFromTop: 329 },
      { label: "origin_state",            x: 180, yFromTop: 349 },
      { label: "origin_lga",              x: 430, yFromTop: 349 },
      { label: "residence_state",         x: 180, yFromTop: 369 },
      { label: "residence_lga",           x: 430, yFromTop: 369 },
      { label: "address",                 x: 148, yFromTop: 388 },
    ],
  },
  "nin-standard": {
    H: 1008,
    marks: [
      // All positions confirmed from calibration-nin-standard.pdf
      { label: "photo_TL",  x:  47, yFromTop:  82 },  // y=926
      { label: "photo_BR",  x: 139, yFromTop: 200 },  // y=808  (w=92, h=118)
      { label: "surname",   x: 146, yFromTop: 113 },  // y=895
      { label: "given",     x: 146, yFromTop: 150 },  // y=858  (corrected from 146)
      { label: "dob",       x: 146, yFromTop: 182 },  // y=826  (corrected from 178)
      { label: "nin_large", x: 104, yFromTop: 233 },  // y=775
      { label: "qr_TL",    x: 330, yFromTop: 130 },  // y=878  top of 80×80 QR
      { label: "qr_BR",    x: 410, yFromTop: 210 },  // y=798  bottom of 80×80 QR
    ],
  },
  "nin-premium": {
    H: 841.9,
    marks: [
      { label: "photo_TL",   x: 163, yFromTop: 193 },
      { label: "photo_BR",   x: 245, yFromTop: 285 },
      { label: "surname",    x: 248, yFromTop: 257 },  // text baseline (was 250 — corrected to match renderer)
      { label: "given",      x: 248, yFromTop: 280 },  // text baseline
      { label: "dob",        x: 248, yFromTop: 311 },
      { label: "gender",     x: 330, yFromTop: 311 },
      { label: "issue_date", x: 395, yFromTop: 311 },
      { label: "nin_large",  x: 163, yFromTop: 355 },
      { label: "qr_TL",     x: 415, yFromTop: 153 },
    ],
  },
};

async function generateCalibrationPDF(name) {
  const templatePath = path.join(TEMPLATES_DIR, name + ".pdf");
  if (!fs.existsSync(templatePath)) {
    console.error("Template not found:", templatePath);
    return;
  }

  const templateBytes = fs.readFileSync(templatePath);
  const pdfDoc = await PDFDocument.load(templateBytes);
  const [page] = pdfDoc.getPages();
  const W = page.getWidth();
  const H = page.getHeight();

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // ── Grid lines every 50pt ──────────────────────────────────────────────────
  const GRID  = 50;
  const GREY  = rgb(0.55, 0.55, 0.55);
  const RED   = rgb(0.9, 0.1, 0.1);
  const BLUE  = rgb(0.1, 0.1, 0.9);
  const GREEN = rgb(0, 0.7, 0);

  // Horizontal lines (y in pdf-lib = from bottom)
  for (let y = 0; y <= H; y += GRID) {
    page.drawLine({
      start: { x: 0, y }, end: { x: W, y },
      thickness: 0.4, color: GREY, opacity: 0.45,
      dashArray: [4, 4], dashPhase: 0,
    });
    // y-axis labels (left edge)
    const labelY = Math.round(y);
    page.drawText(String(labelY), {
      x: 2, y: Math.max(y + 1, 1),
      size: 5.5, font, color: RED, opacity: 0.85,
    });
  }

  // Vertical lines (x from left)
  for (let x = 0; x <= W; x += GRID) {
    page.drawLine({
      start: { x, y: 0 }, end: { x, y: H },
      thickness: 0.4, color: GREY, opacity: 0.45,
      dashArray: [4, 4], dashPhase: 0,
    });
    // x-axis labels (top of page)
    page.drawText(String(Math.round(x)), {
      x: Math.max(x + 1, 1), y: H - 10,
      size: 5.5, font, color: BLUE, opacity: 0.85,
    });
  }

  // ── Mark current field estimates ──────────────────────────────────────────
  const info = CURRENT_ESTIMATES[name];
  if (info) {
    for (const m of info.marks) {
      // y in pdf-lib (from bottom) = H - yFromTop
      const pdfY = H - m.yFromTop;

      // Draw a small cross / circle at the mark
      page.drawCircle({
        x: m.x, y: pdfY, size: 4,
        borderColor: GREEN, borderWidth: 1.2, opacity: 0.9,
        color: rgb(0, 0.85, 0),
      });
      // Label next to it
      page.drawText(m.label + " (" + m.x + "," + Math.round(pdfY) + ")", {
        x: m.x + 6, y: pdfY - 2,
        size: 5.5, font, color: GREEN, opacity: 0.9,
      });
    }
  }

  // ── Page info header ──────────────────────────────────────────────────────
  page.drawRectangle({
    x: 0, y: H - 18, width: W, height: 18,
    color: rgb(0, 0, 0), opacity: 0.55,
  });
  page.drawText(
    name + "  |  " + W.toFixed(1) + " × " + H.toFixed(1) + " pt  |  RED=y-axis, BLUE=x-axis, GREEN=field estimates",
    { x: 4, y: H - 13, size: 6.5, font, color: rgb(1, 1, 1), opacity: 1 },
  );

  const outPath = path.join(__dirname, "../calibration-" + name + ".pdf");
  fs.writeFileSync(outPath, Buffer.from(await pdfDoc.save()));
  console.log("✓", name, W.toFixed(0) + "×" + H.toFixed(0), "→", path.basename(outPath));
}

(async () => {
  for (const name of Object.keys(CURRENT_ESTIMATES)) {
    await generateCalibrationPDF(name);
  }
})().catch((e) => { console.error(e); process.exit(1); });

/**
 * Identity Verification PDF renderers — template overlay approach.
 *
 * Each renderer loads the matching reference PDF (which provides the exact
 * visual design: borders, logos, labels, stamps) and then:
 *   1. Blanks out the sample personal data with white rectangles.
 *   2. Draws the actual user data at calibrated coordinates.
 *   3. Embeds the passport photo (if available).
 *   4. Generates and places a real QR code for NIN Standard.
 *
 * Coordinate system: pdf-lib uses bottom-left origin (y increases upward).
 *
 * Page sizes from the reference templates:
 *   nin-information : 612 × 1008 pt  (US Legal)
 *   nin-standard    : 612 × 1008 pt  (US Legal)
 *   nin-premium     : 595 × 841.9 pt (A4)
 *   bvn-basic       : 595 × 841.9 pt (A4)
 */

import fs from "fs";
import path from "path";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import QRCode from "qrcode";

// ── Template directory ────────────────────────────────────────────────────────
const TPL_DIR = path.resolve(__dirname, "templates");

function tpl(name: string): Buffer {
  return fs.readFileSync(path.join(TPL_DIR, name));
}

// ── Colour helpers ────────────────────────────────────────────────────────────
const WHITE  = rgb(1, 1, 1);
const BLACK  = rgb(0, 0, 0);
const GREY   = rgb(0.25, 0.25, 0.25);

// ── String helper ─────────────────────────────────────────────────────────────
export function s(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

// ── Date formatters ───────────────────────────────────────────────────────────
export function fmtDate(d: unknown): string {
  if (!d) return "";
  const raw = String(d);
  try {
    const dt = new Date(raw);
    if (!isNaN(dt.getTime())) {
      return dt.toLocaleDateString("en-GB", {
        day: "2-digit", month: "short", year: "numeric",
      });
    }
  } catch { /* */ }
  return raw;
}

function fmtTs(): string {
  try {
    return new Date().toLocaleString("en-NG", {
      day: "2-digit", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return new Date().toISOString(); }
}

// ── QR code ───────────────────────────────────────────────────────────────────
async function makeQrPng(content: string, px: number): Promise<Buffer> {
  return QRCode.toBuffer(content || "NGA-NIMC", {
    type: "png", width: px, margin: 1,
  });
}

// ── Photo embedding ───────────────────────────────────────────────────────────
async function embedPhotoImage(pdfDoc: PDFDocument, photo: string) {
  if (!photo || photo === "[photo_redacted]") return null;
  const buf = Buffer.from(photo, "base64");
  // JPEG: base64 starts with /9j/; PNG starts with iVBOR
  const isJpeg = photo.startsWith("/9j/") || photo.startsWith("iVBOR") === false;
  try {
    return isJpeg ? await pdfDoc.embedJpg(buf) : await pdfDoc.embedPng(buf);
  } catch {
    try { return await pdfDoc.embedJpg(buf); } catch { /* */ }
    try { return await pdfDoc.embedPng(buf); } catch { /* */ }
    return null;
  }
}

// ── White-out helper ──────────────────────────────────────────────────────────
interface Rect { x: number; y: number; w: number; h: number }

function blankRect(page: ReturnType<PDFDocument["getPages"]>[0], r: Rect) {
  page.drawRectangle({ x: r.x, y: r.y, width: r.w, height: r.h, color: WHITE, opacity: 1 });
}

// ── Draw text helper ──────────────────────────────────────────────────────────
interface TextField {
  x:     number;
  y:     number;
  text:  string;
  size?: number;
  bold?: boolean;
  color?: ReturnType<typeof rgb>;
}

async function drawFields(
  pdfDoc: PDFDocument,
  page:   ReturnType<PDFDocument["getPages"]>[0],
  fields: TextField[],
) {
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  for (const f of fields) {
    if (!f.text) continue;
    page.drawText(f.text, {
      x:    f.x,
      y:    f.y,
      size: f.size ?? 9,
      font: f.bold ? bold : regular,
      color: f.color ?? BLACK,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIP 1 — NIN Information Slip  (612 × 1008 pt)
// ─────────────────────────────────────────────────────────────────────────────
export async function renderNinInformationSlip(
  g:         (k: string) => string,
  reference: string,
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(tpl("nin-information.pdf"));
  const [page] = pdfDoc.getPages();
  const H = page.getHeight(); // 1008

  // ── Blank-out existing sample data ─────────────────────────────────────────
  // Coordinates are calibrated against the reference template (612 × 1008 pt).
  const blanks: Rect[] = [
    { x: 155, y: H - 160, w: 110, h: 14 }, // first_name
    { x: 155, y: H - 188, w: 110, h: 14 }, // middle_name
    { x: 155, y: H - 218, w: 110, h: 14 }, // last_name
    { x: 155, y: H - 254, w: 130, h: 14 }, // date_of_birth
    { x: 155, y: H - 290, w:  80, h: 14 }, // gender
    { x: 192, y: H - 320, w: 132, h: 185 }, // photo (covers the sample photo)
    { x: 190, y: H - 365, w: 255, h: 30  }, // NIN number (large)
    { x: 360, y: H - 400, w: 140, h: 13  }, // phone value
    { x: 145, y: H - 430, w: 420, h: 13  }, // address value
    { x: 145, y: H - 400, w: 140, h: 13  }, // tracking_id value
    { x: 145, y: H - 415, w: 140, h: 13  }, // residence_state value
    { x: 360, y: H - 415, w: 140, h: 13  }, // residence_lga value
    { x: 145, y: H - 445, w: 140, h: 13  }, // birth_state value
    { x: 360, y: H - 445, w: 140, h: 13  }, // birth_lga value
  ];
  for (const r of blanks) blankRect(page, r);

  // ── Passport photo ──────────────────────────────────────────────────────────
  const photo = await embedPhotoImage(pdfDoc, g("photo"));
  if (photo) {
    page.drawImage(photo, { x: 192, y: H - 320, width: 132, height: 185 });
  }

  // ── Text fields ─────────────────────────────────────────────────────────────
  const nin = g("id_number") || g("nin") || "";

  await drawFields(pdfDoc, page, [
    // Body row values
    { x: 155, y: H - 154, text: g("first_name"),                       size: 10 },
    { x: 155, y: H - 183, text: g("middle_name"),                      size: 10 },
    { x: 155, y: H - 213, text: g("last_name"),                        size: 10 },
    { x: 155, y: H - 249, text: fmtDate(g("date_of_birth")),           size: 10 },
    { x: 155, y: H - 285, text: g("gender"),                           size: 10 },

    // NIN number (large bold)
    { x: 190, y: H - 345, text: nin,                                   size: 22, bold: true },

    // Footer grid
    { x: 145, y: H - 397, text: g("tracking_id"),                      size: 9  },
    { x: 360, y: H - 397, text: g("phone"),                            size: 9  },
    { x: 145, y: H - 413, text: g("residence_state"),                  size: 9  },
    { x: 360, y: H - 413, text: g("residence_lga") || g("residence_lga_name"), size: 9 },
    { x: 145, y: H - 429, text: g("birth_state"),                      size: 9  },
    { x: 360, y: H - 429, text: g("birth_lga"),                        size: 9  },
    { x: 145, y: H - 447, text: g("address") || g("residential_address"), size: 9 },

    // Footer: reference + timestamp
    { x: 145, y: 18, text: `Ref: ${reference}  |  ${fmtTs()}`, size: 7, color: GREY },
  ]);

  return Buffer.from(await pdfDoc.save());
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIP 2 — NIN Standard Slip  (612 × 1008 pt)
// ─────────────────────────────────────────────────────────────────────────────
export async function renderNinStandardSlip(
  g:         (k: string) => string,
  reference: string,
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(tpl("nin-standard.pdf"));
  const [page] = pdfDoc.getPages();
  const H = page.getHeight(); // 1008

  const nin = g("id_number") || g("nin") || "";

  // ── Blank existing photo, names, DOB, NIN, QR code ─────────────────────────
  const blanks: Rect[] = [
    { x:  47, y: H - 200, w:  92, h: 118 }, // photo
    { x: 146, y: H - 118, w: 170, h:  13 }, // surname value
    { x: 146, y: H - 150, w: 170, h:  13 }, // given names value
    { x: 146, y: H - 182, w: 130, h:  13 }, // date of birth value
    { x: 328, y: H - 108, w:  80, h:  14 }, // NGA label (we'll redraw our own)
    { x: 330, y: H - 200, w:  70, h:  70 }, // existing QR code
    { x: 104, y: H - 240, w: 300, h:  26 }, // NIN number (large)
  ];
  for (const r of blanks) blankRect(page, r);

  // ── Passport photo ──────────────────────────────────────────────────────────
  const photo = await embedPhotoImage(pdfDoc, g("photo"));
  if (photo) {
    page.drawImage(photo, { x: 47, y: H - 200, width: 92, height: 118 });
  }

  // ── QR code ─────────────────────────────────────────────────────────────────
  const qrBuf = await makeQrPng(nin || reference, 70);
  const qrImg = await pdfDoc.embedPng(qrBuf);
  page.drawImage(qrImg, { x: 330, y: H - 200, width: 70, height: 70 });

  // ── Text fields ─────────────────────────────────────────────────────────────
  const ninSpaced = nin.replace(/(.{4})/g, "$1 ").trim();

  await drawFields(pdfDoc, page, [
    { x: 146, y: H - 113, text: g("last_name").toUpperCase(),                                       size: 12, bold: true },
    { x: 146, y: H - 146, text: [g("first_name"), g("middle_name")].filter(Boolean).join(" ").toUpperCase(), size: 12, bold: true },
    { x: 146, y: H - 178, text: fmtDate(g("date_of_birth")),                                        size: 12, bold: true },
    { x: 104, y: H - 233, text: ninSpaced || "—",                                                   size: 22, bold: true },
    { x: 100, y: 18,      text: `Ref: ${reference}  |  ${fmtTs()}`, size: 7, color: GREY },
  ]);

  return Buffer.from(await pdfDoc.save());
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIP 3 — NIN Premium (Digital NIN Slip)  (595 × 841.9 pt)
// ─────────────────────────────────────────────────────────────────────────────
export async function renderNinPremiumSlip(
  g:         (k: string) => string,
  tx:        { created_at?: unknown; processed_at?: unknown; updated_at?: unknown },
  reference: string,
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(tpl("nin-premium.pdf"));
  const [page] = pdfDoc.getPages();
  const H = page.getHeight(); // 841.9

  const nin = g("id_number") || g("nin") || "";

  // ── Blank existing data ─────────────────────────────────────────────────────
  const blanks: Rect[] = [
    { x: 163, y: H - 285, w:  82, h:  92 }, // photo
    { x: 165, y: H - 268, w: 165, h:  14 }, // QR code area
    { x: 163, y: H - 265, w: 140, h:  14 }, // surname value
    { x: 163, y: H - 295, w: 140, h:  14 }, // given names value
    { x: 163, y: H - 330, w:  80, h:  13 }, // date of birth value
    { x: 245, y: H - 330, w:  60, h:  13 }, // gender value
    { x: 310, y: H - 330, w:  85, h:  13 }, // issue date value
    { x: 163, y: H - 368, w: 260, h:  22 }, // NIN number
    { x: 415, y: H - 215, w:  62, h:  62 }, // existing QR code
  ];
  for (const r of blanks) blankRect(page, r);

  // ── Photo ───────────────────────────────────────────────────────────────────
  const photo = await embedPhotoImage(pdfDoc, g("photo"));
  if (photo) {
    page.drawImage(photo, { x: 163, y: H - 285, width: 82, height: 92 });
  }

  // ── QR code (top-right of green panel) ──────────────────────────────────────
  const qrBuf = await makeQrPng(nin || reference, 62);
  const qrImg = await pdfDoc.embedPng(qrBuf);
  page.drawImage(qrImg, { x: 415, y: H - 215, width: 62, height: 62 });

  // ── Text fields (white text on green panel) ──────────────────────────────────
  const ninSpaced = nin.replace(/(.{4})/g, "$1 ").trim();
  const issueDate = fmtDate(tx.processed_at ?? tx.updated_at ?? tx.created_at ?? "");

  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const WHITE_C  = rgb(1, 1, 1);

  const textFields: TextField[] = [
    { x: 248, y: H - 257, text: g("last_name").toUpperCase(),                                              size: 10, bold: true, color: WHITE_C },
    { x: 248, y: H - 280, text: [g("first_name"), g("middle_name")].filter(Boolean).join(",\n").toUpperCase(), size: 9,  bold: true, color: WHITE_C },
    { x: 248, y: H - 311, text: fmtDate(g("date_of_birth")) || "—",                                       size: 8,  bold: true, color: WHITE_C },
    { x: 330, y: H - 311, text: g("gender").toUpperCase() || "—",                                         size: 8,  bold: true, color: WHITE_C },
    { x: 395, y: H - 311, text: issueDate || "—",                                                         size: 8,  bold: true, color: WHITE_C },
    { x: 163, y: H - 355, text: ninSpaced || "—",                                                         size: 17, bold: true, color: WHITE_C },
  ];

  // Draw text fields with white color on green background
  for (const f of textFields) {
    if (!f.text) continue;
    page.drawText(f.text, {
      x: f.x, y: f.y, size: f.size ?? 9,
      font: boldFont, color: f.color ?? BLACK,
    });
  }

  // Footer reference
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  page.drawText(`Ref: ${reference}  |  ${fmtTs()}`, {
    x: 60, y: 18, size: 7, font: regular, color: GREY,
  });

  return Buffer.from(await pdfDoc.save());
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIP 4 — BVN Basic Slip  (595 × 841.9 pt)
// ─────────────────────────────────────────────────────────────────────────────
export async function renderBvnSlip(
  g:         (k: string) => string,
  reference: string,
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(tpl("bvn-basic.pdf"));
  const [page] = pdfDoc.getPages();
  const H = page.getHeight(); // 841.9

  // ── Blank existing data ─────────────────────────────────────────────────────
  const blanks: Rect[] = [
    { x: 243, y: H - 273, w: 100, h: 128 }, // photo
    { x: 148, y: H - 162, w: 120, h:  13 }, // first_name value
    { x: 148, y: H - 183, w: 120, h:  13 }, // middle_name value
    { x: 148, y: H - 203, w: 120, h:  13 }, // last_name value
    { x: 148, y: H - 223, w: 130, h:  13 }, // date_of_birth value
    { x: 148, y: H - 243, w:  80, h:  13 }, // gender value
    { x: 148, y: H - 263, w: 100, h:  13 }, // marital_status value
    { x: 148, y: H - 283, w: 130, h:  13 }, // phone value
    { x: 340, y: H - 283, w: 130, h:  13 }, // nin value
    // Row 2 blanks
    { x: 235, y: H - 328, w: 130, h:  13 }, // enrollment_institution value
    { x: 440, y: H - 328, w: 120, h:  13 }, // enrollment_branch value
    { x: 180, y: H - 348, w: 160, h:  13 }, // origin_state value
    { x: 430, y: H - 348, w:  80, h:  13 }, // origin_lga value
    { x: 180, y: H - 368, w: 160, h:  13 }, // residence_state value
    { x: 430, y: H - 368, w:  80, h:  13 }, // residence_lga value
    { x: 148, y: H - 388, w: 400, h:  13 }, // address value
  ];
  for (const r of blanks) blankRect(page, r);

  // ── Passport photo ──────────────────────────────────────────────────────────
  const photo = await embedPhotoImage(pdfDoc, g("photo"));
  if (photo) {
    page.drawImage(photo, { x: 243, y: H - 273, width: 100, height: 128 });
  }

  // ── Text fields ─────────────────────────────────────────────────────────────
  await drawFields(pdfDoc, page, [
    { x: 148, y: H - 158, text: g("first_name"),                           size: 10 },
    { x: 148, y: H - 178, text: g("middle_name"),                          size: 10 },
    { x: 148, y: H - 198, text: g("last_name"),                            size: 10 },
    { x: 148, y: H - 218, text: fmtDate(g("date_of_birth")),               size: 10 },
    { x: 148, y: H - 238, text: g("gender"),                               size: 10 },
    { x: 148, y: H - 258, text: g("marital_status"),                       size: 10 },
    { x: 148, y: H - 278, text: g("phone"),                                size: 10 },
    { x: 340, y: H - 278, text: g("nin") || g("id_number") || "",          size: 10 },
    // Row 2
    { x: 235, y: H - 324, text: g("enrollment_institution"),               size:  9 },
    { x: 440, y: H - 324, text: g("enrollment_branch"),                    size:  9 },
    { x: 180, y: H - 344, text: g("origin_state"),                         size:  9 },
    { x: 430, y: H - 344, text: g("origin_lga"),                           size:  9 },
    { x: 180, y: H - 364, text: g("residence_state"),                      size:  9 },
    { x: 430, y: H - 364, text: g("residence_lga") || g("residence_lga_name"), size: 9 },
    { x: 148, y: H - 384, text: g("address") || g("residential_address"),  size:  9 },
    // Footer
    { x: 60,  y: 18,      text: `Ref: ${reference}  |  ${fmtTs()}`,        size:  7, color: GREY },
  ]);

  return Buffer.from(await pdfDoc.save());
}

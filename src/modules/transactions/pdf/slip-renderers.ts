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
const GREY       = rgb(0.25, 0.25, 0.25);
const CARD_GREEN = rgb(0.09, 0.38, 0.17); // NIN Premium panel background — tune RGB if template colour differs

// ── String helper ─────────────────────────────────────────────────────────────
export function s(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

// ── Date formatters ───────────────────────────────────────────────────────────
export function fmtDate(d: unknown): string {
  if (!d) return "—";
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

// ── Text wrap helper ─────────────────────────────────────────────────────────
// Splits `text` into lines that fit within `maxPt` points.
// Uses Helvetica average char width ≈ 0.52 × em.
function splitLines(text: string, maxPt: number, sizePt: number): string[] {
  if (!text) return [];
  const charsPerLine = Math.floor(maxPt / (sizePt * 0.52));
  if (text.length <= charsPerLine) return [text];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (candidate.length > charsPerLine && line) {
      lines.push(line);
      line = w;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// ── White-out helper ──────────────────────────────────────────────────────────
interface Rect { x: number; y: number; w: number; h: number }

function blankRect(page: ReturnType<PDFDocument["getPages"]>[0], r: Rect, color = WHITE) {
  page.drawRectangle({ x: r.x, y: r.y, width: r.w, height: r.h, color, opacity: 1 });
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
    const text = f.text || "—";
    page.drawText(text, {
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
  // Calibrated from calibration-nin-information.pdf (612 × 1008 pt).
  // Footer row baselines (pdf-lib y from bottom): tracking=611, residence=595,
  // birth=579, address=561. Each row spaced ~16 pt apart.
  const blanks: Rect[] = [
    { x: 155, y: H - 160, w: 110, h: 14 }, // first_name
    { x: 155, y: H - 188, w: 110, h: 14 }, // middle_name
    { x: 155, y: H - 218, w: 110, h: 14 }, // last_name
    { x: 155, y: H - 254, w: 130, h: 14 }, // date_of_birth
    { x: 155, y: H - 290, w:  80, h: 14 }, // gender
    { x: 192, y: H - 320, w: 132, h: 185 }, // photo
    // NIN number: h=45 so the blank top (y=688) clears size-22 cap-height (~16 pt above baseline 663)
    { x: 190, y: H - 365, w: 255, h: 45  }, // NIN number (large)
    { x: 145, y: H - 400, w: 140, h: 13  }, // tracking_id value  (row baseline 611)
    { x: 360, y: H - 400, w: 140, h: 13  }, // phone value        (row baseline 611)
    { x: 145, y: H - 415, w: 140, h: 13  }, // residence_state    (row baseline 595)
    { x: 360, y: H - 415, w: 140, h: 13  }, // residence_lga      (row baseline 595)
    // birth row baseline is 579; blank bottom = H-431=577, top = 590 ✓
    { x: 145, y: H - 431, w: 140, h: 13  }, // birth_state        (row baseline 579)
    { x: 360, y: H - 431, w: 140, h: 13  }, // birth_lga          (row baseline 579)
    // address row baseline is 561; 2-line reserve: blank covers 559→585 (2 × 13pt lines + gap)
    { x: 145, y: H - 449, w: 420, h: 26  }, // address            (row baseline 561, up to 2 lines)
  ];
  for (const r of blanks) blankRect(page, r);

  // ── Passport photo ──────────────────────────────────────────────────────────
  const photo = await embedPhotoImage(pdfDoc, g("photo"));
  if (photo) {
    page.drawImage(photo, { x: 192, y: H - 320, width: 132, height: 185 });
  }

  // ── Text fields ─────────────────────────────────────────────────────────────
  const nin = g("id_number") || g("nin") || "";

  // Address wrapping: 420 pt available at size 9 → ~84 chars per line; cap at 2 lines.
  const addrRaw = g("address") || g("residential_address");
  const addrLines = splitLines(addrRaw, 420, 9).slice(0, 2);
  const addrDisplay = addrLines.length ? addrLines : ["—"];

  await drawFields(pdfDoc, page, [
    // Body row values
    { x: 155, y: H - 154, text: g("first_name"),                       size: 10 },
    { x: 155, y: H - 183, text: g("middle_name"),                      size: 10 },
    { x: 155, y: H - 213, text: g("last_name"),                        size: 10 },
    { x: 155, y: H - 249, text: fmtDate(g("date_of_birth")),           size: 10 },
    { x: 155, y: H - 285, text: g("gender"),                           size: 10 },

    // NIN number (large bold)
    { x: 190, y: H - 345, text: nin || "—",                            size: 22, bold: true },

    // Footer grid
    { x: 145, y: H - 397, text: g("tracking_id"),                      size: 9  },
    { x: 360, y: H - 397, text: g("phone"),                            size: 9  },
    { x: 145, y: H - 413, text: g("residence_state"),                  size: 9  },
    { x: 360, y: H - 413, text: g("residence_lga") || g("residence_lga_name"), size: 9 },
    { x: 145, y: H - 429, text: g("birth_state"),                      size: 9  },
    { x: 360, y: H - 429, text: g("birth_lga"),                        size: 9  },

    // Address — line 0 at baseline 561, line 1 drops 13 pt (size 9 + 4 pt leading)
    ...addrDisplay.map((line, i) => ({ x: 145, y: H - 447 - i * 13, text: line, size: 9 as const })),

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
  // Calibrated from calibration-nin-standard.pdf (612 × 1008 pt).
  // NGA label is static template text — not blanked (was incorrectly erased before).
  // QR blank covers 80×80 pt to match the template's original QR dimensions.
  const blanks: Rect[] = [
    { x:  47, y: H - 200, w:  92, h: 118 }, // photo  (TL=47,926  BR=139,808)
    { x: 146, y: H - 116, w: 170, h:  16 }, // surname   baseline y=895 (yFromTop=113)
    { x: 146, y: H - 153, w: 170, h:  16 }, // given     baseline y=858 (yFromTop=150)
    { x: 146, y: H - 185, w: 130, h:  16 }, // dob       baseline y=826 (yFromTop=182)
    { x: 328, y: H - 212, w:  84, h:  84 }, // existing QR code (TL=330,878 → 80×80 pt)
    { x: 104, y: H - 240, w: 300, h:  26 }, // NIN number (large) baseline y=775
  ];
  for (const r of blanks) blankRect(page, r);

  // ── Passport photo ──────────────────────────────────────────────────────────
  // Dimensions confirmed: TL=(47,926) BR=(139,808) → w=92 h=118
  const photo = await embedPhotoImage(pdfDoc, g("photo"));
  if (photo) {
    page.drawImage(photo, { x: 47, y: H - 200, width: 92, height: 118 });
  }

  // ── QR code ─────────────────────────────────────────────────────────────────
  // 80×80 pt — TL kept at (330,878): bottom-left = (330, H-210=798)
  const qrBuf = await makeQrPng(nin || reference, 80);
  const qrImg = await pdfDoc.embedPng(qrBuf);
  page.drawImage(qrImg, { x: 330, y: H - 210, width: 80, height: 80 });

  // ── Text fields ─────────────────────────────────────────────────────────────
  // given: corrected from H-146 → H-150 (+4 pt down to match calibration baseline 858)
  // dob:   corrected from H-178 → H-182 (+4 pt down to match calibration baseline 826)
  const ninSpaced = nin.replace(/(.{4})/g, "$1 ").trim();

  await drawFields(pdfDoc, page, [
    { x: 146, y: H - 113, text: g("last_name").toUpperCase() || "—",                                        size: 12, bold: true },
    { x: 146, y: H - 150, text: [g("first_name"), g("middle_name")].filter(Boolean).join(" ").toUpperCase() || "—", size: 12, bold: true },
    { x: 146, y: H - 182, text: fmtDate(g("date_of_birth")),                                               size: 12, bold: true },
    { x: 104, y: H - 233, text: ninSpaced || "—",                                                        size: 22, bold: true },
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
  // Photo and QR blanks use WHITE — both are covered by new content drawn on top.
  // Text blanks use CARD_GREEN to match the panel background; WHITE would leave
  // visible white patches on the green card.
  const whiteOuts: Rect[] = [
    { x: 163, y: H - 285, w:  82, h:  92 }, // photo (covered by new photo)
    { x: 415, y: H - 215, w:  62, h:  62 }, // existing QR (covered by new QR)
  ];
  const greenOuts: Rect[] = [
    { x: 163, y: H - 267, w: 190, h:  16 }, // surname value
    { x: 163, y: H - 297, w: 190, h:  18 }, // given names value (h extended: old 14 missed text baseline by 1 pt)
    { x: 163, y: H - 334, w:  80, h:  16 }, // date of birth value
    { x: 245, y: H - 334, w:  65, h:  16 }, // gender value
    { x: 310, y: H - 334, w:  90, h:  16 }, // issue date value
    { x: 163, y: H - 370, w: 265, h:  24 }, // NIN number
  ];
  for (const r of whiteOuts) blankRect(page, r);
  for (const r of greenOuts) blankRect(page, r, CARD_GREEN);

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
    { x: 248, y: H - 257, text: g("last_name").toUpperCase() || "—",                                          size: 10, bold: true, color: WHITE_C },
    { x: 248, y: H - 280, text: [g("first_name"), g("middle_name")].filter(Boolean).join(" ").toUpperCase() || "—", size: 9,  bold: true, color: WHITE_C },
    { x: 248, y: H - 311, text: fmtDate(g("date_of_birth")),                                                  size: 8,  bold: true, color: WHITE_C },
    { x: 330, y: H - 311, text: g("gender").toUpperCase() || "—",                                             size: 8,  bold: true, color: WHITE_C },
    { x: 395, y: H - 311, text: issueDate,                                                                    size: 8,  bold: true, color: WHITE_C },
    { x: 163, y: H - 355, text: ninSpaced || "—",                                                             size: 17, bold: true, color: WHITE_C },
  ];

  // Draw text fields with white color on green background
  for (const f of textFields) {
    const text = f.text || "—";
    page.drawText(text, {
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
  // Calibrated from calibration-bvn-basic.pdf (595 × 841.9 pt).
  // Blanks sit 3 pt below each text baseline so descenders are covered.
  const blanks: Rect[] = [
    { x: 243, y: H - 273, w: 100, h: 128 }, // photo (TL=243,697 BR=343,569)
    { x: 148, y: H - 161, w: 100, h: 16  }, // first_name  baseline y=684 (yFromTop=158)
    { x: 148, y: H - 186, w: 100, h: 16  }, // middle_name baseline y=659 (yFromTop=183)
    { x: 148, y: H - 206, w: 100, h: 16  }, // last_name   baseline y=639 (yFromTop=203)
    { x: 148, y: H - 226, w: 130, h: 16  }, // dob         baseline y=619 (yFromTop=223)
    { x: 148, y: H - 246, w:  80, h: 16  }, // gender      baseline y=599 (yFromTop=243)
    { x: 148, y: H - 266, w: 100, h: 16  }, // marital     baseline y=579 (yFromTop=263)
    { x: 148, y: H - 286, w: 155, h: 16  }, // phone       baseline y=559 (yFromTop=283)
    { x: 340, y: H - 286, w: 130, h: 16  }, // nin         baseline y=559 (yFromTop=283)
    // Row 2 — estimated at 20 pt row spacing below phone, no calibration dot
    { x: 235, y: H - 332, w: 130, h: 16  }, // enrollment_institution
    { x: 440, y: H - 332, w: 120, h: 16  }, // enrollment_branch
    { x: 180, y: H - 352, w: 160, h: 16  }, // origin_state
    { x: 430, y: H - 352, w:  80, h: 16  }, // origin_lga
    { x: 180, y: H - 372, w: 160, h: 16  }, // residence_state
    { x: 430, y: H - 372, w:  80, h: 16  }, // residence_lga
    { x: 148, y: H - 391, w: 400, h: 30  }, // address (2-line reserve) baseline y=454
  ];
  for (const r of blanks) blankRect(page, r);

  // ── Passport photo ──────────────────────────────────────────────────────────
  const photo = await embedPhotoImage(pdfDoc, g("photo"));
  if (photo) {
    page.drawImage(photo, { x: 243, y: H - 273, width: 100, height: 128 });
  }

  // ── Text fields ─────────────────────────────────────────────────────────────
  // Baselines confirmed from calibration-bvn-basic.pdf; row 2 uses same 20 pt spacing.
  const addrRaw = g("address") || g("residential_address");
  const addrLines = splitLines(addrRaw, 400, 9).slice(0, 2);
  const addrDisplay = addrLines.length ? addrLines : ["—"];

  await drawFields(pdfDoc, page, [
    { x: 148, y: H - 158, text: g("first_name"),                           size: 10 },
    { x: 148, y: H - 183, text: g("middle_name"),                          size: 10 },
    { x: 148, y: H - 203, text: g("last_name"),                            size: 10 },
    { x: 148, y: H - 223, text: fmtDate(g("date_of_birth")),               size: 10 },
    { x: 148, y: H - 243, text: g("gender"),                               size: 10 },
    { x: 148, y: H - 263, text: g("marital_status"),                       size: 10 },
    { x: 148, y: H - 283, text: g("phone"),                                size: 10 },
    { x: 340, y: H - 283, text: g("nin") || g("id_number"),                size: 10 },
    // Row 2
    { x: 235, y: H - 329, text: g("enrollment_institution"),               size:  9 },
    { x: 440, y: H - 329, text: g("enrollment_branch"),                    size:  9 },
    { x: 180, y: H - 349, text: g("origin_state"),                         size:  9 },
    { x: 430, y: H - 349, text: g("origin_lga"),                           size:  9 },
    { x: 180, y: H - 369, text: g("residence_state"),                      size:  9 },
    { x: 430, y: H - 369, text: g("residence_lga") || g("residence_lga_name"), size: 9 },
    // Address — baseline y=454 (yFromTop=388); line 1 drops 13 pt (size 9 + 4 pt leading)
    ...addrDisplay.map((line, i) => ({ x: 148, y: H - 388 - i * 13, text: line, size: 9 as const })),
    // Footer
    { x: 60,  y: 18,      text: `Ref: ${reference}  |  ${fmtTs()}`,        size:  7, color: GREY },
  ]);

  return Buffer.from(await pdfDoc.save());
}

/**
 * Identity Verification PDF renderers — PNG template + overlay approach.
 *
 * Each slip type embeds its PNG template as a full-page background, then
 * overlays dynamic field values using coordinates from field-map.ts.
 *
 * Set PDF_COORD_DEBUG=true to draw red rectangles around every field area
 * and blue rectangles around photo/QR zones for calibration.
 */

import path from "path";
import fs   from "fs";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import QRCode from "qrcode";
import { FIELD_MAP } from "./field-map";

const TEMPLATES_DIR = path.resolve(__dirname, "templates");
const DEBUG = process.env.PDF_COORD_DEBUG === "true";

const BLACK = rgb(0, 0, 0);
const RED   = rgb(1, 0, 0);
const BLUE  = rgb(0, 0.3, 1);

// ── String helper (re-exported — used by identity-report controller) ──────────
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
      return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
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

// ── NIN/BVN spaced format ─────────────────────────────────────────────────────
function spaceNin(nin: string): string {
  return nin ? nin.replace(/(.{4})/g, "$1 ").trim() : "—";
}

// ── Text wrap ─────────────────────────────────────────────────────────────────
function splitLines(text: string, maxPt: number, sizePt: number): string[] {
  if (!text) return [];
  const charsPerLine = Math.floor(maxPt / (sizePt * 0.52));
  if (text.length <= charsPerLine) return [text];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (candidate.length > charsPerLine && line) { lines.push(line); line = w; }
    else { line = candidate; }
  }
  if (line) lines.push(line);
  return lines;
}

// ── Photo embedding ───────────────────────────────────────────────────────────
async function embedPhotoImage(pdfDoc: PDFDocument, photo: string) {
  if (!photo || photo === "[photo_redacted]") return null;
  const buf    = Buffer.from(photo, "base64");
  const isJpeg = photo.startsWith("/9j/") || !photo.startsWith("iVBOR");
  try {
    return isJpeg ? await pdfDoc.embedJpg(buf) : await pdfDoc.embedPng(buf);
  } catch {
    try { return await pdfDoc.embedJpg(buf); } catch { /* */ }
    try { return await pdfDoc.embedPng(buf); } catch { /* */ }
    return null;
  }
}

// ── QR code ───────────────────────────────────────────────────────────────────
async function makeQrPng(content: string, px: number): Promise<Buffer> {
  return QRCode.toBuffer(content || "NGA-NIMC", { type: "png", width: px, margin: 1 });
}

// ── Core renderer ─────────────────────────────────────────────────────────────
async function renderFromTemplate(
  key:         string,
  values:      Record<string, string>,
  photoB64:    string | undefined,
  qrContent:   string | undefined,
): Promise<Buffer> {
  const map = FIELD_MAP[key as keyof typeof FIELD_MAP];
  const { W, H, templateFile } = map;

  const templateBytes = fs.readFileSync(path.join(TEMPLATES_DIR, templateFile));
  const doc  = await PDFDocument.create();
  const page = doc.addPage([W, H]);
  const reg  = await doc.embedFont(StandardFonts.Helvetica);
  const bld  = await doc.embedFont(StandardFonts.HelveticaBold);

  // Full-page template background
  const bgImg = await doc.embedPng(templateBytes);
  page.drawImage(bgImg, { x: 0, y: 0, width: W, height: H });

  // Text fields
  for (const [fieldKey, def] of Object.entries(map.fields)) {
    const value = values[fieldKey] !== undefined ? values[fieldKey] : "—";
    const font  = def.bold ? bld : reg;
    const size  = def.size ?? 9;
    const color = def.color ? rgb(def.color[0], def.color[1], def.color[2]) : BLACK;

    // Convert image-space fractions to PDF coordinates (origin = bottom-left)
    const pdfX      = def.x * W;
    const pdfBoxTop = H - def.y * H;
    const pdfBoxBot = H - (def.y + def.h) * H;
    const pdfW      = def.w * W;
    const pdfH      = def.h * H;

    // First text baseline: just below the box top
    const firstY = pdfBoxTop - size * 1.15;
    const lineH  = size * 1.3;

    if (def.wrap) {
      const maxLines = Math.max(1, Math.floor(pdfH / lineH));
      const lines    = splitLines(value, pdfW, size).slice(0, maxLines);
      for (let i = 0; i < lines.length; i++) {
        const lineY = firstY - i * lineH;
        if (lineY < pdfBoxBot) break;
        const x = def.align === "center"
          ? pdfX + (pdfW - font.widthOfTextAtSize(lines[i], size)) / 2
          : pdfX;
        page.drawText(lines[i], { x, y: lineY, size, font, color });
      }
    } else {
      const x = def.align === "center"
        ? pdfX + (pdfW - font.widthOfTextAtSize(value, size)) / 2
        : pdfX;
      page.drawText(value, { x, y: firstY, size, font, color });
    }

    if (DEBUG) {
      page.drawRectangle({ x: pdfX, y: pdfBoxBot, width: pdfW, height: pdfH,
        borderColor: RED, borderWidth: 0.5 });
    }
  }

  // Photo overlay
  if (map.photo && photoB64) {
    const img = await embedPhotoImage(doc, photoB64);
    if (img) {
      const { x, y, w, h } = map.photo;
      const px = x * W, pw = w * W, ph = h * H, py = H - (y + h) * H;
      page.drawImage(img, { x: px, y: py, width: pw, height: ph });
      if (DEBUG) {
        page.drawRectangle({ x: px, y: py, width: pw, height: ph,
          borderColor: BLUE, borderWidth: 0.5 });
      }
    }
  }

  // QR overlay
  if (map.qr && qrContent) {
    const qrSize = map.qr.w * W;
    const qrBuf  = await makeQrPng(qrContent, Math.round(qrSize * 2));
    const qrImg  = await doc.embedPng(qrBuf);
    const qx     = map.qr.x * W;
    const qy     = H - map.qr.y * H - qrSize;
    page.drawImage(qrImg, { x: qx, y: qy, width: qrSize, height: qrSize });
    if (DEBUG) {
      page.drawRectangle({ x: qx, y: qy, width: qrSize, height: qrSize,
        borderColor: BLUE, borderWidth: 0.5 });
    }
  }

  return Buffer.from(await doc.save());
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIP 1 — NIN Information Slip  (612 × 1008 pt)
// ─────────────────────────────────────────────────────────────────────────────
export async function renderNinInformationSlip(
  g:         (k: string) => string,
  reference: string,
): Promise<Buffer> {
  const nin = g("id_number") || g("nin") || "";
  return renderFromTemplate("nin_information", {
    first_name:      g("first_name")      || "—",
    middle_name:     g("middle_name")     || "—",
    last_name:       g("last_name")       || "—",
    date_of_birth:   fmtDate(g("date_of_birth")),
    gender:          g("gender")          || "—",
    id_number:       spaceNin(nin),
    tracking_id:     g("tracking_id")     || "—",
    residence_state: g("residence_state") || "—",
    birth_state:     g("birth_state")     || "—",
    phone:           g("phone")           || "—",
    residence_lga:   g("residence_lga")   || g("residence_lga_name") || "—",
    birth_lga:       g("birth_lga")       || "—",
    address:         g("address")         || g("residential_address") || "—",
    _reference:      `Ref: ${reference}  |  Generated: ${fmtTs()}`,
  }, g("photo"), undefined);
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIP 2 — NIN Standard Slip  (612 × 1008 pt)
// ─────────────────────────────────────────────────────────────────────────────
export async function renderNinStandardSlip(
  g:         (k: string) => string,
  reference: string,
): Promise<Buffer> {
  const nin       = g("id_number") || g("nin") || "";
  const givenRaw  = [g("first_name"), g("middle_name")].filter(Boolean).join(" ");
  return renderFromTemplate("nin_standard", {
    last_name:     (g("last_name")  || "").toUpperCase() || "—",
    given_names:   givenRaw.toUpperCase()                || "—",
    date_of_birth: fmtDate(g("date_of_birth")),
    id_number:     spaceNin(nin),
    _reference:    `Ref: ${reference}  |  Generated: ${fmtTs()}`,
  }, g("photo"), nin || reference);
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIP 3 — NIN Premium (Digital NIN Slip)  (595 × 841.9 pt)
// ─────────────────────────────────────────────────────────────────────────────
export async function renderNinPremiumSlip(
  g:         (k: string) => string,
  tx:        { created_at?: unknown; processed_at?: unknown; updated_at?: unknown },
  reference: string,
): Promise<Buffer> {
  const nin      = g("id_number") || g("nin") || "";
  const givenRaw = [g("first_name"), g("middle_name")].filter(Boolean).join(" ");
  const issued   = fmtDate(tx.processed_at ?? tx.updated_at ?? tx.created_at ?? "");
  return renderFromTemplate("nin_premium", {
    last_name:     (g("last_name") || "").toUpperCase() || "—",
    given_names:   givenRaw.toUpperCase()               || "—",
    date_of_birth: fmtDate(g("date_of_birth")),
    gender:        (g("gender") || "").toUpperCase()    || "—",
    issued_date:   issued                               || "—",
    id_number:     spaceNin(nin),
    _reference:    `Ref: ${reference}  |  Generated: ${fmtTs()}`,
  }, g("photo"), nin || reference);
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIP 4 — BVN Basic Slip  (595 × 841.9 pt)
// ─────────────────────────────────────────────────────────────────────────────
export async function renderBvnSlip(
  g:         (k: string) => string,
  reference: string,
): Promise<Buffer> {
  const bvn = g("bvn") || g("id_number") || "";
  return renderFromTemplate("bvn_basic", {
    first_name:             g("first_name")             || "—",
    middle_name:            g("middle_name")            || "—",
    last_name:              g("last_name")              || "—",
    date_of_birth:          fmtDate(g("date_of_birth")),
    gender:                 g("gender")                 || "—",
    marital_status:         g("marital_status")         || "—",
    bvn:                    spaceNin(bvn),
    phone:                  g("phone")                  || "—",
    nin:                    g("nin")                    || g("id_number") || "—",
    enrollment_institution: g("enrollment_institution") || "—",
    enrollment_branch:      g("enrollment_branch")      || "—",
    origin_state:           g("origin_state")           || "—",
    origin_lga:             g("origin_lga")             || "—",
    residence_state:        g("residence_state")        || "—",
    residence_lga:          g("residence_lga")          || g("residence_lga_name") || "—",
    address:                g("address")                || g("residential_address") || "—",
    _reference:             `Ref: ${reference}  |  Generated: ${fmtTs()}`,
  }, g("photo"), undefined);
}

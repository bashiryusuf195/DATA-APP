/**
 * Identity Verification PDF renderers — scratch-built layouts.
 *
 * All four slip types are built from a blank PDFDocument.create() —
 * no sample PDF backgrounds are loaded. Every element is drawn in code.
 *
 * Page sizes:
 *   nin-information : 612 × 1008 pt (US Legal)
 *   nin-standard    : 612 × 1008 pt (US Legal)
 *   nin-premium     : 595 × 841.9 pt (A4)
 *   bvn-basic       : 595 × 841.9 pt (A4)
 */

import { PDFDocument, PDFFont, rgb, StandardFonts, degrees } from "pdf-lib";
import QRCode from "qrcode";

// ── Colour palette ────────────────────────────────────────────────────────────
const GREEN_DARK  = rgb(0.05, 0.35, 0.12);   // Nigerian green — header / ID bars
const GREEN_MID   = rgb(0.10, 0.47, 0.20);   // Sub-headers / accents
const GREEN_CARD  = rgb(0.09, 0.38, 0.17);   // NIN Premium card panel
const GREEN_LIGHT = rgb(0.88, 0.96, 0.90);   // Certification box fill
const WHITE       = rgb(1,    1,    1   );
const BLACK       = rgb(0,    0,    0   );
const GREY        = rgb(0.40, 0.40, 0.40);
const GREY_LIGHT  = rgb(0.93, 0.93, 0.93);   // Alternating row background
const GREY_MID    = rgb(0.65, 0.65, 0.65);   // Placeholder / separator

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

// ── QR code ───────────────────────────────────────────────────────────────────
async function makeQrPng(content: string, px: number): Promise<Buffer> {
  return QRCode.toBuffer(content || "NGA-NIMC", { type: "png", width: px, margin: 1 });
}

// ── Photo embedding ───────────────────────────────────────────────────────────
async function embedPhotoImage(pdfDoc: PDFDocument, photo: string) {
  if (!photo || photo === "[photo_redacted]") return null;
  const buf = Buffer.from(photo, "base64");
  const isJpeg = photo.startsWith("/9j/") || !photo.startsWith("iVBOR");
  try {
    return isJpeg ? await pdfDoc.embedJpg(buf) : await pdfDoc.embedPng(buf);
  } catch {
    try { return await pdfDoc.embedJpg(buf); } catch { /* */ }
    try { return await pdfDoc.embedPng(buf); } catch { /* */ }
    return null;
  }
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

// ── Center-X helper ───────────────────────────────────────────────────────────
function cx(font: PDFFont, text: string, size: number, width: number): number {
  return (width - font.widthOfTextAtSize(text, size)) / 2;
}

// ── NIN-bar spaced format ─────────────────────────────────────────────────────
function spaceNin(nin: string): string {
  return nin ? nin.replace(/(.{4})/g, "$1 ").trim() : "—";
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIP 1 — NIN Information Slip  (612 × 1008 pt)
// Federal Republic of Nigeria / Verified NIN Details layout
// ─────────────────────────────────────────────────────────────────────────────
export async function renderNinInformationSlip(
  g:         (k: string) => string,
  reference: string,
): Promise<Buffer> {
  const doc  = await PDFDocument.create();
  const W = 612, H = 1008;
  const page = doc.addPage([W, H]);
  const reg  = await doc.embedFont(StandardFonts.Helvetica);
  const bld  = await doc.embedFont(StandardFonts.HelveticaBold);

  // ── Header (dark green bar) ─────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: H - 50, width: W, height: 50, color: GREEN_DARK });
  const hdr1 = "FEDERAL REPUBLIC OF NIGERIA";
  page.drawText(hdr1, { x: cx(bld, hdr1, 14, W), y: H - 22, size: 14, font: bld, color: WHITE });
  const hdr2 = "National Identity Management Commission";
  page.drawText(hdr2, { x: cx(reg, hdr2, 9, W), y: H - 38, size: 9, font: reg, color: WHITE });

  // Sub-header (medium green)
  page.drawRectangle({ x: 0, y: H - 68, width: W, height: 18, color: GREEN_MID });
  const sub1 = "Verified NIN Details";
  page.drawText(sub1, { x: cx(bld, sub1, 10, W), y: H - 62, size: 10, font: bld, color: WHITE });

  // ── Photo box (right column): x=422, y=740, w=160, h=200 → top=940 ─────────
  const PX = 422, PY = 740, PW = 160, PH = 200;
  page.drawRectangle({
    x: PX - 2, y: PY - 2, width: PW + 4, height: PH + 4,
    color: GREY_LIGHT, borderColor: GREEN_DARK, borderWidth: 1.5,
  });
  const photo = await embedPhotoImage(doc, g("photo"));
  if (photo) {
    page.drawImage(photo, { x: PX, y: PY, width: PW, height: PH });
  } else {
    page.drawText("PASSPORT", { x: PX + cx(bld, "PASSPORT", 10, PW), y: PY + PH / 2 + 6, size: 10, font: bld, color: GREY_MID });
    page.drawText("PHOTO",    { x: PX + cx(bld, "PHOTO",    10, PW), y: PY + PH / 2 - 8, size: 10, font: bld, color: GREY_MID });
  }

  // ── Personal info rows (left column, x < 420) ───────────────────────────────
  // 5 rows starting at y=920, spacing 30 pt.
  const LX = 36, VX = 178;
  const infoRows: [string, string][] = [
    ["First Name:",    g("first_name")],
    ["Middle Name:",   g("middle_name")],
    ["Last Name:",     g("last_name")],
    ["Date of Birth:", fmtDate(g("date_of_birth"))],
    ["Gender:",        g("gender")],
  ];
  const ROW0 = H - 88, RGAP = 30;
  for (let i = 0; i < infoRows.length; i++) {
    const y = ROW0 - i * RGAP;
    if (i % 2 === 0) page.drawRectangle({ x: LX - 4, y: y - 9, width: 380, height: RGAP, color: GREY_LIGHT });
    page.drawText(infoRows[i][0],       { x: LX, y, size: 10, font: bld, color: BLACK });
    page.drawText(infoRows[i][1] || "—", { x: VX, y, size: 10, font: reg, color: BLACK });
  }

  // ── NIN bar (full width; top = photo bottom = 740) ──────────────────────────
  const NIN_Y = 692, NIN_H = 48;
  page.drawRectangle({ x: 30, y: NIN_Y, width: W - 60, height: NIN_H, color: GREEN_DARK });
  page.drawText("National Identification Number (NIN)", {
    x: 42, y: NIN_Y + NIN_H - 14, size: 7.5, font: reg, color: rgb(0.75, 1, 0.78),
  });
  const nin = g("id_number") || g("nin") || "";
  page.drawText(spaceNin(nin), { x: 42, y: NIN_Y + 11, size: 20, font: bld, color: WHITE });

  // ── Details grid (2-column) ─────────────────────────────────────────────────
  const GS_Y = NIN_Y - 22; // separator at y=670
  page.drawLine({ start: { x: 30, y: GS_Y }, end: { x: W - 30, y: GS_Y }, thickness: 0.5, color: GREEN_MID });

  type GridRow4 = [string, string, string, string];
  const grid: GridRow4[] = [
    ["Tracking ID:",        g("tracking_id"),                              "Phone:",      g("phone")],
    ["State of Residence:", g("residence_state"),                          "LGA:",        g("residence_lga") || g("residence_lga_name")],
    ["State of Birth:",     g("birth_state"),                             "Birth LGA:",  g("birth_lga")],
  ];
  let gy = GS_Y - 20;
  for (const [l1, v1, l2, v2] of grid) {
    page.drawText(l1,        { x: 40,  y: gy, size: 9, font: bld, color: BLACK });
    page.drawText(v1 || "—", { x: 165, y: gy, size: 9, font: reg, color: BLACK });
    page.drawText(l2,        { x: 325, y: gy, size: 9, font: bld, color: BLACK });
    page.drawText(v2 || "—", { x: 415, y: gy, size: 9, font: reg, color: BLACK });
    gy -= 22;
  }
  // Address row
  page.drawText("Address:", { x: 40, y: gy, size: 9, font: bld, color: BLACK });
  const addr     = g("address") || g("residential_address");
  const addrLns  = splitLines(addr, 420, 9).slice(0, 2);
  if (addrLns.length) {
    addrLns.forEach((l, i) => page.drawText(l, { x: 120, y: gy - i * 13, size: 9, font: reg, color: BLACK }));
  } else {
    page.drawText("—", { x: 120, y: gy, size: 9, font: reg, color: BLACK });
  }

  // ── Certification box ───────────────────────────────────────────────────────
  const CERT_Y = 418, CERT_H = 122;
  page.drawRectangle({ x: 30, y: CERT_Y, width: W - 60, height: CERT_H,
    color: GREEN_LIGHT, borderColor: GREEN_MID, borderWidth: 1 });
  page.drawText("CERTIFICATION", { x: 42, y: CERT_Y + CERT_H - 18, size: 10, font: bld, color: GREEN_DARK });
  page.drawText(
    "This is to certify that the above information has been electronically verified against the",
    { x: 42, y: CERT_Y + CERT_H - 34, size: 8, font: reg, color: GREY },
  );
  page.drawText(
    "National Identity Management Commission (NIMC) database and is valid at the time of generation.",
    { x: 42, y: CERT_Y + CERT_H - 46, size: 8, font: reg, color: GREY },
  );
  page.drawLine({ start: { x: 42, y: CERT_Y + CERT_H - 57 }, end: { x: W - 42, y: CERT_Y + CERT_H - 57 },
    thickness: 0.3, color: GREY_MID });
  page.drawText(`Verified on: ${fmtTs()}`,
    { x: 42, y: CERT_Y + CERT_H - 72, size: 8, font: reg, color: BLACK });
  page.drawText("Status: VERIFIED",
    { x: 378, y: CERT_Y + CERT_H - 72, size: 9, font: bld, color: GREEN_DARK });
  page.drawLine({ start: { x: 42, y: CERT_Y + CERT_H - 82 }, end: { x: W - 42, y: CERT_Y + CERT_H - 82 },
    thickness: 0.3, color: GREY_MID });
  page.drawText(
    "This document is auto-generated and electronically authenticated. Any physical alteration renders it invalid.",
    { x: 42, y: CERT_Y + CERT_H - 96, size: 7, font: reg, color: GREY },
  );

  // ── Disclaimer ──────────────────────────────────────────────────────────────
  const DS_Y = CERT_Y - 30;
  page.drawText("DISCLAIMER", { x: 40, y: DS_Y, size: 8.5, font: bld, color: GREY });
  const disc =
    "This document is issued solely for identity verification purposes. Unauthorized duplication, " +
    "sale, or misuse is a criminal offence under Nigerian law. The National Identity Management " +
    "Commission (NIMC) bears no liability for any misuse of this document.";
  splitLines(disc, W - 80, 7.5).forEach((l, i) =>
    page.drawText(l, { x: 40, y: DS_Y - 15 - i * 12, size: 7.5, font: reg, color: GREY }),
  );

  // ── Footer ──────────────────────────────────────────────────────────────────
  page.drawLine({ start: { x: 30, y: 38 }, end: { x: W - 30, y: 38 }, thickness: 0.3, color: GREY_LIGHT });
  page.drawText(`Ref: ${reference}  |  Generated: ${fmtTs()}`, { x: 40, y: 22, size: 7, font: reg, color: GREY });

  return Buffer.from(await doc.save());
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIP 2 — NIN Standard Slip  (612 × 1008 pt)
// Improved NIN Slip layout with card front and reverse-side disclaimer
// ─────────────────────────────────────────────────────────────────────────────
export async function renderNinStandardSlip(
  g:         (k: string) => string,
  reference: string,
): Promise<Buffer> {
  const doc  = await PDFDocument.create();
  const W = 612, H = 1008;
  const page = doc.addPage([W, H]);
  const reg  = await doc.embedFont(StandardFonts.Helvetica);
  const bld  = await doc.embedFont(StandardFonts.HelveticaBold);

  // ── Header ──────────────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: H - 50, width: W, height: 50, color: GREEN_DARK });
  const hdr1 = "NATIONAL IDENTITY MANAGEMENT COMMISSION";
  page.drawText(hdr1, { x: cx(bld, hdr1, 11, W), y: H - 22, size: 11, font: bld, color: WHITE });
  const hdr2 = "Federal Republic of Nigeria";
  page.drawText(hdr2, { x: cx(reg, hdr2, 9, W),  y: H - 38, size: 9,  font: reg, color: WHITE });

  // Sub-header
  page.drawRectangle({ x: 0, y: H - 68, width: W, height: 18, color: GREEN_MID });
  const sub1 = "IMPROVED NIN SLIP";
  page.drawText(sub1, { x: cx(bld, sub1, 11, W), y: H - 62, size: 11, font: bld, color: WHITE });

  // ── Instructions block ──────────────────────────────────────────────────────
  const instructions = [
    "This is your National Identification Number (NIN) Slip issued by the National Identity",
    "Management Commission (NIMC). Present this slip when required for identity verification.",
    "Keep it safe — do not share with unauthorised parties.",
  ];
  let iy = H - 90;
  for (const line of instructions) {
    page.drawText(line, { x: 36, y: iy, size: 8.5, font: reg, color: GREY });
    iy -= 14;
  }

  // ── Card front (bordered box) ───────────────────────────────────────────────
  // Card: x=30, y=530, w=552, h=316 → top=846
  const CX = 30, CY = 530, CW = 552, CH = 316;
  // Card background
  page.drawRectangle({ x: CX, y: CY, width: CW, height: CH,
    color: rgb(0.95, 0.99, 0.96), borderColor: GREEN_DARK, borderWidth: 2 });

  // Nigeria flag vertical stripes (left and right of card)
  page.drawRectangle({ x: CX,          y: CY, width: 26, height: CH, color: GREEN_DARK });
  page.drawRectangle({ x: CX + CW - 26, y: CY, width: 26, height: CH, color: GREEN_DARK });

  // Card header strip (inside card, green)
  page.drawRectangle({ x: CX + 26, y: CY + CH - 46, width: CW - 52, height: 46, color: GREEN_MID });
  const ch1 = "FEDERAL REPUBLIC OF NIGERIA";
  page.drawText(ch1, { x: CX + 26 + cx(bld, ch1, 10, CW - 52), y: CY + CH - 20, size: 10, font: bld, color: WHITE });
  const ch2 = "National Identity Management Commission — NIN SLIP";
  page.drawText(ch2, { x: CX + 26 + cx(reg, ch2, 7.5, CW - 52), y: CY + CH - 34, size: 7.5, font: reg, color: WHITE });

  // Card photo box
  const CPX = CX + 36, CPY = CY + 90, CPW = 120, CPH = 160; // top=250+90=340→ CY+90+160=780
  page.drawRectangle({ x: CPX - 1, y: CPY - 1, width: CPW + 2, height: CPH + 2,
    color: GREY_LIGHT, borderColor: GREY_MID, borderWidth: 1 });
  const photo = await embedPhotoImage(doc, g("photo"));
  if (photo) {
    page.drawImage(photo, { x: CPX, y: CPY, width: CPW, height: CPH });
  } else {
    page.drawText("PHOTO", { x: CPX + cx(bld, "PHOTO", 10, CPW), y: CPY + CPH / 2 - 5, size: 10, font: bld, color: GREY_MID });
  }

  // QR code (top-right of card content area)
  const nin = g("id_number") || g("nin") || "";
  const QRX = CX + CW - 26 - 90 - 10, QRY = CY + CH - 46 - 90 - 8, QRW = 90;
  const qrBuf = await makeQrPng(nin || reference, QRW * 2);
  const qrImg = await doc.embedPng(qrBuf);
  page.drawImage(qrImg, { x: QRX, y: QRY, width: QRW, height: QRW });

  // Card data fields (right of photo)
  const FX = CPX + CPW + 14, FW = CX + CW - 26 - FX - 10;
  const surname  = (g("last_name")   || "").toUpperCase();
  const given    = [g("first_name"), g("middle_name")].filter(Boolean).join(" ").toUpperCase();
  const dob      = fmtDate(g("date_of_birth"));
  const ninSp    = spaceNin(nin);

  // Surname
  page.drawText("SURNAME", { x: FX, y: CY + CH - 62, size: 7, font: reg, color: GREY });
  page.drawText(surname || "—", { x: FX, y: CY + CH - 76, size: 11, font: bld, color: BLACK });

  // Given names
  page.drawText("GIVEN NAMES", { x: FX, y: CY + CH - 100, size: 7, font: reg, color: GREY });
  const givenLns = splitLines(given || "—", FW + 40, 11).slice(0, 2);
  givenLns.forEach((l, i) =>
    page.drawText(l, { x: FX, y: CY + CH - 114 - i * 14, size: 11, font: bld, color: BLACK }),
  );

  // DOB
  page.drawText("DATE OF BIRTH", { x: FX, y: CY + CH - 152, size: 7, font: reg, color: GREY });
  page.drawText(dob, { x: FX, y: CY + CH - 166, size: 11, font: bld, color: BLACK });

  // NIN (large, full card width minus flag strips)
  const NIN_AREA_Y = CY + 52;
  page.drawLine({ start: { x: CX + 30, y: NIN_AREA_Y + 30 }, end: { x: CX + CW - 30, y: NIN_AREA_Y + 30 },
    thickness: 0.4, color: GREY_MID });
  page.drawText("NATIONAL IDENTIFICATION NUMBER", { x: CX + 36, y: NIN_AREA_Y + 18, size: 7, font: reg, color: GREY });
  page.drawText(ninSp, { x: CX + 36, y: NIN_AREA_Y - 4, size: 22, font: bld, color: BLACK });

  // ── Fold / reverse-side indicator ───────────────────────────────────────────
  const FOLD_Y = 515;
  page.drawLine({ start: { x: 30, y: FOLD_Y }, end: { x: W - 30, y: FOLD_Y }, thickness: 0.7, color: GREY_MID,
    dashArray: [6, 3], dashPhase: 0 });
  const foldLabel = "— — — FOLD / REVERSE SIDE — — —";
  page.drawText(foldLabel, { x: cx(reg, foldLabel, 8, W), y: FOLD_Y + 4, size: 8, font: reg, color: GREY_MID });

  // ── Reverse / disclaimer section ─────────────────────────────────────────────
  // Upside-down section simulated with rotated text block.
  // The reverse side starts at the bottom of the page and reads upward (180° rotation).
  // Origin for rotated text: x=W-40, y=60 (bottom-right, text grows left and up when flipped).
  const revLines = [
    "TERMS & CONDITIONS OF USE",
    "",
    "This NIN Slip is the property of the National Identity Management Commission (NIMC) and",
    "is issued for personal identification purposes only. It must not be reproduced, altered,",
    "transferred or used for any unlawful purpose. Any misuse constitutes a criminal offence",
    "under the NIMC Act and applicable Nigerian laws.",
    "",
    `Ref: ${reference}`,
  ];
  let ry = 65;
  for (const line of [...revLines].reverse()) {
    if (line === "") { ry += 12; continue; }
    const isTitle = line === "TERMS & CONDITIONS OF USE";
    page.drawText(line, {
      x: W - 40, y: ry,
      size: isTitle ? 9 : 7.5,
      font: isTitle ? bld : reg,
      color: isTitle ? GREEN_DARK : GREY,
      rotate: degrees(180),
    });
    ry += isTitle ? 14 : 11;
  }

  // ── Footer (top of page orientation) ────────────────────────────────────────
  page.drawLine({ start: { x: 30, y: 500 }, end: { x: W - 30, y: 500 }, thickness: 0.3, color: GREY_LIGHT });
  // (Footer reference is embedded in the reverse-side block above)

  return Buffer.from(await doc.save());
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIP 3 — NIN Premium (Digital NIN Slip)  (595 × 841.9 pt)
// Card-style front with dark green panel + disclaimer back section
// ─────────────────────────────────────────────────────────────────────────────
export async function renderNinPremiumSlip(
  g:         (k: string) => string,
  tx:        { created_at?: unknown; processed_at?: unknown; updated_at?: unknown },
  reference: string,
): Promise<Buffer> {
  const doc  = await PDFDocument.create();
  const W = 595, H = 841.9;
  const page = doc.addPage([W, H]);
  const reg  = await doc.embedFont(StandardFonts.Helvetica);
  const bld  = await doc.embedFont(StandardFonts.HelveticaBold);

  // ── Header ──────────────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: H - 48, width: W, height: 48, color: GREEN_DARK });
  const hdr1 = "NATIONAL IDENTITY MANAGEMENT COMMISSION";
  page.drawText(hdr1, { x: cx(bld, hdr1, 10, W), y: H - 20, size: 10, font: bld, color: WHITE });
  const hdr2 = "Federal Republic of Nigeria — Digital NIN Slip";
  page.drawText(hdr2, { x: cx(reg, hdr2, 8, W),  y: H - 36, size: 8,  font: reg, color: WHITE });

  // ── Green card panel ─────────────────────────────────────────────────────────
  // Panel: x=30, y=480, w=535, h=306 → top=786, bottom=480
  const PNX = 30, PNY = 480, PNW = 535, PNH = 306;
  page.drawRectangle({ x: PNX, y: PNY, width: PNW, height: PNH, color: GREEN_CARD });

  // Panel header
  const ph1 = "DIGITAL NIN SLIP";
  page.drawText(ph1, { x: PNX + cx(bld, ph1, 13, PNW), y: PNY + PNH - 22, size: 13, font: bld, color: WHITE });
  const ph2 = "Federal Republic of Nigeria";
  page.drawText(ph2, { x: PNX + cx(reg, ph2, 8, PNW), y: PNY + PNH - 36, size: 8, font: reg, color: rgb(0.7, 0.9, 0.73) });

  // Thin accent line inside panel
  page.drawLine({ start: { x: PNX + 20, y: PNY + PNH - 44 }, end: { x: PNX + PNW - 20, y: PNY + PNH - 44 },
    thickness: 0.5, color: rgb(0.5, 0.8, 0.55) });

  // Panel photo
  const PPX = PNX + 20, PPY = PNY + 100, PPW = 100, PPH = 130;
  page.drawRectangle({ x: PPX - 2, y: PPY - 2, width: PPW + 4, height: PPH + 4,
    color: rgb(0.15, 0.50, 0.25), borderColor: rgb(0.4, 0.8, 0.45), borderWidth: 1.5 });
  const photo = await embedPhotoImage(doc, g("photo"));
  if (photo) {
    page.drawImage(photo, { x: PPX, y: PPY, width: PPW, height: PPH });
  } else {
    page.drawText("PHOTO", { x: PPX + cx(bld, "PHOTO", 10, PPW), y: PPY + PPH / 2 - 5, size: 10, font: bld, color: rgb(0.7, 0.9, 0.73) });
  }

  // Panel QR (top-right of panel)
  const nin = g("id_number") || g("nin") || "";
  const QRX = PNX + PNW - 80 - 18, QRY = PNY + PNH - 44 - 80 - 8, QRW = 80;
  const qrBuf = await makeQrPng(nin || reference, QRW * 2);
  const qrImg = await doc.embedPng(qrBuf);
  page.drawImage(qrImg, { x: QRX, y: QRY, width: QRW, height: QRW });

  // Panel data fields (right of photo)
  const DFX = PPX + PPW + 16;
  const surname = (g("last_name") || "").toUpperCase();
  const given   = [g("first_name"), g("middle_name")].filter(Boolean).join(" ").toUpperCase();
  const dob     = fmtDate(g("date_of_birth"));
  const gender  = (g("gender") || "").toUpperCase();
  const issued  = fmtDate(tx.processed_at ?? tx.updated_at ?? tx.created_at ?? "");

  const fieldLabel = (text: string, y: number) =>
    page.drawText(text, { x: DFX, y, size: 7, font: reg, color: rgb(0.7, 0.9, 0.73) });
  const fieldValue = (text: string, y: number, size = 10) =>
    page.drawText(text || "—", { x: DFX, y, size, font: bld, color: WHITE });

  fieldLabel("SURNAME",       PNY + PNH - 62);
  fieldValue(surname || "—",  PNY + PNH - 76);

  fieldLabel("GIVEN NAMES",   PNY + PNH - 100);
  const givenLns = splitLines(given || "—", PNW - (DFX - PNX) - 18, 10).slice(0, 2);
  givenLns.forEach((l, i) =>
    page.drawText(l, { x: DFX, y: PNY + PNH - 114 - i * 13, size: 10, font: bld, color: WHITE }),
  );

  // DOB / Gender / Issue Date row
  const rowY = PNY + PNH - 152;
  fieldLabel("DATE OF BIRTH",  rowY + 12);
  fieldValue(dob,               rowY, 8);
  fieldLabel("GENDER",          rowY + 12); // adjusted x below
  page.drawText("GENDER", { x: DFX + 100, y: rowY + 12, size: 7, font: reg, color: rgb(0.7, 0.9, 0.73) });
  page.drawText(gender || "—",  { x: DFX + 100, y: rowY, size: 8, font: bld, color: WHITE });
  page.drawText("ISSUE DATE", { x: DFX + 178, y: rowY + 12, size: 7, font: reg, color: rgb(0.7, 0.9, 0.73) });
  page.drawText(issued, { x: DFX + 178, y: rowY, size: 8, font: bld, color: WHITE });

  // NIN (across full panel width, bottom section)
  page.drawLine({ start: { x: PNX + 16, y: PNY + 80 }, end: { x: PNX + PNW - 16, y: PNY + 80 },
    thickness: 0.5, color: rgb(0.5, 0.8, 0.55) });
  page.drawText("NATIONAL IDENTIFICATION NUMBER", {
    x: PNX + 20, y: PNY + 66, size: 7, font: reg, color: rgb(0.7, 0.9, 0.73),
  });
  const ninSp = spaceNin(nin);
  page.drawText(ninSp, { x: PNX + 20, y: PNY + 44, size: 20, font: bld, color: WHITE });

  // ── Disclaimer section (below card) ─────────────────────────────────────────
  const DISC_TOP = PNY - 20;
  page.drawText("DISCLAIMER & TERMS OF USE", { x: 36, y: DISC_TOP, size: 9, font: bld, color: GREEN_DARK });
  page.drawLine({ start: { x: 30, y: DISC_TOP - 8 }, end: { x: W - 30, y: DISC_TOP - 8 },
    thickness: 0.5, color: GREEN_MID });

  const discText =
    "This Digital NIN Slip is issued by the National Identity Management Commission (NIMC) for " +
    "identity verification purposes only. It is a legally recognised document under the NIMC Act. " +
    "Reproduction, alteration, or unauthorised use is prohibited and constitutes a criminal offence. " +
    "NIMC bears no liability for losses arising from misuse of this document.";
  splitLines(discText, W - 72, 8).forEach((l, i) =>
    page.drawText(l, { x: 36, y: DISC_TOP - 24 - i * 13, size: 8, font: reg, color: GREY }),
  );

  // Certification line
  const certY = DISC_TOP - 100;
  page.drawText(`Verified on: ${fmtTs()}  |  Status: VERIFIED`, { x: 36, y: certY, size: 8, font: reg, color: BLACK });

  // ── Footer ──────────────────────────────────────────────────────────────────
  page.drawLine({ start: { x: 30, y: 36 }, end: { x: W - 30, y: 36 }, thickness: 0.3, color: GREY_LIGHT });
  page.drawText(`Ref: ${reference}  |  Generated: ${fmtTs()}`, { x: 36, y: 20, size: 7, font: reg, color: GREY });

  return Buffer.from(await doc.save());
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIP 4 — BVN Basic Slip  (595 × 841.9 pt)
// Federal Republic of Nigeria / Verified BVN Details layout
// ─────────────────────────────────────────────────────────────────────────────
export async function renderBvnSlip(
  g:         (k: string) => string,
  reference: string,
): Promise<Buffer> {
  const doc  = await PDFDocument.create();
  const W = 595, H = 841.9;
  const page = doc.addPage([W, H]);
  const reg  = await doc.embedFont(StandardFonts.Helvetica);
  const bld  = await doc.embedFont(StandardFonts.HelveticaBold);

  // ── Header ──────────────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: H - 50, width: W, height: 50, color: GREEN_DARK });
  const hdr1 = "FEDERAL REPUBLIC OF NIGERIA";
  page.drawText(hdr1, { x: cx(bld, hdr1, 13, W), y: H - 22, size: 13, font: bld, color: WHITE });
  const hdr2 = "Central Bank of Nigeria — Bank Verification Number (BVN)";
  page.drawText(hdr2, { x: cx(reg, hdr2, 8, W), y: H - 38, size: 8, font: reg, color: WHITE });

  // Sub-header
  page.drawRectangle({ x: 0, y: H - 68, width: W, height: 18, color: GREEN_MID });
  const sub1 = "Verified BVN Details";
  page.drawText(sub1, { x: cx(bld, sub1, 10, W), y: H - 62, size: 10, font: bld, color: WHITE });

  // ── Photo box (right column): x=430, y=605, w=135, h=170 → top=775 ─────────
  const PX = 430, PY = 605, PW = 135, PH = 170;
  page.drawRectangle({ x: PX - 2, y: PY - 2, width: PW + 4, height: PH + 4,
    color: GREY_LIGHT, borderColor: GREEN_DARK, borderWidth: 1.5 });
  const photo = await embedPhotoImage(doc, g("photo"));
  if (photo) {
    page.drawImage(photo, { x: PX, y: PY, width: PW, height: PH });
  } else {
    page.drawText("PASSPORT", { x: PX + cx(bld, "PASSPORT", 9, PW), y: PY + PH / 2 + 5,  size: 9, font: bld, color: GREY_MID });
    page.drawText("PHOTO",    { x: PX + cx(bld, "PHOTO",    9, PW), y: PY + PH / 2 - 8,  size: 9, font: bld, color: GREY_MID });
  }

  // ── Personal info rows (left column, x < 425) ───────────────────────────────
  // 6 rows starting at y=758, spacing 27 pt.
  const LX = 36, VX = 170;
  const infoRows: [string, string][] = [
    ["First Name:",     g("first_name")],
    ["Middle Name:",    g("middle_name")],
    ["Last Name:",      g("last_name")],
    ["Date of Birth:",  fmtDate(g("date_of_birth"))],
    ["Gender:",         g("gender")],
    ["Marital Status:", g("marital_status")],
  ];
  const ROW0 = H - 88, RGAP = 28;
  for (let i = 0; i < infoRows.length; i++) {
    const y = ROW0 - i * RGAP;
    if (i % 2 === 0) page.drawRectangle({ x: LX - 4, y: y - 8, width: 386, height: RGAP, color: GREY_LIGHT });
    page.drawText(infoRows[i][0],        { x: LX, y, size: 10, font: bld, color: BLACK });
    page.drawText(infoRows[i][1] || "—", { x: VX, y, size: 10, font: reg, color: BLACK });
  }

  // ── BVN bar (full width; top = photo bottom = 605) ──────────────────────────
  // BVN bar: y=557, h=48 → top=605
  const BVN_Y = 557, BVN_H = 48;
  page.drawRectangle({ x: 30, y: BVN_Y, width: W - 60, height: BVN_H, color: GREEN_DARK });
  page.drawText("Bank Verification Number (BVN)", {
    x: 42, y: BVN_Y + BVN_H - 14, size: 7.5, font: reg, color: rgb(0.75, 1, 0.78),
  });
  const bvn = g("bvn") || g("id_number") || "";
  page.drawText(spaceNin(bvn), { x: 42, y: BVN_Y + 11, size: 20, font: bld, color: WHITE });

  // ── Details grid ───────────────────────────────────────────────────────────
  const GS_Y = BVN_Y - 20; // separator at y=537
  page.drawLine({ start: { x: 30, y: GS_Y }, end: { x: W - 30, y: GS_Y }, thickness: 0.5, color: GREEN_MID });

  // Single-row fields (phone + NIN)
  let gy = GS_Y - 20;
  page.drawText("Phone Number:", { x: 40, y: gy, size: 9, font: bld, color: BLACK });
  page.drawText(g("phone") || "—", { x: 152, y: gy, size: 9, font: reg, color: BLACK });
  page.drawText("NIN:", { x: 310, y: gy, size: 9, font: bld, color: BLACK });
  page.drawText(g("nin") || g("id_number") || "—", { x: 340, y: gy, size: 9, font: reg, color: BLACK });
  gy -= 22;

  // Enrollment institution / branch
  page.drawText("Enrollment Bank:", { x: 40, y: gy, size: 9, font: bld, color: BLACK });
  page.drawText(g("enrollment_institution") || "—", { x: 155, y: gy, size: 9, font: reg, color: BLACK });
  page.drawText("Branch:", { x: 340, y: gy, size: 9, font: bld, color: BLACK });
  page.drawText(g("enrollment_branch") || "—", { x: 385, y: gy, size: 9, font: reg, color: BLACK });
  gy -= 22;

  // Origin state / LGA
  page.drawText("State of Origin:", { x: 40, y: gy, size: 9, font: bld, color: BLACK });
  page.drawText(g("origin_state") || "—", { x: 155, y: gy, size: 9, font: reg, color: BLACK });
  page.drawText("LGA:", { x: 340, y: gy, size: 9, font: bld, color: BLACK });
  page.drawText(g("origin_lga") || "—", { x: 368, y: gy, size: 9, font: reg, color: BLACK });
  gy -= 22;

  // Residence state / LGA
  page.drawText("State of Residence:", { x: 40, y: gy, size: 9, font: bld, color: BLACK });
  page.drawText(g("residence_state") || "—", { x: 163, y: gy, size: 9, font: reg, color: BLACK });
  page.drawText("LGA:", { x: 340, y: gy, size: 9, font: bld, color: BLACK });
  page.drawText(g("residence_lga") || g("residence_lga_name") || "—", { x: 368, y: gy, size: 9, font: reg, color: BLACK });
  gy -= 22;

  // Address
  page.drawText("Address:", { x: 40, y: gy, size: 9, font: bld, color: BLACK });
  const addr    = g("address") || g("residential_address");
  const addrLns = splitLines(addr, 380, 9).slice(0, 2);
  if (addrLns.length) {
    addrLns.forEach((l, i) => page.drawText(l, { x: 120, y: gy - i * 13, size: 9, font: reg, color: BLACK }));
  } else {
    page.drawText("—", { x: 120, y: gy, size: 9, font: reg, color: BLACK });
  }

  // ── Certification box ───────────────────────────────────────────────────────
  const CERT_Y = 260, CERT_H = 118;
  page.drawRectangle({ x: 30, y: CERT_Y, width: W - 60, height: CERT_H,
    color: GREEN_LIGHT, borderColor: GREEN_MID, borderWidth: 1 });
  page.drawText("CERTIFICATION", { x: 42, y: CERT_Y + CERT_H - 18, size: 10, font: bld, color: GREEN_DARK });
  page.drawText(
    "This is to certify that the above BVN information has been electronically verified against the",
    { x: 42, y: CERT_Y + CERT_H - 34, size: 8, font: reg, color: GREY },
  );
  page.drawText(
    "Central Bank of Nigeria (CBN) BVN database and is valid at the time of generation.",
    { x: 42, y: CERT_Y + CERT_H - 46, size: 8, font: reg, color: GREY },
  );
  page.drawLine({ start: { x: 42, y: CERT_Y + CERT_H - 57 }, end: { x: W - 42, y: CERT_Y + CERT_H - 57 },
    thickness: 0.3, color: GREY_MID });
  page.drawText(`Verified on: ${fmtTs()}`,
    { x: 42, y: CERT_Y + CERT_H - 72, size: 8, font: reg, color: BLACK });
  page.drawText("Status: VERIFIED",
    { x: 360, y: CERT_Y + CERT_H - 72, size: 9, font: bld, color: GREEN_DARK });
  page.drawLine({ start: { x: 42, y: CERT_Y + CERT_H - 82 }, end: { x: W - 42, y: CERT_Y + CERT_H - 82 },
    thickness: 0.3, color: GREY_MID });
  page.drawText(
    "This document is auto-generated and electronically authenticated. Any physical alteration renders it invalid.",
    { x: 42, y: CERT_Y + CERT_H - 96, size: 7, font: reg, color: GREY },
  );

  // ── Disclaimer ──────────────────────────────────────────────────────────────
  const DS_Y = CERT_Y - 30;
  page.drawText("DISCLAIMER", { x: 40, y: DS_Y, size: 8.5, font: bld, color: GREY });
  const disc =
    "This BVN report is issued solely for identity and financial verification purposes. " +
    "Unauthorized duplication, sale, or misuse of this document is a criminal offence. " +
    "The Central Bank of Nigeria (CBN) and the issuing institution bear no liability for any misuse.";
  splitLines(disc, W - 80, 7.5).forEach((l, i) =>
    page.drawText(l, { x: 40, y: DS_Y - 15 - i * 12, size: 7.5, font: reg, color: GREY }),
  );

  // ── Footer ──────────────────────────────────────────────────────────────────
  page.drawLine({ start: { x: 30, y: 38 }, end: { x: W - 30, y: 38 }, thickness: 0.3, color: GREY_LIGHT });
  page.drawText(`Ref: ${reference}  |  Generated: ${fmtTs()}`, { x: 40, y: 22, size: 7, font: reg, color: GREY });

  return Buffer.from(await doc.save());
}

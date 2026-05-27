import PDFDocument from "pdfkit";
import QRCode from "qrcode";

// ── Palette ───────────────────────────────────────────────────────────────────
const RED       = "#cc0000";
const DKGRN     = "#1a6b1a";
const ORANGE    = "#cc6600";
const TEAL      = "#007B7B";
const CARDGRN   = "#2a5e2a";
const STAMP_GRN = "#3a7a3a";

// ── Helpers ───────────────────────────────────────────────────────────────────
export function s(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function fmtDate(d: unknown): string {
  if (!d) return "";
  const raw = String(d);
  try {
    const dt = new Date(raw);
    if (!isNaN(dt.getTime())) {
      return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    }
  } catch { /* */ }
  return raw;
}

function fmtTs(d: unknown): string {
  try {
    return new Date(String(d)).toLocaleString("en-NG", {
      day: "2-digit", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return String(d); }
}

// ── QR code ───────────────────────────────────────────────────────────────────
async function makeQr(content: string, px: number): Promise<Buffer> {
  return QRCode.toBuffer(content || "NGA-NIMC", { type: "png", width: px, margin: 1 });
}

// ── Photo embedding ───────────────────────────────────────────────────────────
function embedPhoto(
  doc: PDFKit.PDFDocument,
  photo: string,
  x: number, y: number, w: number, h: number,
): void {
  if (!photo || photo === "[photo_redacted]") {
    doc.save()
      .rect(x, y, w, h).fillColor("#e5e7eb").fill()
      .fillColor("#9ca3af").fontSize(7).font("Helvetica")
      .text("No Photo", x, y + h / 2 - 4, { width: w, align: "center" })
      .restore();
    return;
  }
  try {
    const buf = Buffer.from(photo, "base64");
    doc.image(buf, x, y, { width: w, height: h, cover: [w, h] });
    doc.save().rect(x, y, w, h).strokeColor("#cccccc").lineWidth(0.5).stroke().restore();
  } catch {
    doc.save()
      .rect(x, y, w, h).fillColor("#e5e7eb").fill()
      .fillColor("#9ca3af").fontSize(7).font("Helvetica")
      .text("No Photo", x, y + h / 2 - 4, { width: w, align: "center" })
      .restore();
  }
}

// ── Nigerian coat of arms (simplified vector) ─────────────────────────────────
function drawCoatOfArms(doc: PDFKit.PDFDocument, cx: number, cy: number, h: number): void {
  const sc = h / 60;
  const x0 = cx;
  const y0 = cy - h / 2;

  doc.save();

  // Green base mound
  doc.save()
    .ellipse(x0, y0 + 55 * sc, 16 * sc, 5 * sc)
    .fillColor("#228B22").fill()
    .restore();

  // Left supporter (white horse, simplified)
  doc.save()
    .moveTo(x0 - 10 * sc, y0 + 24 * sc)
    .lineTo(x0 - 20 * sc, y0 + 16 * sc)
    .lineTo(x0 - 23 * sc, y0 + 40 * sc)
    .lineTo(x0 - 13 * sc, y0 + 43 * sc)
    .closePath()
    .fillColor("#f0f0f0").fill()
    .strokeColor("#cccccc").lineWidth(0.3).stroke()
    .restore();

  // Right supporter (white horse, simplified)
  doc.save()
    .moveTo(x0 + 10 * sc, y0 + 24 * sc)
    .lineTo(x0 + 20 * sc, y0 + 16 * sc)
    .lineTo(x0 + 23 * sc, y0 + 40 * sc)
    .lineTo(x0 + 13 * sc, y0 + 43 * sc)
    .closePath()
    .fillColor("#f0f0f0").fill()
    .strokeColor("#cccccc").lineWidth(0.3).stroke()
    .restore();

  // Shield (black, pointed bottom)
  doc.save()
    .moveTo(x0 - 12 * sc, y0 + 20 * sc)
    .lineTo(x0 + 12 * sc, y0 + 20 * sc)
    .lineTo(x0 + 12 * sc, y0 + 40 * sc)
    .bezierCurveTo(x0 + 12 * sc, y0 + 47 * sc, x0, y0 + 52 * sc, x0, y0 + 52 * sc)
    .bezierCurveTo(x0, y0 + 52 * sc, x0 - 12 * sc, y0 + 47 * sc, x0 - 12 * sc, y0 + 40 * sc)
    .closePath()
    .fillColor("#000000").fill()
    .restore();

  // White Y-shape on shield (wavy branches)
  doc.save()
    .lineWidth(2.5 * sc).strokeColor("#ffffff")
    // upper-left branch
    .moveTo(x0 - 10 * sc, y0 + 21 * sc)
    .bezierCurveTo(x0 - 6 * sc, y0 + 24 * sc, x0 - 3 * sc, y0 + 28 * sc, x0, y0 + 31 * sc)
    .stroke()
    // upper-right branch
    .moveTo(x0 + 10 * sc, y0 + 21 * sc)
    .bezierCurveTo(x0 + 6 * sc, y0 + 24 * sc, x0 + 3 * sc, y0 + 28 * sc, x0, y0 + 31 * sc)
    .stroke()
    // vertical stem
    .moveTo(x0, y0 + 31 * sc)
    .lineTo(x0, y0 + 48 * sc)
    .stroke()
    .restore();

  // Eagle body (dark, atop shield)
  doc.save()
    .ellipse(x0, y0 + 11 * sc, 6 * sc, 7 * sc)
    .fillColor("#1a1a1a").fill()
    .restore();

  // Eagle left wing
  doc.save()
    .moveTo(x0 - 5 * sc, y0 + 11 * sc)
    .bezierCurveTo(x0 - 14 * sc, y0 + 5 * sc, x0 - 20 * sc, y0 + 9 * sc, x0 - 22 * sc, y0 + 15 * sc)
    .bezierCurveTo(x0 - 18 * sc, y0 + 17 * sc, x0 - 10 * sc, y0 + 15 * sc, x0 - 5 * sc, y0 + 14 * sc)
    .closePath()
    .fillColor("#1a1a1a").fill()
    .restore();

  // Eagle right wing
  doc.save()
    .moveTo(x0 + 5 * sc, y0 + 11 * sc)
    .bezierCurveTo(x0 + 14 * sc, y0 + 5 * sc, x0 + 20 * sc, y0 + 9 * sc, x0 + 22 * sc, y0 + 15 * sc)
    .bezierCurveTo(x0 + 18 * sc, y0 + 17 * sc, x0 + 10 * sc, y0 + 15 * sc, x0 + 5 * sc, y0 + 14 * sc)
    .closePath()
    .fillColor("#1a1a1a").fill()
    .restore();

  doc.restore();
}

// ── NIMC circular logo ────────────────────────────────────────────────────────
function drawNimcLogo(doc: PDFKit.PDFDocument, cx: number, cy: number, r: number): void {
  doc.save()
    .circle(cx, cy, r).strokeColor(DKGRN).lineWidth(1.8).stroke()
    .circle(cx, cy, r * 0.72).strokeColor(DKGRN).lineWidth(1).stroke()
    .fillColor(DKGRN).fontSize(r * 0.42).font("Helvetica-Bold")
    .text("NIMC", cx - r * 0.48, cy - r * 0.26, { width: r * 0.96, align: "center" })
    .restore();
}

// ── Verified stamp ────────────────────────────────────────────────────────────
function drawVerifiedStamp(doc: PDFKit.PDFDocument, cx: number, cy: number, r: number): void {
  doc.save()
    .circle(cx, cy, r).strokeColor(STAMP_GRN).lineWidth(2).stroke()
    .circle(cx, cy, r * 0.74).strokeColor(STAMP_GRN).lineWidth(1.2).stroke()
    .fillColor(STAMP_GRN).fontSize(r * 0.28).font("Helvetica-Bold")
    .text("★ VERIFIED ★", cx - r * 0.72, cy - r * 0.17, { width: r * 1.44, align: "center" })
    .restore();
}

// ── Page footer ───────────────────────────────────────────────────────────────
function addPageFooter(doc: PDFKit.PDFDocument, reference: string): void {
  const W     = doc.page.width;
  const footY = doc.page.height - 32;
  doc.moveTo(40, footY).lineTo(W - 40, footY).strokeColor("#dddddd").lineWidth(0.5).stroke();
  doc.fillColor("#aaaaaa").fontSize(7).font("Helvetica")
    .text(
      `Reference: ${reference}  |  Generated: ${fmtTs(new Date())}  |  System-generated document`,
      40, footY + 8,
      { align: "center", width: W - 80 },
    );
}

// ═════════════════════════════════════════════════════════════════════════════
// SLIP 1 — NIN Information Slip
// Layout: CoA + title + NIMC logo | fields / photo / Verified | NIN | footer grid
// ═════════════════════════════════════════════════════════════════════════════
export async function renderNinInformationSlip(
  doc:       PDFKit.PDFDocument,
  g:         (k: string) => string,
  reference: string,
): Promise<void> {
  const ML = 50;
  const MR = 545;
  const CW = MR - ML;

  // ── Header ──────────────────────────────────────────────────────────────────
  drawCoatOfArms(doc, 82, 42, 55);

  doc.fillColor("#000000").fontSize(18).font("Helvetica-Bold")
    .text("Federal Republic of Nigeria", ML + 48, 16, { align: "center", width: CW - 65 });
  doc.fillColor("#000000").fontSize(14).font("Helvetica-Bold")
    .text("Verified NIN Details", ML + 48, 38, { align: "center", width: CW - 65 });

  drawNimcLogo(doc, MR - 26, 38, 24);

  doc.moveTo(ML, 72).lineTo(MR, 72).strokeColor("#aaaaaa").lineWidth(0.5).stroke();

  // ── Body columns ────────────────────────────────────────────────────────────
  const bodyY  = 82;
  const photoW = 130;
  const photoH = 158;
  const photoX = 213;
  const photoY = bodyY;
  const rightX = photoX + photoW + 14;
  const rightW = MR - rightX;

  // Left column: labels + values
  const leftFields: Array<[string, string, boolean?]> = [
    ["First Name:",       g("first_name"),                    false],
    ["Middle\nName:",     g("middle_name"),                   true],
    ["Last Name:",        g("last_name"),                     false],
    ["Date of\nBirth:",   fmtDate(g("date_of_birth")),        true],
    ["Gender:",           g("gender"),                        false],
  ];

  let lY = bodyY;
  for (const [label, value, twoLine] of leftFields) {
    doc.fillColor("#333333").fontSize(8).font("Helvetica-Bold")
      .text(label, ML, lY, { width: 80 });
    if (value) {
      doc.fillColor("#000000").fontSize(9).font("Helvetica")
        .text(value, ML + 82, twoLine ? lY + 8 : lY);
    }
    lY += twoLine ? 30 : 22;
  }
  // Signature line in left column
  doc.fillColor("#333333").fontSize(8).font("Helvetica-Bold").text("Signature:", ML, lY);
  doc.moveTo(ML + 82, lY + 13).lineTo(ML + 195, lY + 13)
    .strokeColor("#999999").lineWidth(0.5).stroke();

  // Photo
  embedPhoto(doc, g("photo"), photoX, photoY, photoW, photoH);
  doc.fillColor("#444444").fontSize(7).font("Helvetica-Bold")
    .text("Signature:", photoX, photoY + photoH + 4, { width: photoW, align: "center" });
  doc.moveTo(photoX + 10, photoY + photoH + 17).lineTo(photoX + photoW - 10, photoY + photoH + 17)
    .strokeColor("#999999").lineWidth(0.5).stroke();

  // Right column: "Verified" + notes + stamp
  doc.fillColor(RED).fontSize(38).font("Helvetica-Bold")
    .text("Verified", rightX, bodyY, { width: rightW });

  doc.fillColor("#333333").fontSize(7).font("Helvetica")
    .text(
      "This is a property of National Identity Management Commission (NIMC), Nigeria. " +
      "If found, please return to the nearest NIMC office.",
      rightX, bodyY + 46, { width: rightW },
    );

  let nY = bodyY + 86;
  const notes = [
    "This NIN slip remains the property of the Federal Republic of Nigeria, and must be surrendered on demand;",
    "This NIN slip does not imply nor confer the citizenship of Federal Republic of Nigeria on the individual the document is issued to;",
    "This NIN slip is valid for the lifetime of the owner and",
  ];
  for (let i = 0; i < notes.length; i++) {
    doc.fillColor("#333333").fontSize(7).font("Helvetica")
      .text(`${i + 1}.  ${notes[i]}`, rightX, nY, { width: rightW });
    nY += 25;
  }

  doc.fillColor(DKGRN).fontSize(8).font("Helvetica-Bold")
    .text("DOES NOT EXPIRE", rightX + 18, nY, { width: rightW - 18 });
  nY += 18;

  drawVerifiedStamp(doc, rightX + rightW / 2, nY + 30, 28);

  // ── NIN NUMBER ──────────────────────────────────────────────────────────────
  const ninRowY = Math.max(lY + 28, photoY + photoH + 30, nY + 70);

  doc.moveTo(ML, ninRowY).lineTo(MR, ninRowY).strokeColor("#aaaaaa").lineWidth(0.5).stroke();

  const nin = g("id_number") || g("nin") || "—";
  doc.fillColor("#000000").fontSize(13).font("Helvetica-Bold")
    .text("NIN NUMBER:", ML, ninRowY + 10);
  doc.fillColor("#000000").fontSize(24).font("Helvetica-Bold")
    .text(nin, ML + 138, ninRowY + 5);

  // ── Footer grid ─────────────────────────────────────────────────────────────
  const fgY  = ninRowY + 46;
  const col2 = ML + CW / 2;

  doc.moveTo(ML, fgY).lineTo(MR, fgY).strokeColor("#cccccc").lineWidth(0.5).stroke();

  let gY = fgY + 10;
  const gridRows: Array<[string, string, boolean, string, string]> = [
    ["Tracking ID:",        g("tracking_id"),                          false, "Phone Number:",        g("phone")],
    ["Residence\nState:",   g("residence_state"),                      true,  "Residence\nLGA/Town:", g("residence_lga") || g("residence_lga_name")],
    ["Birth State:",        g("birth_state"),                          false, "Birth LGA:",           g("birth_lga")],
  ];

  for (const [l1, v1, twoLine, l2, v2] of gridRows) {
    const valOffset = twoLine ? 8 : 0;
    doc.fillColor("#333333").fontSize(8).font("Helvetica-Bold").text(l1, ML,   gY, { width: 90 });
    doc.fillColor("#000000").fontSize(9) .font("Helvetica")   .text(v1 || "—", ML   + 95, gY + valOffset);
    doc.fillColor("#333333").fontSize(8).font("Helvetica-Bold").text(l2, col2, gY, { width: 110 });
    doc.fillColor("#000000").fontSize(9) .font("Helvetica")   .text(v2 || "—", col2 + 115, gY + valOffset);
    gY += twoLine ? 30 : 22;
  }

  doc.fillColor("#333333").fontSize(8).font("Helvetica-Bold").text("Address:", ML, gY);
  doc.fillColor("#000000").fontSize(9).font("Helvetica")
    .text(g("address") || g("residential_address") || "—", ML + 82, gY, { width: CW - 82 });

  addPageFooter(doc, reference);
}

// ═════════════════════════════════════════════════════════════════════════════
// SLIP 2 — NIN Standard Slip
// Layout: instructions | card-front (photo/CoA/NGA/QR/fields/NIN) | card-back (upside-down disclaimer)
// ═════════════════════════════════════════════════════════════════════════════
export async function renderNinStandardSlip(
  doc:       PDFKit.PDFDocument,
  g:         (k: string) => string,
  reference: string,
): Promise<void> {
  const W = 595;

  // ── Instructions (bold, centered, top of page) ───────────────────────────────
  doc.fillColor("#000000").fontSize(10).font("Helvetica-Bold")
    .text("Please find below your Improved NIN Slip", 40, 28, { align: "center", width: 515 });
  doc.fillColor("#000000").fontSize(9).font("Helvetica-Bold")
    .text("You may cut it out of the paper, fold and laminate as desired.", 40, 46, { align: "center", width: 515 });
  doc.fillColor("#000000").fontSize(8).font("Helvetica-Bold")
    .text(
      "For your security & privacy, please DO NOT permit others to make photocopies of this document.",
      40, 62, { align: "center", width: 515 },
    );

  // ── Card 1 — Front face ────────────────────────────────────────────────────
  const cardW = 400;
  const cardX = (W - cardW) / 2;   // centred
  const cardY = 96;
  const cardH = 218;

  doc.save()
    .roundedRect(cardX, cardY, cardW, cardH, 3)
    .strokeColor("#aaaaaa").lineWidth(0.8).stroke()
    .restore();

  // Photo (left side)
  const photoW = 92;
  const photoH = 110;
  embedPhoto(doc, g("photo"), cardX + 10, cardY + 10, photoW, photoH);

  // Coat of arms (centre of card header)
  const coaCx = cardX + photoW + 14 + 36;
  const coaCy = cardY + 30;
  drawCoatOfArms(doc, coaCx, coaCy, 46);

  // "NGA" watermark-style text (top right area)
  doc.fillColor("#888888").fontSize(13).font("Helvetica-Bold")
    .text("NGA", cardX + cardW - 56, cardY + 10);

  // QR code (right side of card)
  const nin = g("id_number") || g("nin") || "";
  const qrSize = 70;
  const qrX    = cardX + cardW - qrSize - 8;
  const qrY    = cardY + 30;
  const qrBuf  = await makeQr(nin || reference, qrSize);
  doc.image(qrBuf, qrX, qrY, { width: qrSize, height: qrSize });

  // Surname / Given Names / Date of Birth (center text area)
  const tx2 = coaCx + 26;
  const tw2  = qrX - tx2 - 6;
  let   ty2  = cardY + 58;

  doc.fillColor("#888888").fontSize(7).font("Helvetica").text("Surname/Nom", tx2, ty2, { width: tw2 });
  ty2 += 10;
  doc.fillColor("#000000").fontSize(12).font("Helvetica-Bold")
    .text(g("last_name").toUpperCase() || "—", tx2, ty2, { width: tw2 });
  ty2 += 22;
  doc.fillColor("#888888").fontSize(7).font("Helvetica").text("Given Names/Prenoms", tx2, ty2, { width: tw2 });
  ty2 += 10;
  doc.fillColor("#000000").fontSize(12).font("Helvetica-Bold")
    .text([g("first_name"), g("middle_name")].filter(Boolean).join(" ").toUpperCase() || "—", tx2, ty2, { width: tw2 });
  ty2 += 22;
  doc.fillColor("#888888").fontSize(7).font("Helvetica").text("Date of Birth", tx2, ty2, { width: tw2 });
  ty2 += 10;
  doc.fillColor("#000000").fontSize(12).font("Helvetica-Bold")
    .text(fmtDate(g("date_of_birth")) || "—", tx2, ty2);

  // NIN at bottom of card (large, spaced)
  const ninSpaced = nin.replace(/(.{4})/g, "$1 ").trim();
  doc.fillColor("#555555").fontSize(8.5).font("Helvetica-Bold")
    .text("National Identification Number (NIN)", cardX, cardY + cardH - 52, { align: "center", width: cardW });
  doc.fillColor("#000000").fontSize(22).font("Helvetica-Bold")
    .text(ninSpaced || "—", cardX, cardY + cardH - 37, { align: "center", width: cardW });
  doc.fillColor("#666666").fontSize(6.5).font("Helvetica-Oblique")
    .text(
      "Kindly ensure you scan the barcode to verify the credentials",
      cardX, cardY + cardH - 14, { align: "center", width: cardW },
    );

  // ── Card 2 — Disclaimer (upside-down, fold-and-laminate back) ───────────────
  const discY = cardY + cardH + 8;
  const discH = 148;

  doc.save()
    .roundedRect(cardX, discY, cardW, discH, 3)
    .strokeColor("#aaaaaa").lineWidth(0.8).stroke()
    .restore();

  // Rotate 180° around the centre of the disclaimer card so text appears upside-down
  const discCx = cardX + cardW / 2;
  const discCy = discY + discH / 2;

  doc.save();
  doc.rotate(180, { origin: [discCx, discCy] });

  let dY = discY + 10;
  doc.fillColor("#000000").fontSize(13).font("Helvetica-Bold")
    .text("DISCLAIMER", cardX, dY, { align: "center", width: cardW });
  dY += 17;
  doc.fillColor("#666666").fontSize(7.5).font("Helvetica-Oblique")
    .text("Trust, but verify", cardX, dY, { align: "center", width: cardW });
  dY += 14;

  const discLines = [
    "Kindly ensure each time this ID is presented, that you verify the credentials using a Government-APPROVED verification resource.",
    "The details on the front of this NIN Slip must EXACTLY match the verification result.",
  ];
  for (const line of discLines) {
    doc.fillColor("#333333").fontSize(6.5).font("Helvetica")
      .text(line, cardX + 18, dY, { width: cardW - 36, align: "center" });
    dY += 18;
  }

  doc.fillColor("#000000").fontSize(10).font("Helvetica-Bold")
    .text("CAUTION!", cardX, dY, { align: "center", width: cardW });
  dY += 14;

  const cautionLines = [
    "If this NIN was not issued to the person on the front of this document, please DO NOT attempt to scan, photocopy or replicate the personal data contained herein.",
    "You are only permitted to scan the barcode for the purpose of identity verification.",
    "The FEDERAL GOVERNMENT of NIGERIA assumes no responsibility if you accept any variance in the scan result or do not scan the 2D barcode overleaf.",
  ];
  for (const line of cautionLines) {
    doc.fillColor("#333333").fontSize(6.5).font("Helvetica")
      .text(line, cardX + 18, dY, { width: cardW - 36, align: "center" });
    dY += 16;
  }

  doc.restore();

  addPageFooter(doc, reference);
}

// ═════════════════════════════════════════════════════════════════════════════
// SLIP 3 — NIN Premium (Digital NIN Slip)
// Layout: outer card | green left panel (photo/QR/NGA/fields/NIN) | white right panel (disclaimer)
// ═════════════════════════════════════════════════════════════════════════════
export async function renderNinPremiumSlip(
  doc:       PDFKit.PDFDocument,
  g:         (k: string) => string,
  tx:        { created_at?: unknown; processed_at?: unknown; updated_at?: unknown },
  reference: string,
): Promise<void> {
  const W = 595;

  const outerX = 58;
  const outerY = 118;
  const outerW = 479;
  const outerH = 212;

  // Shadow
  doc.save()
    .roundedRect(outerX + 3, outerY + 3, outerW, outerH, 6)
    .fillColor("#cccccc").fill()
    .restore();

  // Outer border (drawn first, before clipping)
  doc.save()
    .roundedRect(outerX, outerY, outerW, outerH, 6)
    .strokeColor("#bbbbbb").lineWidth(0.5).stroke()
    .restore();

  // ── Left panel: green background (clipped to outer card shape) ────────────────
  const leftW = Math.floor(outerW * 0.52);
  const rightX = outerX + leftW;
  const rightW = outerW - leftW;

  doc.save();
  // Clip to the outer card rounded shape
  doc.roundedRect(outerX, outerY, outerW, outerH, 6).clip();
  // Fill left portion + 1px to seal the seam
  doc.rect(outerX, outerY, leftW + 1, outerH).fillColor(CARDGRN).fill();

  // Divider between panels
  doc.moveTo(rightX, outerY).lineTo(rightX, outerY + outerH)
    .strokeColor("#cccccc").lineWidth(0.4).stroke();

  // ── Left panel content ─────────────────────────────────────────────────────
  const lx = outerX + 8;
  let   ly = outerY + 8;

  doc.fillColor("#6fcf6f").fontSize(7.5).font("Helvetica-Bold")
    .text("FEDERAL REPUBLIC OF NIGERIA", lx, ly, { width: leftW - 16 });
  ly += 12;
  doc.fillColor("#81c784").fontSize(6).font("Helvetica")
    .text("DIGITAL NIN SLIP", lx, ly, { width: leftW - 16 });
  ly += 16;

  // Passport photo
  const photoW = 80;
  const photoH = 96;
  embedPhoto(doc, g("photo"), lx, ly, photoW, photoH);

  // QR code (top-right of left panel)
  const qrSize = 58;
  const qrX    = rightX - qrSize - 8;
  const qrY    = outerY + 8;
  const nin    = g("id_number") || g("nin") || "";
  const qrBuf  = await makeQr(nin || reference, qrSize);
  doc.image(qrBuf, qrX, qrY, { width: qrSize, height: qrSize });

  // "NGA" text (just left of QR code, semi-transparent white)
  doc.fillColor("#ffffff").fillOpacity(0.45).fontSize(14).font("Helvetica-Bold")
    .text("NGA", qrX - 38, outerY + 10);
  doc.fillOpacity(1);

  // Fields (right of photo, inside left panel)
  const fx = lx + photoW + 7;
  const fw = rightX - fx - 6;
  let   fy = ly;

  doc.fillColor("#aed581").fontSize(5.5).font("Helvetica").text("SURNAME/NOM", fx, fy, { width: fw });
  fy += 8;
  doc.fillColor("#ffffff").fontSize(9).font("Helvetica-Bold")
    .text(g("last_name").toUpperCase() || "—", fx, fy, { width: fw });
  fy += 18;

  doc.fillColor("#aed581").fontSize(5.5).font("Helvetica").text("GIVEN NAMES/PRENOMS", fx, fy, { width: fw });
  fy += 8;
  const givenNames = [g("first_name"), g("middle_name")].filter(Boolean).join(",\n");
  doc.fillColor("#ffffff").fontSize(9).font("Helvetica-Bold")
    .text(givenNames.toUpperCase() || "—", fx, fy, { width: fw });
  fy += 24;

  // DOB + SEX on same row
  doc.fillColor("#aed581").fontSize(5.5).font("Helvetica")
    .text("DATE OF BIRTH", fx, fy, { width: fw * 0.55 });
  doc.fillColor("#aed581").fontSize(5.5).font("Helvetica")
    .text("SEX/SEXE", fx + fw * 0.55, fy, { width: fw * 0.45 });
  fy += 8;
  doc.fillColor("#ffffff").fontSize(8.5).font("Helvetica-Bold")
    .text(fmtDate(g("date_of_birth")) || "—", fx, fy, { width: fw * 0.55 });
  doc.fillColor("#ffffff").fontSize(8.5).font("Helvetica-Bold")
    .text(g("gender").toUpperCase() || "—", fx + fw * 0.55, fy, { width: fw * 0.45 });
  fy += 16;

  doc.fillColor("#aed581").fontSize(5.5).font("Helvetica").text("ISSUE DATE", fx, fy, { width: fw });
  fy += 8;
  const issueRaw = tx.processed_at ?? tx.updated_at ?? tx.created_at ?? "";
  doc.fillColor("#ffffff").fontSize(8.5).font("Helvetica-Bold")
    .text(fmtDate(issueRaw) || "—", fx, fy);

  // NIN at bottom of left panel
  const ninY = outerY + outerH - 44;
  const ninSpaced = nin.replace(/(.{4})/g, "$1 ").trim();
  doc.fillColor("#aed581").fontSize(7).font("Helvetica-Bold")
    .text("National Identification Number (NIN)", lx, ninY, { width: leftW - 12 });
  doc.fillColor("#ffffff").fontSize(17).font("Helvetica-Bold")
    .text(ninSpaced || "—", lx, ninY + 14, { width: leftW - 12 });

  doc.restore(); // end left panel clip

  // ── Right panel content (white background, no clip) ────────────────────────
  const rx = rightX + 12;
  const rw = rightW - 18;
  let   ry = outerY + 14;

  doc.fillColor("#000000").fontSize(10).font("Helvetica-Bold")
    .text("DISCLAIMER", rx, ry, { width: rw, align: "center" });
  ry += 16;
  doc.fillColor("#555555").fontSize(7).font("Helvetica-Oblique")
    .text("Trust, but verify", rx, ry, { width: rw, align: "center" });
  ry += 12;

  const dLines = [
    "Kindly ensure each time this ID is presented, that you verify the credentials using a Government-APPROVED verification resource.",
    "The details on the front of this NIN Slip must EXACTLY match the verification result.",
  ];
  for (const line of dLines) {
    doc.fillColor("#333333").fontSize(6.5).font("Helvetica")
      .text(line, rx, ry, { width: rw, align: "center" });
    ry += 20;
  }

  doc.fillColor("#000000").fontSize(8.5).font("Helvetica-Bold")
    .text("CAUTION!", rx, ry, { width: rw, align: "center" });
  ry += 13;

  const cLines = [
    "If this NIN was not issued to the person on the front of this document, please DO NOT attempt to scan, photocopy or replicate the personal data contained herein.",
    "You are only permitted to scan the barcode for the purpose of identity verification.",
    "The FEDERAL GOVERNMENT of NIGERIA assumes no responsibility if you accept any variance in the scan result or do not scan the 2D barcode overleaf.",
  ];
  for (const line of cLines) {
    doc.fillColor("#333333").fontSize(6.5).font("Helvetica")
      .text(line, rx, ry, { width: rw, align: "center" });
    ry += 18;
  }

  addPageFooter(doc, reference);
}

// ═════════════════════════════════════════════════════════════════════════════
// SLIP 4 — BVN Slip
// Layout: outer rounded card | CoA + title | fields / photo+BVN / Verified | footer grid
// ═════════════════════════════════════════════════════════════════════════════
export async function renderBvnSlip(
  doc:       PDFKit.PDFDocument,
  g:         (k: string) => string,
  reference: string,
): Promise<void> {
  const W  = 595;
  const ML = 50;
  const MR = 545;
  const CW = MR - ML;

  // Outer card container
  doc.save()
    .roundedRect(28, 18, W - 56, 410, 6)
    .strokeColor("#cccccc").lineWidth(0.8).stroke()
    .restore();

  // ── Header: centred CoA + title ──────────────────────────────────────────────
  drawCoatOfArms(doc, W / 2, 62, 50);

  doc.fillColor("#000000").fontSize(17).font("Helvetica-Bold")
    .text("Federal Republic of Nigeria", ML, 92, { align: "center", width: CW });
  doc.fillColor("#000000").fontSize(13).font("Helvetica-Bold")
    .text("Verified BVN Details", ML, 113, { align: "center", width: CW });

  doc.moveTo(ML + 50, 133).lineTo(MR - 50, 133).strokeColor("#cccccc").lineWidth(0.5).stroke();

  // ── Body ──────────────────────────────────────────────────────────────────────
  const bodyY  = 143;
  const photoW = 100;
  const photoH = 120;
  const photoX = 238;
  const photoY = bodyY;
  const rightX = photoX + photoW + 14;
  const rightW = MR - rightX;

  // Left field column
  const leftFields: Array<[string, string]> = [
    ["First Name:",      g("first_name")],
    ["Middle Name:",     g("middle_name") || ""],
    ["Last Name:",       g("last_name")],
    ["Date of birth:",   fmtDate(g("date_of_birth"))],
    ["Gender:",          g("gender")],
    ["Marital Status:",  g("marital_status")],
    ["Phone Number:",    g("phone")],
    ["NIN:",             g("nin") || ""],
  ];

  let lY = bodyY;
  for (const [label, value] of leftFields) {
    doc.fillColor("#333333").fontSize(8).font("Helvetica-Bold").text(label, ML, lY);
    doc.fillColor("#000000").fontSize(9).font("Helvetica").text(value || "", ML + 108, lY);
    lY += 18;
  }

  // Photo + "BVN" label
  embedPhoto(doc, g("photo"), photoX, photoY, photoW, photoH);
  doc.fillColor("#555555").fontSize(8.5).font("Helvetica-Bold")
    .text("BVN", photoX, photoY + photoH + 3, { width: photoW, align: "center" });

  // Right column: "Verified" in large italic teal
  doc.fillColor(TEAL).fontSize(30).font("Helvetica-Oblique")
    .text("Verified", rightX, bodyY + 4, { width: rightW });

  doc.fillColor("#333333").fontSize(7.5).font("Helvetica-Bold")
    .text("Please do note that;", rightX, bodyY + 42, { width: rightW });

  let nY = bodyY + 58;
  const bvnNotes: Array<string | string[]> = [
    "The information on this slip remains valid until altered/modified where necessary by an authorized body.",
    "Any person/authority using the information should verify it at anyverify.com.ng or any other channel approved by the federal government of Nigeria.",
    ["The information shown on this slip is valid for the lifetime of the holder and ", "DOES NOT EXPIRE", "."],
    "The Verifier should not be blamed for any unauthorized alteration/copy/erasure etc done on this slip.",
  ];

  for (let i = 0; i < bvnNotes.length; i++) {
    const note = bvnNotes[i];
    doc.fillColor("#333333").fontSize(6.5).font("Helvetica");
    if (Array.isArray(note)) {
      // Inline colour change for "DOES NOT EXPIRE"
      doc.text(`${i + 1}.  ${note[0]}`, rightX, nY, { width: rightW, continued: true });
      doc.fillColor(ORANGE).font("Helvetica-Bold").text(note[1], { continued: true });
      doc.fillColor("#333333").font("Helvetica").text(note[2]);
    } else {
      doc.text(`${i + 1}.  ${note}`, rightX, nY, { width: rightW });
    }
    nY += 24;
  }

  // ── Second row of fields ──────────────────────────────────────────────────────
  const row2Y = Math.max(lY + 10, photoY + photoH + 20) + 14;
  doc.moveTo(ML, row2Y).lineTo(MR, row2Y).strokeColor("#cccccc").lineWidth(0.5).stroke();

  const col2 = ML + CW / 2;
  let r2Y = row2Y + 10;

  const row2: Array<[string, string, number, string, string, number]> = [
    ["Enrollment Institution:", g("enrollment_institution"), ML,   "Enrollment Branch:", g("enrollment_branch"), col2],
    ["Origin State:",           g("origin_state"),           ML,   "Origin LGA:",        g("origin_lga"),        col2],
    ["Residence State:",        g("residence_state"),        ML,   "Residence LGA:",     g("residence_lga") || g("residence_lga_name"), col2],
  ];

  for (const [l1, v1, x1, l2, v2, x2] of row2) {
    doc.fillColor("#333333").fontSize(8).font("Helvetica-Bold").text(l1, x1, r2Y);
    doc.fillColor("#000000").fontSize(9).font("Helvetica").text(v1 || "—", x1 + 132, r2Y);
    doc.fillColor("#333333").fontSize(8).font("Helvetica-Bold").text(l2, x2, r2Y);
    doc.fillColor("#000000").fontSize(9).font("Helvetica").text(v2 || "—", x2 + 96, r2Y);
    r2Y += 20;
  }

  doc.fillColor("#333333").fontSize(8).font("Helvetica-Bold").text("Residential Address:", ML, r2Y);
  doc.fillColor("#000000").fontSize(9).font("Helvetica")
    .text(g("address") || g("residential_address") || "—", ML + 132, r2Y, { width: CW - 132 });

  addPageFooter(doc, reference);
}

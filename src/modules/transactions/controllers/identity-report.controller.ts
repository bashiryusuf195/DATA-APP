import type { Request, Response, NextFunction } from "express";
import PDFDocument from "pdfkit";
import { getDbInstance } from "../../../db/knex";
import { AppError } from "../../../lib/errors";
import { logger } from "../../../lib/logger";

const db = getDbInstance();

// Statuses that are considered "verified" — covers legacy aliases.
const SUCCESS_STATUSES = new Set(["successful", "success", "completed"]);

// ── GET /transactions/identity-verification/:reference/report ─────────────────

export async function identityReportController(
  req:  Request,
  res:  Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { reference } = req.params;
    const userId = req.user!.id;

    const tx = await db("transactions")
      .where({ reference, user_id: userId })
      .whereIn("type", ["identity_verification"])
      .first();

    if (!tx) {
      logger.warn("report_not_found", { reference, user_id: userId });
      throw new AppError("Report not found", "NOT_FOUND", 404);
    }

    if (!SUCCESS_STATUSES.has(tx.status)) {
      logger.warn("report_not_ready", {
        reference,
        user_id: userId,
        status:  tx.status,
      });
      throw new AppError(
        "Report is only available for successful verifications. Check Transaction History for status.",
        "REPORT_NOT_READY",
        422,
      );
    }

    // ── Metadata extraction (layered fallbacks for legacy records) ───────────
    //
    // New records (post-PDF deployment):
    //   metadata.report_data          — unmasked provider fields + photo
    //
    // Legacy records (pre-PDF deployment):
    //   metadata.provider_response.data       — masked NIN/BVN/phone but has names, DOB, gender
    //   metadata.execution.provider_response.data — same data via alternate path
    //
    // We try all three in order and merge, so any field present in any source is used.

    const meta = (tx.metadata ?? {}) as Record<string, unknown>;

    // Source 1 – unmasked report_data (preferred; set by identity providers post-deployment)
    const rd = (meta.report_data ?? {}) as Record<string, unknown>;

    // Source 2 – metadata.provider_response.data (masked; always present for successful txns)
    const provResp = (meta.provider_response ?? {}) as Record<string, unknown>;
    const pd       = (provResp.data ?? {}) as Record<string, unknown>;

    // Source 3 – metadata.execution.provider_response.data (alternate storage path)
    const execMeta = (meta.execution ?? {}) as Record<string, unknown>;
    const execResp = (execMeta.provider_response ?? {}) as Record<string, unknown>;
    const pd2      = (execResp.data ?? {}) as Record<string, unknown>;

    // Source 4 – metadata.provider_response itself (some old integrations store fields directly)
    const pd3 = (typeof provResp === "object" && !provResp.data) ? provResp : {};

    // Getter: prefers unmasked report_data, then each fallback in order.
    const g = (key: string): string =>
      s(rd[key] ?? pd[key] ?? pd2[key] ?? pd3[key]);

    const variationCode = s(meta.variation_code ?? "");

    // idType: prefer report_data.id_type, then infer from variation_code.
    // This ensures BVN transactions that pre-date report_data are routed correctly.
    const idTypeRaw = s(rd.id_type);
    const idType = idTypeRaw || (variationCode.startsWith("bvn-") ? "bvn" : "nin");

    // ── Logging ──────────────────────────────────────────────────────────────
    const hasReportData    = Object.keys(rd).length > 0;
    const hasProviderData  = Object.keys(pd).length > 0 || Object.keys(pd2).length > 0;
    const dataSource       = hasReportData ? "report_data" : hasProviderData ? "provider_response" : "none";

    if (dataSource === "report_data") {
      logger.info("report_generated", {
        reference,
        variation_code: variationCode,
        id_type:        idType,
        source:         "report_data",
      });
    } else if (dataSource === "provider_response") {
      logger.info("report_restored", {
        reference,
        variation_code: variationCode,
        id_type:        idType,
        source:         "provider_response",
        note:           "legacy transaction — report_data absent; using masked fallback",
      });
    } else {
      logger.warn("report_missing_data", {
        reference,
        variation_code: variationCode,
        note:           "no verification data found in any metadata path; generating minimal slip",
      });
    }

    // ── PDF generation ───────────────────────────────────────────────────────
    const doc = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: true });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="verification-${reference}.pdf"`,
    );
    doc.pipe(res);

    // Dispatch: variation_code is the primary signal.
    // idType is the secondary signal for records where variation_code was not stored.
    // Any variation_code starting with "bvn-" routes to the BVN slip builder so
    // future BVN product variants are handled automatically.
    if (variationCode === "nin-standard") {
      buildNinStandardSlip(doc, g, reference);
    } else if (variationCode === "nin-premium") {
      buildNinPremiumSlip(doc, g, tx, reference);
    } else if (variationCode.startsWith("bvn-") || idType === "bvn") {
      buildBvnSlip(doc, g, reference);
    } else {
      // Covers nin-information, any future nin-* variants, and records
      // where variation_code was not stored (defaults to NIN information slip).
      buildNinInformationSlip(doc, g, reference);
    }

    doc.end();
  } catch (err) {
    next(err);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function s(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function fmtDate(d: unknown): string {
  if (!d) return "";
  const raw = String(d);
  // Accept ISO dates and already-formatted strings
  try {
    const dt = new Date(raw);
    if (!isNaN(dt.getTime())) {
      return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    }
  } catch { /* */ }
  return raw;
}

function fmtTs(d: unknown): string {
  if (!d) return "—";
  try {
    return new Date(String(d)).toLocaleString("en-NG", {
      day: "2-digit", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return String(d); }
}

function embedPhoto(
  doc:   PDFKit.PDFDocument,
  photo: string,
  x:     number,
  y:     number,
  w:     number,
  h:     number,
): void {
  if (!photo || photo === "[photo_redacted]") {
    // placeholder box
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

// ── Slip 1: NIN Information Slip ──────────────────────────────────────────────
//
// Layout matches the official NIMC "Verified NIN Details" information slip:
//   Header | Left field grid | Centre photo | Right "Verified" block
//   Large NIN number | Footer fields grid

function buildNinInformationSlip(
  doc:       PDFKit.PDFDocument,
  g:         (k: string) => string,
  reference: string,
): void {
  const W = doc.page.width;
  const M = 40;

  // ── Header ─────────────────────────────────────────────────────────────────
  doc.save()
    .rect(0, 0, W, 70).fillColor("#ffffff").fill()
    .restore();

  // Left decorative circle (coat of arms placeholder)
  doc.save()
    .circle(M + 22, 35, 22).fillColor("#f0f0f0").fill()
    .strokeColor("#cccccc").lineWidth(1).stroke()
    .fillColor("#666666").fontSize(8).font("Helvetica-Bold")
    .text("FRN", M + 8, 32)
    .restore();

  // Header text
  doc.fillColor("#000000").fontSize(16).font("Helvetica-Bold")
    .text("Federal Republic of Nigeria", M + 55, 12, { align: "center", width: W - M * 2 - 55 });
  doc.fillColor("#1a1a1a").fontSize(13).font("Helvetica-Bold")
    .text("Verified NIN Details", M + 55, 32, { align: "center", width: W - M * 2 - 55 });

  // Right NIMC logo placeholder
  doc.save()
    .rect(W - M - 44, 8, 44, 52).fillColor("#006600").fill()
    .fillColor("#ffffff").fontSize(6).font("Helvetica-Bold")
    .text("NIMC", W - M - 44, 30, { width: 44, align: "center" })
    .restore();

  // Separator
  doc.moveTo(M, 72).lineTo(W - M, 72).strokeColor("#aaaaaa").lineWidth(0.5).stroke();

  // ── Body ────────────────────────────────────────────────────────────────────
  const bodyY   = 82;
  const leftW   = 200;
  const photoW  = 120;
  const photoH  = 140;
  const photoX  = M + leftW + 10;
  const photoY  = bodyY;
  const rightX  = photoX + photoW + 14;
  const rightW  = W - rightX - M;

  // Left fields
  const leftFields: [string, string][] = [
    ["First Name:",   g("first_name")],
    ["Middle\nName:", g("middle_name")],
    ["Last Name:",    g("last_name")],
    ["Date of\nBirth:", fmtDate(g("date_of_birth"))],
    ["Gender:",       g("gender")],
    ["Signature:",    ""],
  ];

  let lY = bodyY;
  for (const [label, value] of leftFields) {
    doc.fillColor("#333333").fontSize(8).font("Helvetica-Bold").text(label, M, lY);
    if (value) {
      doc.fillColor("#000000").fontSize(9).font("Helvetica").text(value, M + 70, lY);
    } else if (label === "Signature:") {
      doc.moveTo(M + 70, lY + 10).lineTo(M + 180, lY + 10)
        .strokeColor("#999999").lineWidth(0.5).stroke();
    }
    lY += label.includes("\n") ? 28 : 22;
  }

  // Photo
  embedPhoto(doc, g("photo"), photoX, photoY, photoW, photoH);
  doc.fillColor("#444444").fontSize(7).font("Helvetica-Bold")
    .text("Signature:", photoX, photoY + photoH + 4, { width: photoW, align: "center" });
  doc.moveTo(photoX + 10, photoY + photoH + 18).lineTo(photoX + photoW - 10, photoY + photoH + 18)
    .strokeColor("#999999").lineWidth(0.5).stroke();

  // Right: Verified block
  doc.fillColor("#cc0000").fontSize(22).font("Helvetica-Bold")
    .text("Verified", rightX, bodyY);
  doc.fillColor("#333333").fontSize(7).font("Helvetica")
    .text(
      "This is a property of National Identity Management Commission (NIMC), Nigeria. If found, please return to the nearest NIMC office.",
      rightX, bodyY + 30, { width: rightW },
    );

  const notes = [
    "This NIN slip remains the property of the Federal Republic of Nigeria, and must be surrendered on demand;",
    "This NIN slip does not imply nor confer the citizenship of Federal Republic of Nigeria on the individual the document is issued to;",
    "This NIN slip is valid for the lifetime of the owner and DOES NOT EXPIRE.",
  ];
  let nY = bodyY + 70;
  notes.forEach((note, i) => {
    doc.fillColor("#333333").fontSize(7).font("Helvetica")
      .text(`${i + 1}.  ${note}`, rightX, nY, { width: rightW });
    nY += 32;
  });

  // Verified stamp circle
  doc.save()
    .circle(rightX + rightW / 2, nY + 28, 28)
    .strokeColor("#006600").lineWidth(2).stroke()
    .fillColor("#006600").fontSize(8).font("Helvetica-Bold")
    .text("VERIFIED", rightX + rightW / 2 - 24, nY + 22)
    .restore();

  // ── NIN NUMBER ──────────────────────────────────────────────────────────────
  const ninY = Math.max(lY, photoY + photoH + 36) + 16;

  doc.moveTo(M, ninY).lineTo(W - M, ninY).strokeColor("#aaaaaa").lineWidth(0.5).stroke();
  doc.fillColor("#000000").fontSize(13).font("Helvetica-Bold")
    .text("NIN NUMBER:", M, ninY + 10);
  doc.fillColor("#000000").fontSize(22).font("Helvetica-Bold")
    .text(g("id_number") || g("nin") || "—", M + 130, ninY + 5);

  // ── Footer grid ─────────────────────────────────────────────────────────────
  const footY  = ninY + 42;
  const col2   = W / 2;

  doc.moveTo(M, footY).lineTo(W - M, footY).strokeColor("#cccccc").lineWidth(0.5).stroke();

  const footFields: Array<[string, string, number]> = [
    // [label, value, x]
    ["Tracking ID:",      g("tracking_id"),      M],
    ["Phone Number:",     g("phone"),             col2],
    ["Residence\nState:", g("residence_state"),   M],
    ["Residence\nLGA/Town:", g("residence_lga") || g("residence_lga_name"), col2],
    ["Birth State:",      g("birth_state"),       M],
    ["Birth LGA:",        g("birth_lga"),         col2],
  ];

  let fY = footY + 8;
  let prevX = -1;
  for (const [label, value, x] of footFields) {
    if (x < prevX) fY += label.includes("\n") ? 28 : 22;
    doc.fillColor("#333333").fontSize(8).font("Helvetica-Bold").text(label, x, fY);
    doc.fillColor("#000000").fontSize(9).font("Helvetica").text(value || "—", x + 100, fY);
    prevX = x;
  }

  fY += 28;
  doc.fillColor("#333333").fontSize(8).font("Helvetica-Bold").text("Address:", M, fY);
  doc.fillColor("#000000").fontSize(9).font("Helvetica")
    .text(g("address") || g("residential_address") || "—", M + 80, fY, { width: W - M * 2 - 80 });

  // Page footer
  addPageFooter(doc, reference);
}

// ── Slip 2: NIN Standard Slip ─────────────────────────────────────────────────
//
// Card layout: photo | coat-of-arms | NGA | Surname | Given Names | DOB | NIN (large)
// Disclaimer panel below

function buildNinStandardSlip(
  doc:       PDFKit.PDFDocument,
  g:         (k: string) => string,
  reference: string,
): void {
  const W = doc.page.width;
  const M = 40;

  // Header text (outside card)
  doc.fillColor("#000000").fontSize(9).font("Helvetica-Bold")
    .text("Please find below your Improved NIN Slip", M, 28, { align: "center", width: W - M * 2 });
  doc.fillColor("#000000").fontSize(8).font("Helvetica")
    .text("You may cut it out of the paper, fold and laminate as desired.", M, 44, { align: "center", width: W - M * 2 });
  doc.fillColor("#000000").fontSize(8).font("Helvetica")
    .text("For your security & privacy, please DO NOT permit others to make photocopies of this document.", M, 58, { align: "center", width: W - M * 2 });

  // Card border
  const cardX = M;
  const cardY = 82;
  const cardW = W - M * 2;
  const cardH = 240;

  doc.save()
    .roundedRect(cardX, cardY, cardW, cardH, 4)
    .strokeColor("#999999").lineWidth(1).stroke()
    .restore();

  // Photo inside card
  const photoW = 90;
  const photoH = 110;
  embedPhoto(doc, g("photo"), cardX + 10, cardY + 14, photoW, photoH);

  // Coat-of-arms circle (center of card)
  const coatX = cardX + photoW + 30;
  const coatY = cardY + 10;
  doc.save()
    .circle(coatX + 20, coatY + 20, 20).fillColor("#f5f5f5").fill()
    .strokeColor("#cccccc").lineWidth(0.5).stroke()
    .fillColor("#666666").fontSize(7).font("Helvetica-Bold")
    .text("FRN", coatX + 7, coatY + 16)
    .restore();

  // NGA watermark text (top right of card)
  doc.fillColor("#888888").fontSize(18).font("Helvetica-Bold")
    .text("NGA", cardX + cardW - 60, cardY + 12);

  // QR code placeholder
  const qrX = cardX + cardW - 72;
  const qrY = cardY + 36;
  doc.save()
    .rect(qrX, qrY, 60, 60).fillColor("#f0f0f0").fill()
    .strokeColor("#cccccc").lineWidth(0.5).stroke()
    .fillColor("#888888").fontSize(6).font("Helvetica")
    .text("QR Code", qrX + 10, qrY + 26)
    .restore();

  // Name and DOB fields
  const textX = coatX + 50;
  let   textY = cardY + 16;
  const nameW = cardX + cardW - textX - 80;

  doc.fillColor("#888888").fontSize(7).font("Helvetica").text("Surname/Nom",       textX, textY);
  doc.fillColor("#000000").fontSize(11).font("Helvetica-Bold").text(g("last_name").toUpperCase(), textX, textY + 10);
  textY += 32;
  doc.fillColor("#888888").fontSize(7).font("Helvetica").text("Given Names/Prenoms", textX, textY);
  doc.fillColor("#000000").fontSize(11).font("Helvetica-Bold").text(
    [g("first_name"), g("middle_name")].filter(Boolean).join(" ").toUpperCase(),
    textX, textY + 10, { width: nameW },
  );
  textY += 32;
  doc.fillColor("#888888").fontSize(7).font("Helvetica").text("Date of Birth",      textX, textY);
  doc.fillColor("#000000").fontSize(10).font("Helvetica-Bold").text(fmtDate(g("date_of_birth")), textX, textY + 10);

  // NIN number (large, centred at bottom of card)
  const ninStr  = g("id_number") || g("nin") || "—";
  const ninDisp = ninStr.replace(/(.{4})/g, "$1 ").trim();
  doc.fillColor("#444444").fontSize(9).font("Helvetica-Bold")
    .text("National Identification Number (NIN)", cardX, cardY + cardH - 60, { align: "center", width: cardW });
  doc.fillColor("#000000").fontSize(22).font("Helvetica-Bold")
    .text(ninDisp, cardX, cardY + cardH - 44, { align: "center", width: cardW });
  doc.fillColor("#666666").fontSize(7).font("Helvetica")
    .text("Kindly ensure you scan the barcode to verify the credentials", cardX, cardY + cardH - 18, { align: "center", width: cardW });

  // Disclaimer panel
  const discY = cardY + cardH + 12;
  const discH = 120;
  doc.save()
    .roundedRect(cardX, discY, cardW, discH, 4)
    .strokeColor("#999999").lineWidth(1).stroke()
    .restore();

  doc.fillColor("#000000").fontSize(10).font("Helvetica-Bold")
    .text("DISCLAIMER", cardX, discY + 10, { align: "center", width: cardW });
  doc.fillColor("#666666").fontSize(7).font("Helvetica-Oblique")
    .text("Trust, but verify", cardX, discY + 26, { align: "center", width: cardW });

  const disclaimers = [
    "Kindly ensure each time this ID is presented, that you verify the credentials using a Government-APPROVED verification resource.",
    "The details on the front of this NIN Slip must EXACTLY match the verification result.",
    "If this NIN was not issued to the person on the front of this document, please DO NOT attempt to scan, photocopy or replicate the personal data contained herein.",
    "You are only permitted to scan the barcode for the purpose of identity verification.",
    "The Federal GOVERNMENT of NIGERIA assumes no responsibility if you accept any variance in the scan result or do not scan the 2D barcode overleaf.",
  ];
  let dY = discY + 42;
  for (const line of disclaimers) {
    doc.fillColor("#333333").fontSize(6.5).font("Helvetica")
      .text(line, cardX + 20, dY, { width: cardW - 40, align: "center" });
    dY += 14;
  }

  addPageFooter(doc, reference);
}

// ── Slip 3: NIN Premium (Digital NIN Slip) ────────────────────────────────────
//
// Card with green background, two columns: left (photo+card content) | right (disclaimer)

function buildNinPremiumSlip(
  doc:       PDFKit.PDFDocument,
  g:         (k: string) => string,
  tx:        Record<string, unknown>,
  reference: string,
): void {
  const W = doc.page.width;
  const M = 40;

  // Outer card
  const cardX = M;
  const cardY = 50;
  const cardW = W - M * 2;
  const cardH = 220;
  const midX  = cardX + cardW / 2;

  doc.save()
    .roundedRect(cardX, cardY, cardW, cardH, 6)
    .strokeColor("#cccccc").lineWidth(1).stroke()
    .restore();

  // Left half — green background
  doc.save()
    .roundedRect(cardX, cardY, midX - cardX, cardH, 6)
    .fillColor("#2d6a2d").fill()
    .restore();
  // Clip the right edge of the green half to be flat
  doc.save()
    .rect(midX, cardY, 20, cardH).fillColor("#2d6a2d").fill()
    .restore();

  // Left half content
  const textX = cardX + 10;
  let   textY = cardY + 10;

  doc.fillColor("#ffffff").fontSize(7).font("Helvetica-Bold")
    .text("FEDERAL REPUBLIC OF NIGERIA", textX, textY, { width: midX - textX - 10 });
  doc.fillColor("#ffffff").fontSize(6).font("Helvetica")
    .text("DIGITAL NIN SLIP", textX, textY + 12, { width: midX - textX - 10 });

  // Photo
  const photoW = 70;
  const photoH = 85;
  const photoX = textX;
  const photoY = textY + 28;
  embedPhoto(doc, g("photo"), photoX, photoY, photoW, photoH);

  // Name fields on left
  let fY = photoY;
  const fX = photoX + photoW + 10;
  const fW = midX - fX - 10;

  const leftF: [string, string][] = [
    ["SURNAME/NOM",        g("last_name").toUpperCase()],
    ["GIVEN NAMES/PRENOMS", [g("first_name"), g("middle_name")].filter(Boolean).join(",\n").toUpperCase()],
    ["DATE OF BIRTH",      fmtDate(g("date_of_birth"))],
    ["SEX/SEXE",           g("gender").toUpperCase()],
  ];
  for (const [label, value] of leftF) {
    doc.fillColor("#ccffcc").fontSize(6).font("Helvetica").text(label, fX, fY);
    doc.fillColor("#ffffff").fontSize(8).font("Helvetica-Bold").text(value, fX, fY + 9, { width: fW });
    fY += 28;
  }

  // NGA + issue date
  const issueDate = fmtDate(tx.processed_at ?? tx.updated_at);
  doc.fillColor("#ccffcc").fontSize(6).font("Helvetica").text("ISSUE DATE", fX, fY);
  doc.fillColor("#ffffff").fontSize(8).font("Helvetica-Bold").text(issueDate, fX, fY + 9);

  // NGA watermark (top-right of left panel)
  doc.fillColor("rgba(255,255,255,0.3)").fontSize(36).font("Helvetica-Bold")
    .text("NGA", midX - 80, cardY + 60);

  // NIN (centred at bottom of left half)
  const ninStr = g("id_number") || g("nin") || "—";
  const spaced = ninStr.replace(/(.{4})/g, "$1 ").trim();
  doc.fillColor("#ffffff").fontSize(8).font("Helvetica-Bold")
    .text("National Identification Number (NIN)", textX, cardY + cardH - 40, { width: midX - textX - 10 });
  doc.fillColor("#ffffff").fontSize(17).font("Helvetica-Bold")
    .text(spaced, textX, cardY + cardH - 26, { width: midX - textX - 10 });

  // QR code placeholder (right side of left panel)
  const qrSize = 52;
  const qrX    = midX - qrSize - 8;
  const qrY    = cardY + 12;
  doc.save()
    .rect(qrX, qrY, qrSize, qrSize).fillColor("rgba(255,255,255,0.2)").fill()
    .strokeColor("rgba(255,255,255,0.5)").lineWidth(0.5).stroke()
    .fillColor("#ffffff").fontSize(6).font("Helvetica")
    .text("QR Code", qrX + 6, qrY + 22)
    .restore();

  // Right half — disclaimer
  const rX = midX + 14;
  const rW = cardX + cardW - rX - 14;
  let   rY = cardY + 14;

  doc.fillColor("#000000").fontSize(9).font("Helvetica-Bold")
    .text("DISCLAIMER", rX, rY, { width: rW, align: "center" });
  rY += 18;
  doc.fillColor("#555555").fontSize(7).font("Helvetica-Oblique")
    .text("Trust, but verify", rX, rY, { width: rW, align: "center" });
  rY += 14;

  const disclaimers = [
    "Kindly ensure each time this ID is presented, that you verify the credentials using a Government-APPROVED verification resource.",
    "The details on the front of this NIN Slip must EXACTLY match the verification result.",
    "If this NIN was not issued to the person on the front of this document, please DO NOT attempt to scan, photocopy or replicate the personal data contained herein.",
    "You are only permitted to scan the barcode for the purpose of identity verification.",
    "The Federal GOVERNMENT of NIGERIA assumes no responsibility if you accept any variance in the scan result or do not scan the 2D barcode overleaf.",
  ];
  for (const line of disclaimers) {
    doc.fillColor("#333333").fontSize(6.5).font("Helvetica")
      .text(line, rX, rY, { width: rW, align: "justify" });
    rY += 28;
  }

  addPageFooter(doc, reference);
}

// ── Slip 4: BVN Slip ──────────────────────────────────────────────────────────
//
// Layout matches the official "Verified BVN Details" slip:
//   Header | Left field grid | Centre photo | Right "Verified" block
//   Second row of fields

function buildBvnSlip(
  doc:       PDFKit.PDFDocument,
  g:         (k: string) => string,
  reference: string,
): void {
  const W = doc.page.width;
  const M = 40;

  // ── Header ─────────────────────────────────────────────────────────────────
  // Coat of arms circle placeholder
  doc.save()
    .circle(M + 22, 40, 22).fillColor("#f5f5f5").fill()
    .strokeColor("#cccccc").lineWidth(0.8).stroke()
    .fillColor("#666666").fontSize(7).font("Helvetica-Bold")
    .text("FRN", M + 8, 36)
    .restore();

  doc.fillColor("#000000").fontSize(15).font("Helvetica-Bold")
    .text("Federal Republic of Nigeria", M + 55, 20, { align: "center", width: W - M * 2 - 55 });
  doc.fillColor("#1a1a1a").fontSize(12).font("Helvetica-Bold")
    .text("Verified BVN Details", M + 55, 40, { align: "center", width: W - M * 2 - 55 });

  doc.moveTo(M, 68).lineTo(W - M, 68).strokeColor("#aaaaaa").lineWidth(0.5).stroke();

  // ── Body ────────────────────────────────────────────────────────────────────
  const bodyY  = 78;
  const leftW  = 220;
  const photoW = 110;
  const photoH = 130;
  const photoX = M + leftW + 10;
  const photoY = bodyY;
  const rightX = photoX + photoW + 14;
  const rightW = W - rightX - M;

  // Left field grid
  const leftFields: [string, string][] = [
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
    doc.fillColor("#333333").fontSize(8).font("Helvetica-Bold").text(label, M, lY);
    doc.fillColor("#000000").fontSize(9).font("Helvetica").text(value || "—", M + 110, lY);
    lY += 20;
  }

  // Photo
  embedPhoto(doc, g("photo"), photoX, photoY, photoW, photoH);
  doc.fillColor("#555555").fontSize(7).font("Helvetica-Bold")
    .text("BVN", photoX, photoY + photoH + 4, { width: photoW, align: "center" });

  // Right: Verified block
  doc.fillColor("#000000").fontSize(18).font("Helvetica-Bold")
    .text("Verified", rightX, bodyY + 4);
  doc.fillColor("#333333").fontSize(7).font("Helvetica-Bold")
    .text("Please do note that;", rightX, bodyY + 32, { width: rightW });

  const notes = [
    "The information on this slip remains valid until altered/modified where necessary by an authorized body.",
    "Any person/authority using the information should verify it at anyverify.com.ng or any other channel approved by the federal government of Nigeria.",
    "The information shown on this slip is valid for the lifetime of the holder and DOES NOT EXPIRE.",
    "The Verifier should not be blamed for any unauthorized alteration/copy/erasure etc done on this slip.",
  ];
  let nY = bodyY + 46;
  notes.forEach((note, i) => {
    doc.fillColor("#333333").fontSize(6.5).font("Helvetica")
      .text(`${i + 1}.  ${note}`, rightX, nY, { width: rightW });
    nY += 26;
  });

  // ── Second row of fields ────────────────────────────────────────────────────
  const row2Y = Math.max(lY, photoY + photoH + 22) + 14;

  doc.moveTo(M, row2Y).lineTo(W - M, row2Y).strokeColor("#cccccc").lineWidth(0.5).stroke();

  const col1 = M;
  const col2 = W / 2;

  const row2Fields: Array<[string, string, number]> = [
    ["Enrollment Institution:", g("enrollment_institution"),            col1],
    ["Enrollment Branch:",      g("enrollment_branch"),                 col2],
    ["Origin State:",           g("origin_state"),                      col1],
    ["Origin LGA:",             g("origin_lga"),                        col2],
    ["Residence State:",        g("residence_state"),                   col1],
    ["Residence LGA:",          g("residence_lga") || g("residence_lga_name"), col2],
  ];

  let r2Y    = row2Y + 10;
  let prevX2 = -1;
  for (const [label, value, x] of row2Fields) {
    if (x < prevX2) r2Y += 20;
    doc.fillColor("#333333").fontSize(8).font("Helvetica-Bold").text(label, x, r2Y);
    doc.fillColor("#000000").fontSize(9).font("Helvetica").text(value || "—", x + 140, r2Y);
    prevX2 = x;
  }

  r2Y += 24;
  doc.fillColor("#333333").fontSize(8).font("Helvetica-Bold").text("Residential Address:", M, r2Y);
  doc.fillColor("#000000").fontSize(9).font("Helvetica")
    .text(
      g("address") || g("residential_address") || "—",
      M + 140, r2Y,
      { width: W - M * 2 - 140 },
    );

  addPageFooter(doc, reference);
}

// ── Page footer (transaction reference + generated timestamp) ──────────────────

function addPageFooter(
  doc:       PDFKit.PDFDocument,
  reference: string,
): void {
  const W     = doc.page.width;
  const footY = doc.page.height - 36;
  doc.moveTo(40, footY).lineTo(W - 40, footY).strokeColor("#dddddd").lineWidth(0.5).stroke();
  doc.fillColor("#aaaaaa").fontSize(7).font("Helvetica")
    .text(
      `Reference: ${reference}  |  Generated: ${fmtTs(new Date())}  |  This is a system-generated document.`,
      40, footY + 8,
      { align: "center", width: W - 80 },
    );
}

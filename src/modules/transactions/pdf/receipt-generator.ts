/**
 * Programmatic A4 receipt generator — pdfkit-based.
 *
 * Covers all transaction types: airtime, data, electricity, cable_tv,
 * exam_pin (WAEC + JAMB), identity_verification, wallet_funding, refunds.
 *
 * No external assets are required — all fonts are pdfkit built-ins
 * (Helvetica, Helvetica-Bold, Courier, Courier-Bold).
 */

import PDFDocument from "pdfkit";
import { createHash } from "crypto";

// ─── Page geometry ────────────────────────────────────────────────────────────

const PAGE_W = 595;  // A4 width  (pt)
const PAGE_H = 842;  // A4 height (pt)
const ML     = 50;   // margin left
const CW     = PAGE_W - ML * 2; // content width = 495

// ─── Palette ──────────────────────────────────────────────────────────────────

const BRAND     = "#3535D9";
const BRAND_DIM = "#6C6CE8";
const WHITE     = "#FFFFFF";
const INK       = "#0F172A";
const INK_MUTED = "#475569";
const INK_FAINT = "#8895A8";
const BORDER    = "#D4DBE9";
const SURFACE   = "#F3F5FB";

// ─── Status config ────────────────────────────────────────────────────────────

interface StatusStyle {
  heroBg: string;
  fg:     string;
  dot:    string;
  label:  string;
}

const STATUS_STYLES: Record<string, StatusStyle> = {
  successful:      { heroBg: "#F0FDF4", fg: "#047857", dot: "#059669", label: "Successful" },
  success:         { heroBg: "#F0FDF4", fg: "#047857", dot: "#059669", label: "Successful" },
  completed:       { heroBg: "#F0FDF4", fg: "#047857", dot: "#059669", label: "Successful" },
  failed:          { heroBg: "#FEF2F2", fg: "#B91C1C", dot: "#DC2626", label: "Failed" },
  fail:            { heroBg: "#FEF2F2", fg: "#B91C1C", dot: "#DC2626", label: "Failed" },
  pending:         { heroBg: "#FFFBEB", fg: "#B45309", dot: "#D97706", label: "Pending" },
  processing:      { heroBg: "#FFFBEB", fg: "#B45309", dot: "#D97706", label: "Processing" },
  refunded:        { heroBg: "#F8FAFC", fg: "#475569", dot: "#94A3B8", label: "Refunded" },
  reversed:        { heroBg: "#F8FAFC", fg: "#475569", dot: "#94A3B8", label: "Reversed" },
  requires_review: { heroBg: "#EFF6FF", fg: "#1D4ED8", dot: "#3B82F6", label: "Under Review" },
};

function statusStyle(status: string): StatusStyle {
  return STATUS_STYLES[status] ?? STATUS_STYLES["pending"];
}

// ─── Service labels ───────────────────────────────────────────────────────────

const TYPE_LABEL: Record<string, string> = {
  airtime:               "Airtime Top-up",
  data:                  "Data Bundle",
  electricity:           "Electricity",
  cable_tv:              "Cable TV",
  exam_pin:              "Exam PIN",
  identity_verification: "Identity Verification",
  wallet_funding:        "Wallet Funding",
  transfer:              "Transfer",
  wallet_transfer:       "Wallet Transfer",
};

// ─── Public interface ─────────────────────────────────────────────────────────

export interface ReceiptData {
  reference:     string;
  type:          string;
  status:        string;
  amount:        number;
  currency:      string;
  description:   string;
  customerName:  string;
  customerEmail: string;
  customerPhone?: string | null;
  createdAt:     string | Date;
  metadata?:     Record<string, unknown>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Stable 8-char receipt number derived from the transaction reference. */
export function receiptNumber(reference: string): string {
  const h = createHash("sha256").update(reference).digest("hex");
  return `RCP-${h.slice(0, 8).toUpperCase()}`;
}

// Month abbreviations — avoids Intl.DateTimeFormat("en-NG") which is not
// available in Alpine Node.js small-icu builds and throws RangeError.
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/** Format currency without the ₦ glyph (falls outside WinAnsi PDF font range). */
function fmtAmt(n: number): string {
  // Avoid toLocaleString — Alpine Node.js small-icu may lack en-NG locale data.
  const [int, dec] = n.toFixed(2).split(".");
  return `NGN ${int.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${dec ? "." + dec : ""}`;
}

function fmtDate(d: string | Date): string {
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getDate()} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
}

function fmtTime(d: string | Date): string {
  const dt   = d instanceof Date ? d : new Date(d);
  const h24  = dt.getHours();
  const h12  = h24 % 12 || 12;
  const mm   = String(dt.getMinutes()).padStart(2, "0");
  const ampm = h24 >= 12 ? "PM" : "AM";
  return `${h12}:${mm} ${ampm}`;
}

function amtDisplay(type: string, status: string, amount: number): { text: string; color: string } {
  const isCredit = type === "wallet_funding" || status === "refunded" || status === "reversed";
  const isFailed = status === "failed" || status === "fail";
  const isPending = status === "pending" || status === "processing" || status === "requires_review";
  if (isFailed)  return { text: fmtAmt(amount), color: "#94A3B8" };
  if (isPending) return { text: fmtAmt(amount), color: INK_MUTED };
  return {
    text:  (isCredit ? "+" : "-") + fmtAmt(amount),
    color: isCredit ? "#047857" : "#B91C1C",
  };
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function generateTransactionReceipt(data: ReceiptData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      info: {
        Title:   `Transaction Receipt - ${data.reference}`,
        Author:  "Hive Data",
        Subject: "Transaction Receipt",
        Creator: "Hive Data Platform",
      },
      // Compress page content stream
      compress: true,
    });

    const chunks: Buffer[] = [];
    doc.on("data",  (c: Buffer) => chunks.push(c));
    doc.on("end",   ()          => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    try {
      renderReceipt(doc, data);
    } catch (err) {
      reject(err);
      return;
    }

    doc.end();
  });
}

// ─── Renderer ─────────────────────────────────────────────────────────────────

function renderReceipt(doc: PDFKit.PDFDocument, data: ReceiptData): void {
  const sStyle = statusStyle(data.status);
  const amt    = amtDisplay(data.type, data.status, data.amount);
  const meta   = (data.metadata ?? {}) as Record<string, unknown>;
  const pr     = (meta.provider_response ?? {}) as Record<string, unknown>;
  const rn     = receiptNumber(data.reference);

  let y = 0;

  // ── Header ──────────────────────────────────────────────────────────────────
  const HDR_H = 90;
  doc.rect(0, 0, PAGE_W, HDR_H).fill(BRAND);

  // Logo mark — two offset circles
  doc.circle(ML + 6, 44, 7).fill(BRAND_DIM);
  doc.circle(ML + 14, 44, 7).fill(WHITE);

  // Company name
  doc.font("Helvetica-Bold").fontSize(19).fillColor(WHITE)
     .text("HIVE DATA", ML + 26, 30, { lineBreak: false });
  doc.font("Helvetica").fontSize(9.5).fillColor("#C0C8E8")
     .text("Transaction Receipt", ML + 26, 54, { lineBreak: false });

  // Receipt number (header right)
  doc.font("Helvetica").fontSize(7.5).fillColor("#8892B8")
     .text("RECEIPT NO.", ML, 26, { width: CW, align: "right", lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(10).fillColor(WHITE)
     .text(rn, ML, 42, { width: CW, align: "right", lineBreak: false });
  doc.font("Helvetica").fontSize(8).fillColor("#8892B8")
     .text(fmtDate(data.createdAt), ML, 58, { width: CW, align: "right", lineBreak: false });

  y = HDR_H;

  // ── Status hero ─────────────────────────────────────────────────────────────
  const HERO_H = 130;
  doc.rect(0, y, PAGE_W, HERO_H).fill(sStyle.heroBg);

  // Service label (small caps)
  const typeLabel = (TYPE_LABEL[data.type] ?? data.type.replace(/_/g, " ")).toUpperCase();
  doc.font("Helvetica").fontSize(8.5).fillColor(INK_FAINT)
     .text(typeLabel, ML, y + 18, { width: CW, align: "center", lineBreak: false, characterSpacing: 0.8 });

  // Amount
  doc.font("Helvetica-Bold").fontSize(29).fillColor(amt.color)
     .text(amt.text, ML, y + 32, { width: CW, align: "center", lineBreak: false });

  // Status pill
  const PILL_W = 126; const PILL_H = 24;
  const px = (PAGE_W - PILL_W) / 2;
  const py = y + 78;
  doc.save().roundedRect(px, py, PILL_W, PILL_H, 12).fill(WHITE).restore();
  doc.save().roundedRect(px, py, PILL_W, PILL_H, 12)
     .lineWidth(1).strokeColor(sStyle.dot).stroke().restore();
  doc.circle(px + 15, py + 12, 4).fill(sStyle.dot);
  doc.font("Helvetica-Bold").fontSize(9).fillColor(sStyle.fg)
     .text(sStyle.label, px + 24, py + 8, { width: PILL_W - 32, lineBreak: false });

  // Date/time
  doc.font("Helvetica").fontSize(8.5).fillColor(INK_FAINT)
     .text(`${fmtDate(data.createdAt)}  ·  ${fmtTime(data.createdAt)}`, ML, y + 112, { width: CW, align: "center", lineBreak: false });

  y += HERO_H;

  // ── Horizontal rule ──────────────────────────────────────────────────────────
  doc.moveTo(ML, y + 6).lineTo(ML + CW, y + 6)
     .lineWidth(0.5).strokeColor(BORDER).stroke();
  y += 18;

  // ── Customer section ─────────────────────────────────────────────────────────
  y = renderSectionHeader(doc, y, "CUSTOMER");
  y = renderRow(doc, y, "Name",  data.customerName  || "—", false);
  y = renderRow(doc, y, "Email", data.customerEmail || "—", true);
  if (data.customerPhone) {
    y = renderRow(doc, y, "Phone", data.customerPhone, false);
  }

  y += 4;

  // ── Transaction details section ──────────────────────────────────────────────
  y = renderSectionHeader(doc, y, "TRANSACTION DETAILS");
  y = renderRow(doc, y, "Service",   data.description || TYPE_LABEL[data.type] || "—", false);
  y = renderRow(doc, y, "Reference", data.reference, true, true /* monospace */);
  y = renderRow(doc, y, "Date",      fmtDate(data.createdAt), false);
  y = renderRow(doc, y, "Time",      fmtTime(data.createdAt), true);

  // Balance fields from metadata
  const bBefore = meta.balance_before ?? meta.previous_balance;
  const bAfter  = meta.balance_after  ?? meta.new_balance;
  if (bBefore != null && !isNaN(Number(bBefore))) {
    y = renderRow(doc, y, "Prev Balance", fmtAmt(Number(bBefore)), false);
  }
  if (bAfter != null && !isNaN(Number(bAfter))) {
    y = renderRow(doc, y, "New Balance",  fmtAmt(Number(bAfter)),  !!(bBefore != null));
  }

  y += 6;

  // ── Service-specific section ─────────────────────────────────────────────────
  y = renderServiceSection(doc, y, data.type, meta, pr);

  // ── Footer ───────────────────────────────────────────────────────────────────
  const footerTopMin = PAGE_H - 72;
  const footerY = Math.max(y + 16, footerTopMin);

  // If footer would go off page, start fresh
  if (footerY + 72 > PAGE_H + 10) {
    doc.addPage();
    renderFooter(doc, 20);
  } else {
    renderFooter(doc, footerY);
  }
}

// ─── Section header ───────────────────────────────────────────────────────────

function renderSectionHeader(doc: PDFKit.PDFDocument, y: number, title: string): number {
  doc.rect(0, y, PAGE_W, 18).fill(SURFACE);
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor(INK_FAINT)
     .text(title, ML + 12, y + 5, { lineBreak: false, characterSpacing: 0.5 });
  return y + 18;
}

// ─── Detail row ───────────────────────────────────────────────────────────────

function renderRow(
  doc: PDFKit.PDFDocument,
  y: number,
  label: string,
  value: string,
  shade: boolean,
  mono = false,
): number {
  const ROW_H = 30;
  doc.rect(0, y, PAGE_W, ROW_H).fill(shade ? SURFACE : WHITE);
  doc.moveTo(ML, y).lineTo(ML + CW, y).lineWidth(0.5).strokeColor(BORDER).stroke();

  doc.font("Helvetica").fontSize(9).fillColor(INK_FAINT)
     .text(label, ML + 12, y + 10, { lineBreak: false });

  doc.font(mono ? "Courier" : "Helvetica-Bold")
     .fontSize(mono ? 8.5 : 9.5)
     .fillColor(INK)
     .text(value, ML, y + 10, { width: CW - 12, align: "right", lineBreak: false });

  return y + ROW_H;
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function renderFooter(doc: PDFKit.PDFDocument, y: number): void {
  doc.moveTo(ML, y).lineTo(ML + CW, y).lineWidth(0.5).strokeColor(BORDER).stroke();

  doc.font("Helvetica-Bold").fontSize(8.5).fillColor(BRAND)
     .text("Powered by Hive Data", ML, y + 12, { width: CW, align: "center", lineBreak: false });

  doc.font("Helvetica").fontSize(8).fillColor(INK_FAINT)
     .text("www.hivedata.ng", ML, y + 28, { width: CW, align: "center", lineBreak: false });

  doc.font("Helvetica").fontSize(7).fillColor(BORDER)
     .text("This is a computer-generated receipt. No signature is required.", ML, y + 46, { width: CW, align: "center", lineBreak: false });
}

// ─── Service-specific sections ────────────────────────────────────────────────

function renderServiceSection(
  doc:  PDFKit.PDFDocument,
  y:    number,
  type: string,
  meta: Record<string, unknown>,
  pr:   Record<string, unknown>,
): number {
  switch (type) {
    case "electricity":       return renderElectricity(doc, y, pr);
    case "cable_tv":          return renderCableTv(doc, y, pr);
    case "exam_pin":          return renderExamPin(doc, y, pr);
    case "identity_verification": return renderIdentity(doc, y, meta, pr);
    case "wallet_funding":    return renderWalletFunding(doc, y, meta, pr);
    default:                  return y;
  }
}

// ── Electricity ───────────────────────────────────────────────────────────────

function renderElectricity(doc: PDFKit.PDFDocument, y: number, pr: Record<string, unknown>): number {
  const token    = str(pr.token);
  const units    = pr.units != null ? String(pr.units) : "";
  const customer = str(pr.customer_name);
  const meter    = str(pr.meter_number);
  const address  = str(pr.address);

  if (!token) return y;

  y = renderSectionHeader(doc, y, "ELECTRICITY TOKEN");

  // Token box
  const BOX_H = 58;
  doc.save().roundedRect(ML, y + 6, CW, BOX_H, 8)
     .fill("#FFFBEB").restore();
  doc.save().roundedRect(ML, y + 6, CW, BOX_H, 8)
     .lineWidth(1).strokeColor("#FDE68A").stroke().restore();

  doc.font("Helvetica").fontSize(7).fillColor("#B45309")
     .text("TOKEN", ML + 14, y + 16, { lineBreak: false, characterSpacing: 0.5 });

  doc.font("Courier-Bold").fontSize(13).fillColor("#78350F")
     .text(token, ML + 14, y + 28, { lineBreak: false });

  if (units) {
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#92400E")
       .text(`${units} units`, ML, y + 30, { width: CW - 14, align: "right", lineBreak: false });
  }

  y += BOX_H + 10;

  // Customer detail rows
  const rows: Array<[string, string]> = [];
  if (customer) rows.push(["Customer",  customer]);
  if (meter)    rows.push(["Meter No.", meter]);
  if (address)  rows.push(["Address",  address]);

  rows.forEach(([lbl, val], i) => { y = renderRow(doc, y, lbl, val, i % 2 !== 0); });

  return y + 8;
}

// ── Cable TV ──────────────────────────────────────────────────────────────────

function renderCableTv(doc: PDFKit.PDFDocument, y: number, pr: Record<string, unknown>): number {
  const pkg      = str(pr.package ?? pr.Package ?? pr.Bouquet ?? pr.bouquet ?? "");
  const customer = str(pr.Customer_Name ?? pr.customer_name ?? "");
  const due      = str(pr.Due_Date ?? pr.due_date ?? "");

  if (!pkg && !customer) return y;

  y = renderSectionHeader(doc, y, "SUBSCRIPTION DETAILS");

  const rows: Array<[string, string]> = [];
  if (customer) rows.push(["Customer", customer]);
  if (pkg)      rows.push(["Package",  pkg]);
  if (due)      rows.push(["Due Date", due]);

  rows.forEach(([lbl, val], i) => { y = renderRow(doc, y, lbl, val, i % 2 !== 0); });

  return y + 8;
}

// ── Exam PIN ──────────────────────────────────────────────────────────────────

type PinCard = { pin?: string; Pin?: string; serial?: string; Serial?: string };

function renderExamPin(doc: PDFKit.PDFDocument, y: number, pr: Record<string, unknown>): number {
  const cards     = (pr.carddetails ?? pr.pins) as PinCard[] | undefined;
  const hasSerial = cards?.some(c => !!(c.Serial ?? c.serial));

  // WAEC — entries have serial numbers
  if (cards && cards.length > 0 && hasSerial) {
    y = renderSectionHeader(doc, y, `WAEC PIN${cards.length > 1 ? "S" : ""}`);

    cards.forEach((card, idx) => {
      const pin    = str(card.Pin    ?? card.pin    ?? "");
      const serial = str(card.Serial ?? card.serial ?? "");
      if (!pin && !serial) return;

      const BOX_H = (cards.length > 1 ? 16 : 0) + (pin ? 30 : 0) + (serial ? 26 : 0) + 12;

      doc.save().roundedRect(ML, y + 4, CW, BOX_H, 6)
         .fill("#EFF6FF").restore();
      doc.save().roundedRect(ML, y + 4, CW, BOX_H, 6)
         .lineWidth(1).strokeColor("#BFDBFE").stroke().restore();

      let by = y + 10;

      if (cards.length > 1) {
        doc.font("Helvetica-Bold").fontSize(8).fillColor("#3B82F6")
           .text(`PIN ${idx + 1}`, ML + 14, by, { lineBreak: false });
        by += 16;
      }

      if (pin) {
        doc.font("Helvetica").fontSize(7).fillColor("#1D4ED8")
           .text("PIN", ML + 14, by, { lineBreak: false, characterSpacing: 0.3 });
        doc.font("Courier-Bold").fontSize(10.5).fillColor("#1E3A8A")
           .text(pin, ML + 14, by + 10, { lineBreak: false });
        by += 28;
      }

      if (serial) {
        doc.font("Helvetica").fontSize(7).fillColor("#3B82F6")
           .text("SERIAL", ML + 14, by, { lineBreak: false, characterSpacing: 0.3 });
        doc.font("Courier").fontSize(9).fillColor("#1E3A8A")
           .text(serial, ML + 14, by + 10, { lineBreak: false });
        by += 22;
      }

      y += BOX_H + 8;
    });

    return y + 4;
  }

  // JAMB — root pin
  const jambPin  = str(pr.pin ?? pr.Pin ?? "");
  const profCode = str(pr.profile_code ?? pr.ProfileCode ?? "");

  if (jambPin || profCode) {
    y = renderSectionHeader(doc, y, "JAMB DETAILS");

    if (jambPin) {
      doc.save().roundedRect(ML, y + 4, CW, 52, 6).fill("#F0FDF4").restore();
      doc.save().roundedRect(ML, y + 4, CW, 52, 6).lineWidth(1).strokeColor("#A7F3D0").stroke().restore();
      doc.font("Helvetica").fontSize(7).fillColor("#15803D")
         .text("PIN", ML + 14, y + 14, { lineBreak: false, characterSpacing: 0.3 });
      doc.font("Courier-Bold").fontSize(11).fillColor("#14532D")
         .text(jambPin, ML + 14, y + 26, { lineBreak: false });
      y += 60;
    }

    if (profCode) {
      doc.save().roundedRect(ML, y + 4, CW, 44, 6).fill("#F0FDF4").restore();
      doc.save().roundedRect(ML, y + 4, CW, 44, 6).lineWidth(1).strokeColor("#A7F3D0").stroke().restore();
      doc.font("Helvetica").fontSize(7).fillColor("#15803D")
         .text("PROFILE CODE", ML + 14, y + 12, { lineBreak: false, characterSpacing: 0.3 });
      doc.font("Courier").fontSize(9.5).fillColor("#14532D")
         .text(profCode, ML + 14, y + 26, { lineBreak: false });
      y += 52;
    }

    return y + 8;
  }

  return y;
}

// ── Identity Verification ─────────────────────────────────────────────────────

function renderIdentity(
  doc:  PDFKit.PDFDocument,
  y:    number,
  meta: Record<string, unknown>,
  pr:   Record<string, unknown>,
): number {
  const rd = (meta.report_data ?? {}) as Record<string, unknown>;
  const pd = ((pr as Record<string, unknown>).data ?? {}) as Record<string, unknown>;

  const firstName  = str(rd.first_name  ?? pd.first_name  ?? "");
  const lastName   = str(rd.last_name   ?? pd.last_name   ?? "");
  const middleName = str(rd.middle_name ?? pd.middle_name ?? "");
  const dob        = str(rd.date_of_birth ?? pd.date_of_birth ?? "");
  const gender     = str(rd.gender ?? pd.gender ?? "");
  const fullName   = [firstName, middleName, lastName].filter(Boolean).join(" ");
  const idType     = str(rd.id_type ?? "").toUpperCase() || "ID NUMBER";
  const idNum      = str(rd.id_number ?? pd.nin ?? pd.bvn ?? "");

  const rows: Array<[string, string]> = [];
  if (fullName) rows.push(["Full Name",    fullName]);
  if (dob)      rows.push(["Date of Birth", dob]);
  if (gender)   rows.push(["Gender",       gender.charAt(0).toUpperCase() + gender.slice(1)]);
  if (idNum)    rows.push([idType,         idNum]);

  if (rows.length === 0) return y;

  y = renderSectionHeader(doc, y, "VERIFICATION RESULT");
  rows.forEach(([lbl, val], i) => { y = renderRow(doc, y, lbl, val, i % 2 !== 0); });

  return y + 8;
}

// ── Wallet Funding ────────────────────────────────────────────────────────────

function renderWalletFunding(
  doc:  PDFKit.PDFDocument,
  y:    number,
  meta: Record<string, unknown>,
  pr:   Record<string, unknown>,
): number {
  const gateway  = str((meta.gateway  ?? pr.gateway  ?? "") as unknown);
  const method   = str((meta.method   ?? pr.method   ?? "") as unknown);
  const credited = meta.credited_amount != null ? Number(meta.credited_amount) : null;
  const fee      = meta.charge_amount  != null ? Number(meta.charge_amount)   : null;

  if (!gateway && !method && credited == null && fee == null) return y;

  y = renderSectionHeader(doc, y, "FUNDING DETAILS");

  const methodLabel = method === "bank_transfer" ? "Bank Transfer"
    : method === "card" ? "Card Payment"
    : method || null;

  const rows: Array<[string, string]> = [];
  if (methodLabel) rows.push(["Method",  methodLabel]);
  if (gateway)     rows.push(["Gateway", gateway.charAt(0).toUpperCase() + gateway.slice(1)]);
  if (credited != null && !isNaN(credited)) rows.push(["Credited Amount", fmtAmt(credited)]);
  if (fee      != null && !isNaN(fee))      rows.push(["Processing Fee",  fmtAmt(fee)]);

  rows.forEach(([lbl, val], i) => { y = renderRow(doc, y, lbl, val, i % 2 !== 0); });

  return y + 8;
}

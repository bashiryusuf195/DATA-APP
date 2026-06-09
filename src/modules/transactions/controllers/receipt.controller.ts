import type { Request, Response, NextFunction } from "express";
import { getDbInstance } from "../../../db/knex";
import { AppError } from "../../../lib/errors";
import { logger } from "../../../lib/logger";
import {
  generateTransactionReceipt,
  receiptNumber,
  type ReceiptData,
} from "../pdf/receipt-generator";

const db = getDbInstance();

// ── GET /transactions/:reference/receipt ──────────────────────────────────────
//
// Generates and returns a PDF receipt for any transaction type.
// Requires: authenticated user who owns the transaction.

export async function downloadReceiptController(
  req:  Request,
  res:  Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { reference } = req.params;
    const userId        = req.user!.id;

    // ── Fetch transaction ────────────────────────────────────────────────────
    const tx = await db("transactions")
      .where({ reference, user_id: userId })
      .first();

    if (!tx) {
      throw new AppError("Transaction not found", "NOT_FOUND", 404);
    }

    // ── Fetch customer profile ───────────────────────────────────────────────
    const user = await db("users")
      .where({ id: userId })
      .select("first_name", "last_name", "email", "phone")
      .first();

    const fullName = [user?.first_name, user?.last_name]
      .filter(Boolean)
      .join(" ") || user?.email || "—";

    // ── Provider pretty-name ─────────────────────────────────────────────────
    const meta     = (tx.metadata ?? {}) as Record<string, unknown>;
    const provResp = (meta.provider_response ?? {}) as Record<string, unknown>;
    const rawProvider = String(
      (tx.provider ?? meta.provider ?? provResp.provider ?? meta.service_id) ?? ""
    ).trim();

    const PROVIDER_NAMES: Record<string, string> = {
      vtpass:      "VTPass",
      VTPASS:      "VTPass",
      paystack:    "Paystack",
      squad:       "Squad",
      flutterwave: "Flutterwave",
    };
    const provider = (PROVIDER_NAMES[rawProvider] ?? PROVIDER_NAMES[rawProvider?.toLowerCase()] ?? rawProvider) || null;

    // ── Build receipt data ───────────────────────────────────────────────────
    const receiptData: ReceiptData = {
      reference:     tx.reference,
      type:          tx.type,
      status:        tx.status,
      amount:        typeof tx.amount === "number" ? tx.amount : parseFloat(String(tx.amount ?? 0)),
      currency:      tx.currency ?? "NGN",
      description:   tx.description ?? "",
      customerName:  fullName,
      customerEmail: user?.email ?? req.user!.email,
      customerPhone: user?.phone ?? tx.phone ?? null,
      createdAt:     tx.created_at,
      provider:      provider || null,
      metadata:      meta,
    };

    // ── Generate PDF ─────────────────────────────────────────────────────────
    const pdfBuffer = await generateTransactionReceipt(receiptData);
    const rn        = receiptNumber(reference);
    const filename  = `hivedata-receipt-${rn}.pdf`;

    logger.info("receipt_generated", { reference, user_id: userId, type: tx.type });

    res.setHeader("Content-Type",        "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length",       pdfBuffer.length);
    res.setHeader("Cache-Control",        "private, no-store");
    res.end(pdfBuffer);
  } catch (err) {
    next(err);
  }
}

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
    // users table: email, phone — no name columns
    // user_profiles table: first_name, last_name, display_name (joined via user_id)
    const [user, profile] = await Promise.all([
      db("users")
        .where({ id: userId })
        .select("email", "phone")
        .first(),
      db("user_profiles")
        .where({ user_id: userId })
        .select("first_name", "last_name", "display_name")
        .first(),
    ]);

    const fullName =
      [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
      profile?.display_name ||
      user?.email ||
      req.user!.email ||
      "Customer";

    // ── Parse metadata ───────────────────────────────────────────────────────
    let rawMeta = tx.metadata;
    if (typeof rawMeta === "string") {
      try { rawMeta = JSON.parse(rawMeta); } catch { rawMeta = {}; }
    }
    const meta = (rawMeta ?? {}) as Record<string, unknown>;

    // ── Build receipt data ───────────────────────────────────────────────────
    // recipientPhone = the number/meter/IUC that was actually serviced,
    // distinct from the customer's own phone number.
    const recipientPhone: string | null =
      (tx.type === "airtime" || tx.type === "data" || tx.type === "transfer")
        ? (tx.phone ?? null)
        : null; // electricity/cable_tv: derived from provider_response in the PDF renderer

    const receiptData: ReceiptData = {
      reference:      tx.reference,
      type:           tx.type,
      status:         tx.status,
      amount:         typeof tx.amount === "number" ? tx.amount : parseFloat(String(tx.amount ?? 0)),
      currency:       tx.currency ?? "NGN",
      description:    tx.description ?? "",
      customerName:   fullName,
      customerEmail:  user?.email ?? req.user!.email,
      customerPhone:  user?.phone ?? null,
      recipientPhone,
      createdAt:      tx.created_at,
      metadata:       meta,
    };

    // ── Generate PDF ─────────────────────────────────────────────────────────
    const pdfBuffer = await generateTransactionReceipt(receiptData);
    const rn        = receiptNumber(reference);
    const filename  = `hivedata-receipt-${rn}.pdf`;

    logger.info("receipt_generated", { reference, user_id: userId, type: tx.type, bytes: pdfBuffer.length });

    res.setHeader("Content-Type",        "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length",       pdfBuffer.length);
    res.setHeader("Cache-Control",        "private, no-store");
    res.end(pdfBuffer);
  } catch (err) {
    logger.error("receipt_failed", {
      reference: req.params.reference,
      user_id:   req.user?.id,
      error:     err instanceof Error ? err.message : String(err),
      stack:     err instanceof Error ? err.stack?.split("\n").slice(0, 6).join(" | ") : undefined,
    });
    next(err);
  }
}

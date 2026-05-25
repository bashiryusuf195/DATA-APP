import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  listAllTransactions,
  getTransactionByReference,
  updateTransactionStatus,
} from "../services/transaction.service";
import { vtuPurchaseQueue } from "../../queue/queues/vtu-purchase.queue";
import { defaultJobOptions } from "../../queue/config/queue.config";
import type { VtuPurchaseJobPayload } from "../../queue/jobs/vtu-purchase.job";
import { logger } from "../../../lib/logger";

const QuerySchema = z.object({
  page:         z.coerce.number().int().min(1).default(1),
  limit:        z.coerce.number().int().min(1).max(100).default(20),
  status:       z.string().optional(),
  service_type: z.string().optional(),
  reference:    z.string().max(200).optional(),
  user_id:      z.string().uuid().optional(),
});

const RETRYABLE_STATUSES = new Set(["failed", "requires_review", "processing", "pending"]);

export async function retryTransactionController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { reference } = req.params;

    const transaction = await getTransactionByReference(reference);
    if (!transaction) {
      res.status(404).json({ success: false, error: "Transaction not found" });
      return;
    }

    if (!RETRYABLE_STATUSES.has(transaction.status as string)) {
      res.status(400).json({
        success: false,
        error: `Cannot retry a '${transaction.status}' transaction. Only failed, requires_review, processing, or pending transactions can be retried.`,
      });
      return;
    }

    if (transaction.status === "successful" || transaction.status === "reversed") {
      res.status(400).json({ success: false, error: "Transaction is already finalized." });
      return;
    }

    // Reset status and stamp retry metadata — the worker sets it to "processing"
    await updateTransactionStatus(reference, {
      status:         "pending",
      failure_reason: null,
      metadata: {
        admin_retry_at:      new Date().toISOString(),
        admin_retry_by:      (req.user as { id?: string } | undefined)?.id ?? "unknown",
        previous_status:     transaction.status,
      },
    });

    // Reconstruct job payload from the stored transaction metadata
    const meta = (transaction.metadata ?? {}) as Record<string, unknown>;
    const payload: VtuPurchaseJobPayload = {
      user_id:          String(transaction.user_id),
      reference:        String(transaction.reference),
      service_type:     transaction.type as VtuPurchaseJobPayload["service_type"],
      amount:           Number(transaction.amount),
      ...(meta.phone            != null && { phone:            String(meta.phone)            }),
      ...(meta.smartcard_number != null && { smartcard_number: String(meta.smartcard_number) }),
      ...(meta.meter_number     != null && { meter_number:     String(meta.meter_number)     }),
      ...(meta.variation_code   != null && { variation_code:   String(meta.variation_code)   }),
      ...(meta.customer_name    != null && { customer_name:    String(meta.customer_name)    }),
    };

    await vtuPurchaseQueue.add("vtu-purchase-retry", payload, {
      ...defaultJobOptions,
      // Single attempt — if the admin is retrying, it's to get a fresh result,
      // not to re-run the same failing path 4 times.
      attempts: 1,
    });

    logger.info("admin_transaction_retry_queued", {
      reference,
      previous_status: transaction.status,
      admin_id: (req.user as { id?: string } | undefined)?.id,
    });

    res.json({
      success: true,
      message: "Transaction re-queued for processing.",
      data: { reference, previous_status: transaction.status },
    });
  } catch (err) {
    next(err);
  }
}

export async function listAllTransactionsController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { page, limit, status, service_type, reference, user_id } =
      QuerySchema.parse(req.query);

    const { rows, total } = await listAllTransactions({
      limit,
      offset: (page - 1) * limit,
      status,
      type:      service_type,
      reference,
      user_id,
    });

    res.json({
      success: true,
      data:    rows,
      meta:    { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
}

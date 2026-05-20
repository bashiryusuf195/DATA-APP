import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { getDbInstance } from "../../../db/knex";
import { logger } from "../../../lib/logger";
import { paystackGateway } from "../services/paystack.service";
import {
  createFundingTransaction,
  getFundingTransactionByReference,
  updateFundingTransaction,
} from "../services/funding-transaction.service";
import {
  createTransaction,
  getTransactionByReference,
} from "../../transactions/services/transaction.service";
import { createNotification } from "../../notifications/services/notification.service";
import { generateFundingReference } from "../../../lib/reference";
import { WalletService } from "../../../services/wallet/WalletService";
import {
  getDefaultActiveGateway,
  calculateCharge,
} from "../../payment-gateways/services/payment-gateway.service";
import { processReferralReward } from "../../referral/services/referral-reward.service";

const db            = getDbInstance();
const walletService = new WalletService(db);

const InitializeFundingSchema = z.object({
  amount: z
    .number({ required_error: "amount is required" })
    .positive("amount must be positive")
    .max(5_000_000, "amount exceeds maximum single funding limit (₦5,000,000)"),
});

// ── POST /wallet/fund/initialize ──────────────────────────────────────────────

export async function initializeFundingController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.id;
    const input  = InitializeFundingSchema.parse(req.body);

    // ── Resolve default active payment gateway ────────────────────────────────
    const activeGateway = await getDefaultActiveGateway();
    if (!activeGateway) {
      res.status(503).json({
        success: false,
        error:   "No active payment gateway configured. Contact support.",
      });
      return;
    }

    // Only Paystack is currently supported — unsupported gateways return 501
    if (activeGateway.code !== "paystack") {
      res.status(501).json({
        success: false,
        error:   `Payment gateway '${activeGateway.name}' is configured but not yet implemented.`,
        gateway: { code: activeGateway.code, name: activeGateway.name },
      });
      return;
    }

    if (!paystackGateway.isConfigured()) {
      res.status(503).json({
        success: false,
        error:   "Paystack is not configured. Contact support.",
      });
      return;
    }

    // Load user email for Paystack initialization
    const user = await db("users").where({ id: userId }).select("id", "email").first();
    if (!user) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }

    // ── Calculate top-up charge ───────────────────────────────────────────────
    const charge = calculateCharge(input.amount, activeGateway.charge_type, activeGateway.charge_value);

    const reference  = generateFundingReference();
    const amountKobo = Math.round(input.amount * 100);

    // Create pending funding transaction first — this is our source of truth
    const fundingTx = await createFundingTransaction({
      user_id:         userId,
      reference,
      payment_gateway: activeGateway.code,
      amount:          input.amount,
      currency:        "NGN",
      charge_type:     charge.charge_type,
      charge_value:    charge.charge_value,
      charge_amount:   charge.charge_amount,
      credited_amount: charge.credited_amount,
      metadata:        { initiated_by: userId, gateway_id: activeGateway.id },
    });

    // Initialize with Paystack — passes our reference so we can match on webhook
    const paymentResult = await paystackGateway.initializePayment({
      email:       user.email,
      amount_kobo: amountKobo,
      reference,
      metadata:    { funding_transaction_id: fundingTx.id, user_id: userId },
    });

    logger.info("wallet_fund_initialized", {
      reference,
      user_id:         userId,
      gateway:         activeGateway.code,
      amount:          input.amount,
      charge_amount:   charge.charge_amount,
      credited_amount: charge.credited_amount,
    });

    res.status(200).json({
      success: true,
      data: {
        reference,
        authorization_url:  paymentResult.authorization_url,
        access_code:        paymentResult.access_code,
        amount:             input.amount,
        charge_amount:      charge.charge_amount,
        credited_amount:    charge.credited_amount,
        currency:           "NGN",
        gateway:            activeGateway.code,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ── POST /wallet/fund/verify/:reference ───────────────────────────────────────
// Development / manual fallback for when webhooks cannot reach localhost.
// Authenticating user can verify only their own transaction; admins can verify any.

export async function verifyFundingController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { reference } = req.params as { reference: string };
    const callerId      = req.user!.id;
    const isAdmin       = req.user!.roles.some((r) =>
      r === "admin" || r === "super_admin"
    );

    // ── Load funding transaction ──────────────────────────────────────────────
    const fundingTx = await getFundingTransactionByReference(reference);
    if (!fundingTx) {
      res.status(404).json({ success: false, error: "Funding transaction not found" });
      return;
    }

    // ── Authorization ─────────────────────────────────────────────────────────
    if (!isAdmin && fundingTx.user_id !== callerId) {
      res.status(403).json({ success: false, error: "Not authorized to verify this transaction" });
      return;
    }

    // ── Idempotency gate ──────────────────────────────────────────────────────
    if (fundingTx.verified) {
      res.status(200).json({
        success: true,
        data:    { funding_transaction: fundingTx, credited: false, reason: "already_verified" },
      });
      return;
    }

    // ── Verify with Paystack API — never trust client input ───────────────────
    if (!paystackGateway.isConfigured()) {
      res.status(503).json({
        success: false,
        error:   "Payment gateway is not configured. Contact support.",
      });
      return;
    }

    const verifyResult = await paystackGateway.verifyPayment(reference);

    logger.info("wallet_fund_verify_result", {
      reference,
      status:  verifyResult.status,
      channel: verifyResult.channel ?? "unknown",
    });

    // ── Payment not successful ────────────────────────────────────────────────
    if (verifyResult.status !== "success") {
      const updated = await updateFundingTransaction(fundingTx.id, {
        status:             verifyResult.status === "abandoned" ? "abandoned" : "failed",
        provider_reference: verifyResult.gateway_reference,
        metadata: {
          ...fundingTx.metadata,
          paystack_status: verifyResult.status,
          last_checked_at: new Date().toISOString(),
        },
      });

      res.status(200).json({
        success: true,
        data: {
          funding_transaction: updated ?? fundingTx,
          credited: false,
          reason:   verifyResult.status,
        },
      });
      return;
    }

    // ── Credit the wallet ─────────────────────────────────────────────────────
    const settlementWalletId = process.env.SYSTEM_SETTLEMENT_WALLET_ID;
    if (!settlementWalletId) {
      throw new Error("SYSTEM_SETTLEMENT_WALLET_ID is not configured");
    }

    const userWallet = await db("wallets")
      .where({ user_id: fundingTx.user_id, wallet_type: "user" })
      .first();

    if (!userWallet) {
      throw new Error(`Wallet not found for user ${fundingTx.user_id}`);
    }

    const paidAmountNgn = verifyResult.amount_kobo / 100;
    // Use credited_amount from the funding record (accounts for any charge).
    // Fall back to paidAmountNgn for legacy rows created before the charge migration.
    const amountNgn = fundingTx.credited_amount ?? paidAmountNgn;

    // Idempotent: WalletService deduplicates on idempotency_key
    const walletResult = await walletService.credit({
      wallet_id:        userWallet.id,
      contra_wallet_id: settlementWalletId,
      amount:           amountNgn,
      currency:         "NGN",
      description:      `Wallet funding via Paystack (${reference})`,
      idempotency_key:  `paystack_credit_${reference}`,
      reference_type:   "paystack_funding",
      reference_id:     fundingTx.id,
      metadata:         { reference, gateway: "paystack" },
    });

    // ── Create transactions record (skip if already exists from worker) ────────
    const existingTx = await getTransactionByReference(reference).catch(() => null);
    if (!existingTx) {
      await createTransaction({
        user_id:               fundingTx.user_id,
        reference,
        type:                  "wallet_funding",
        status:                "successful",
        amount:                amountNgn,
        currency:              "NGN",
        source_wallet_id:      settlementWalletId,
        destination_wallet_id: userWallet.id,
        journal_batch_id:      walletResult.journal_batch_id,
        provider:              "paystack",
        provider_reference:    verifyResult.gateway_reference,
        description:           "Wallet funding via Paystack",
        metadata: {
          payment_channel:        verifyResult.channel,
          paid_at:                verifyResult.paid_at?.toISOString() ?? null,
          funding_transaction_id: fundingTx.id,
          verified_manually:      true,
        },
        processed_at: verifyResult.paid_at ?? new Date(),
      });
    }

    // ── Mark funding transaction verified (idempotency gate — set last) ───────
    const updated = await updateFundingTransaction(fundingTx.id, {
      status:             "successful",
      verified:           true,
      provider_reference: verifyResult.gateway_reference,
      payment_channel:    verifyResult.channel,
      paid_at:            verifyResult.paid_at,
      metadata: {
        ...fundingTx.metadata,
        paystack_raw: {
          status:        verifyResult.status,
          channel:       verifyResult.channel,
          gateway_reference: verifyResult.gateway_reference,
          paid_at:       verifyResult.paid_at?.toISOString() ?? null,
          customer_email: verifyResult.customer_email,
        },
        verified_manually: true,
        verified_at:       new Date().toISOString(),
      },
    });

    // ── First-funding referral reward (fire-and-forget) ───────────────────────
    processReferralReward("first_funding", fundingTx.user_id, amountNgn).catch((err) =>
      logger.warn("referral_first_funding_failed", {
        user_id: fundingTx.user_id,
        error:   (err as Error).message,
      })
    );

    // ── Notify user ───────────────────────────────────────────────────────────
    try {
      await createNotification({
        user_id: fundingTx.user_id,
        channel: "in_app",
        type:    "wallet_funded",
        title:   "Wallet Funded",
        message: `Your wallet has been credited ₦${amountNgn.toLocaleString("en-NG", { minimumFractionDigits: 2 })} via ${verifyResult.channel ?? "Paystack"}.`,
        metadata: {
          reference,
          paid_amount_ngn:  paidAmountNgn,
          amount_ngn:       amountNgn,
          charge_amount:    fundingTx.charge_amount ?? 0,
          payment_channel:  verifyResult.channel,
        },
      });
    } catch (notifErr) {
      logger.warn("wallet_fund_notification_failed", { reference, error: (notifErr as Error).message });
    }

    logger.info("wallet_fund_credited", {
      reference,
      user_id:    fundingTx.user_id,
      amount_ngn: amountNgn,
      idempotent: walletResult.idempotent,
    });

    res.status(200).json({
      success: true,
      data: {
        funding_transaction: updated ?? fundingTx,
        credited:            !walletResult.idempotent,
        journal_batch_id:    walletResult.journal_batch_id,
        amount_ngn:          amountNgn,
      },
    });
  } catch (err) {
    next(err);
  }
}

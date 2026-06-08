import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { getDbInstance } from "../../../db/knex";
import { logger } from "../../../lib/logger";
import { paystackGateway } from "../services/paystack.service";
import { squadGateway } from "../services/squad.service";
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
import { sendTransactionPush } from "../../notifications/services/fcm.service";
import { generateFundingReference } from "../../../lib/reference";
import { WalletService } from "../../../services/wallet/WalletService";
import {
  getDefaultActiveGateway,
  calculateCharge,
} from "../../payment-gateways/services/payment-gateway.service";
import { processReferralReward } from "../../referral/services/referral-reward.service";
import { checkFundingVelocity } from "../../transactions/services/velocity.service";
import type { PaymentGateway } from "../types/payment-gateway.types";

const db            = getDbInstance();
const walletService = new WalletService(db);

const InitializeFundingSchema = z.object({
  amount: z
    .number({ required_error: "amount is required" })
    .positive("amount must be positive")
    .max(5_000_000, "amount exceeds maximum single funding limit (₦5,000,000)"),
  method: z.enum(["bank_transfer", "card"]).optional(),
});

// Canonical verify response shape — matches FundingVerifyResponse on the frontend.
// Every code path through verifyFundingController must return this shape.
type VerifyResponseData = {
  status:          "success" | "pending" | "failed";
  reference:       string;
  amount:          number;
  credited_amount: number;
  new_balance:     number;
  currency:        string;
  message:         string;
};

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

    // Resolve the gateway adapter — add new cases here as gateways are added
    let gateway: (PaymentGateway & { isConfigured(): boolean }) | null = null;
    if (activeGateway.code === "paystack") {
      gateway = paystackGateway;
    } else if (activeGateway.code === "squad") {
      gateway = squadGateway;
    }

    if (!gateway) {
      res.status(501).json({
        success: false,
        error:   `Payment gateway '${activeGateway.name}' is configured but not yet implemented.`,
        gateway: { code: activeGateway.code, name: activeGateway.name },
      });
      return;
    }

    if (!gateway.isConfigured()) {
      res.status(503).json({
        success: false,
        error:   `${activeGateway.name} is not configured. Contact support.`,
      });
      return;
    }

    // Load user email for payment initialization
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

    const metadata = { funding_transaction_id: fundingTx.id, user_id: userId };
    const useBankTransfer =
      input.method === "bank_transfer" &&
      activeGateway.code === "paystack";

    let responseData: Record<string, unknown>;

    if (useBankTransfer) {
      // ── Paystack in-app bank transfer (no checkout redirect) ─────────────────
      // POST /charge returns a temporary account number the user transfers to.
      // The existing charge.success webhook credits the wallet automatically.
      const transferResult = await paystackGateway.initiateBankTransfer({
        email:       user.email,
        amount_kobo: amountKobo,
        reference,
        metadata,
      });

      responseData = {
        reference,
        method:          "bank_transfer",
        transfer_account: {
          account_number: transferResult.account_number,
          account_name:   transferResult.account_name,
          bank_name:      transferResult.bank_name,
          display_text:   transferResult.display_text,
        },
        amount:          input.amount,
        charge_amount:   charge.charge_amount,
        credited_amount: charge.credited_amount,
        currency:        "NGN",
        gateway:         activeGateway.code,
      };

      logger.info("wallet_fund_bank_transfer_initiated", {
        reference,
        user_id:        userId,
        account_number: transferResult.account_number,
        bank_name:      transferResult.bank_name,
        amount:         input.amount,
      });
    } else {
      // ── Standard checkout redirect (card / USSD / Squad) ─────────────────────
      const paymentResult = await gateway.initializePayment({
        email:       user.email,
        amount_kobo: amountKobo,
        reference,
        metadata,
      });

      responseData = {
        reference,
        method:            "card",
        authorization_url: paymentResult.authorization_url,
        access_code:       paymentResult.access_code,
        amount:            input.amount,
        charge_amount:     charge.charge_amount,
        credited_amount:   charge.credited_amount,
        currency:          "NGN",
        gateway:           activeGateway.code,
      };

      logger.info("wallet_fund_initialized", {
        reference,
        user_id:         userId,
        gateway:         activeGateway.code,
        amount:          input.amount,
        charge_amount:   charge.charge_amount,
        credited_amount: charge.credited_amount,
      });
    }

    res.status(200).json({ success: true, data: responseData });
    void checkFundingVelocity(userId, reference).catch(() => undefined);
  } catch (err) {
    next(err);
  }
}

// ── POST /wallet/fund/verify/:reference ───────────────────────────────────────
// Customer-facing verification endpoint.
// Always returns VerifyResponseData so the frontend can branch on `status`
// without inspecting nested fields.
//
// status=success  → wallet credited (or was already credited by webhook)
// status=pending  → Paystack confirmed but wallet credit failed; retry or contact support
// status=failed   → Paystack reported payment was not completed

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

    // ── Resolve user wallet early — needed in both already_verified and credit paths ──
    const userWallet = await db("wallets")
      .where({ user_id: fundingTx.user_id, wallet_type: "user" })
      .first();

    // ── Idempotency gate ──────────────────────────────────────────────────────
    // Wallet was already credited by the webhook worker or a previous verify call.
    // Return success with the current live balance so the customer sees the right
    // state regardless of which path (webhook vs. manual verify) ran first.
    if (fundingTx.verified) {
      const currentBalance = userWallet
        ? await walletService.getBalance(userWallet.id).catch(() => 0)
        : 0;

      const data: VerifyResponseData = {
        status:          "success",
        reference,
        amount:          fundingTx.amount,
        credited_amount: fundingTx.credited_amount ?? fundingTx.amount,
        new_balance:     currentBalance,
        currency:        fundingTx.currency,
        message:         "Payment already processed successfully",
      };

      logger.info("wallet_fund_verify_idempotent", { reference, new_balance: currentBalance });
      res.status(200).json({ success: true, data });
      return;
    }

    // ── Resolve the gateway adapter used for this transaction ────────────────
    const gatewayCode = fundingTx.payment_gateway;
    let verifyGateway: (PaymentGateway & { isConfigured(): boolean }) | null = null;
    if (gatewayCode === "paystack") {
      verifyGateway = paystackGateway;
    } else if (gatewayCode === "squad") {
      verifyGateway = squadGateway;
    }

    if (!verifyGateway) {
      res.status(501).json({
        success: false,
        error:   `Payment gateway '${gatewayCode}' verification is not implemented.`,
      });
      return;
    }

    if (!verifyGateway.isConfigured()) {
      res.status(503).json({
        success: false,
        error:   "Payment gateway is not configured. Contact support.",
      });
      return;
    }

    const verifyResult = await verifyGateway.verifyPayment(reference);

    logger.info("wallet_fund_verify_result", {
      reference,
      gateway: gatewayCode,
      status:  verifyResult.status,
      channel: verifyResult.channel ?? "unknown",
    });

    // ── Payment was not completed ─────────────────────────────────────────────
    if (verifyResult.status !== "success") {
      await updateFundingTransaction(fundingTx.id, {
        status:             verifyResult.status === "abandoned" ? "abandoned" : "failed",
        provider_reference: verifyResult.gateway_reference,
        metadata: {
          ...fundingTx.metadata,
          gateway_status:  verifyResult.status,
          last_checked_at: new Date().toISOString(),
        },
      });

      const data: VerifyResponseData = {
        status:          "failed",
        reference,
        amount:          fundingTx.amount,
        credited_amount: 0,
        new_balance:     0,
        currency:        fundingTx.currency,
        message:         `Payment ${verifyResult.status} — no charge was made`,
      };

      res.status(200).json({ success: true, data });
      return;
    }

    // ── Gateway confirmed — credit the wallet ─────────────────────────────────
    const settlementWalletId = process.env.SYSTEM_SETTLEMENT_WALLET_ID;
    if (!settlementWalletId) {
      throw new Error("SYSTEM_SETTLEMENT_WALLET_ID is not configured");
    }

    if (!userWallet) {
      throw new Error(`Wallet not found for user ${fundingTx.user_id}`);
    }

    const paidAmountNgn = verifyResult.amount_kobo / 100;
    // Use credited_amount from the funding record (accounts for top-up charge).
    // Fall back to paidAmountNgn for legacy rows created before the charge migration.
    const amountNgn = fundingTx.credited_amount ?? paidAmountNgn;

    // Wrap the credit + bookkeeping in a try/catch so a transient failure here
    // returns status=pending instead of a 500.  The funding_transaction stays
    // unverified and the idempotency_key means a retry is safe.
    try {
      // Idempotent: WalletService deduplicates on idempotency_key
      const walletResult = await walletService.credit({
        wallet_id:        userWallet.id,
        contra_wallet_id: settlementWalletId,
        amount:           amountNgn,
        currency:         "NGN",
        description:      `Wallet funding via ${gatewayCode} (${reference})`,
        idempotency_key:  `${gatewayCode}_credit_${reference}`,
        reference_type:   `${gatewayCode}_funding`,
        reference_id:     fundingTx.id,
        metadata:         { reference, gateway: gatewayCode },
      });

      // Fetch the new balance immediately after credit
      const newBalance = await walletService.getBalance(userWallet.id).catch(() => 0);

      // Create transactions record (skip if already exists from webhook worker)
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
          provider:              gatewayCode,
          provider_reference:    verifyResult.gateway_reference,
          description:           `Wallet funding via ${gatewayCode}`,
          metadata: {
            payment_channel:        verifyResult.channel,
            paid_at:                verifyResult.paid_at?.toISOString() ?? null,
            funding_transaction_id: fundingTx.id,
            verified_manually:      true,
          },
          processed_at: verifyResult.paid_at ?? new Date(),
        });
      }

      // Mark funding transaction verified — this is the idempotency gate, set last
      await updateFundingTransaction(fundingTx.id, {
        status:             "successful",
        verified:           true,
        provider_reference: verifyResult.gateway_reference,
        payment_channel:    verifyResult.channel,
        paid_at:            verifyResult.paid_at,
        metadata: {
          ...fundingTx.metadata,
          gateway_raw: {
            status:            verifyResult.status,
            channel:           verifyResult.channel,
            gateway_reference: verifyResult.gateway_reference,
            paid_at:           verifyResult.paid_at?.toISOString() ?? null,
            customer_email:    verifyResult.customer_email,
          },
          verified_manually: true,
          verified_at:       new Date().toISOString(),
        },
      });

      // First-funding referral reward (fire-and-forget)
      processReferralReward("first_funding", fundingTx.user_id, amountNgn).catch((err) =>
        logger.warn("referral_first_funding_failed", {
          user_id: fundingTx.user_id,
          error:   (err as Error).message,
        })
      );

      // Notify user (fire-and-forget — don't let a notification failure break the response)
      createNotification({
        user_id: fundingTx.user_id,
        channel: "in_app",
        type:    "wallet_funded",
        title:   "Wallet Funded",
        message: `Your wallet has been credited ₦${amountNgn.toLocaleString("en-NG", { minimumFractionDigits: 2 })} via ${verifyResult.channel ?? gatewayCode}.`,
        metadata: {
          reference,
          paid_amount_ngn:  paidAmountNgn,
          amount_ngn:       amountNgn,
          charge_amount:    fundingTx.charge_amount ?? 0,
          payment_channel:  verifyResult.channel,
        },
      }).catch((notifErr) =>
        logger.warn("wallet_fund_notification_failed", {
          reference,
          error: (notifErr as Error).message,
        })
      );

      sendTransactionPush(fundingTx.user_id, "wallet_funded", {
        title:             "Wallet Funded",
        body:              `Your wallet has been credited ₦${amountNgn.toLocaleString("en-NG", { minimumFractionDigits: 2 })} via ${verifyResult.channel ?? gatewayCode}.`,
        deep_link:         "/wallet",
        notification_type: "wallet_funded",
      }).catch(() => {/* logged inside sendTransactionPush */});

      logger.info("wallet_fund_credited", {
        reference,
        gateway:     gatewayCode,
        user_id:     fundingTx.user_id,
        amount_ngn:  amountNgn,
        idempotent:  walletResult.idempotent,
        new_balance: newBalance,
      });

      const data: VerifyResponseData = {
        status:          "success",
        reference,
        amount:          fundingTx.amount,
        credited_amount: amountNgn,
        new_balance:     newBalance,
        currency:        fundingTx.currency,
        message:         "Wallet funded successfully",
      };

      res.status(200).json({ success: true, data });

    } catch (creditErr) {
      // Gateway confirmed the payment, but the wallet credit failed.
      // Persist the confirmation in metadata so the repair script can
      // find and retry this funding.  Do NOT set verified=true — the next
      // verify call will re-attempt the credit safely (idempotent key).
      logger.error("wallet_fund_credit_failed", {
        reference,
        gateway: gatewayCode,
        user_id: fundingTx.user_id,
        error:   (creditErr as Error).message,
      });

      await updateFundingTransaction(fundingTx.id, {
        provider_reference: verifyResult.gateway_reference,
        metadata: {
          ...fundingTx.metadata,
          gateway_confirmed: true,
          gateway_raw: {
            status:            verifyResult.status,
            channel:           verifyResult.channel,
            gateway_reference: verifyResult.gateway_reference,
            paid_at:           verifyResult.paid_at?.toISOString() ?? null,
          },
          credit_failed_at: new Date().toISOString(),
          credit_error:     (creditErr as Error).message,
        },
      }).catch(() => {});

      const data: VerifyResponseData = {
        status:          "pending",
        reference,
        amount:          fundingTx.amount,
        credited_amount: 0,
        new_balance:     0,
        currency:        fundingTx.currency,
        message:         "Payment confirmed, wallet credit processing",
      };

      res.status(200).json({ success: true, data });
    }

  } catch (err) {
    next(err);
  }
}

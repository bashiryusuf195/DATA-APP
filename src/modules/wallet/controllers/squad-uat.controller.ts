import { z } from "zod";
import type { Request, Response, NextFunction } from "express";
import { squadSandboxGateway } from "../services/squad.service";
import { config } from "../../../config";
import { logger } from "../../../lib/logger";

// ── Zod schemas ───────────────────────────────────────────────────────────────

const IndividualVASchema = z.object({
  customer_identifier:  z.string().min(1),
  first_name:           z.string().min(1),
  last_name:            z.string().min(1),
  mobile_num:           z.string().min(10),
  email:                z.string().email(),
  bvn:                  z.string().length(11).optional(),
  dob:                  z.string().optional(),  // MM/DD/YYYY
  address:              z.string().optional(),
  gender:               z.enum(["1", "2"]).optional(),
  beneficiary_account:  z.string().optional(),
});

const BusinessVASchema = z.object({
  customer_identifier:  z.string().min(1),
  business_name:        z.string().min(1),
  mobile_num:           z.string().min(10),
  bvn:                  z.string().length(11),
  bank_code:            z.string().optional(),
  beneficiary_account:  z.string().optional(),
});

const SimulatePaymentSchema = z.object({
  virtual_account_number: z.string().min(10),
  amount:                 z.number().positive(),
  payment_date:           z.string().optional(),
  bank_code:              z.string().optional(),
});

const TransactionQuerySchema = z.object({
  page:      z.coerce.number().int().min(1).optional(),
  perPage:   z.coerce.number().int().min(1).max(100).optional(),
  startDate: z.string().optional(),
  endDate:   z.string().optional(),
});

const MerchantTransactionQuerySchema = TransactionQuerySchema.extend({
  virtual_account_number: z.string().optional(),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

// Returns true if sandbox is ready to use, otherwise sends 503 and returns false.
// Both SQUAD_SANDBOX_SECRET_KEY and SQUAD_SANDBOX_BASE_URL must be explicitly set —
// there is no fallback to production credentials.
function assertSandboxConfigured(res: Response): boolean {
  if (!config.squadSandbox.secretKey || !config.squadSandbox.baseUrl) {
    res.status(503).json({
      success: false,
      code:    "SQUAD_SANDBOX_NOT_CONFIGURED",
      error:   "Squad sandbox is not configured. Set SQUAD_SANDBOX_SECRET_KEY and SQUAD_SANDBOX_BASE_URL environment variables.",
    });
    return false;
  }
  return true;
}

function sandboxMeta(endpoint: string) {
  return {
    squad_endpoint: endpoint,
    sandbox_url:    config.squadSandbox.baseUrl,
    sandbox:        true,
  };
}

function validationError(res: Response, errors: z.ZodError): void {
  res.status(400).json({
    success: false,
    error:   "Validation error",
    details: errors.flatten().fieldErrors,
  });
}

// ── Scenario 1: Create Individual Virtual Account ────────────────────────────
// POST /api/v1/admin/squad-uat/individual-account

export async function uatCreateIndividualAccountController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!assertSandboxConfigured(res)) return;
    const parsed = IndividualVASchema.safeParse(req.body);
    if (!parsed.success) { validationError(res, parsed.error); return; }

    const { beneficiary_account, ...rest } = parsed.data;

    // Fall back to sandbox beneficiary account from env if not supplied in body.
    const resolvedBeneficiary = beneficiary_account || config.squadSandbox.beneficiaryAccount;

    logger.info("squad_uat_individual_account", {
      admin_id:            req.user?.id,
      customer_identifier: rest.customer_identifier,
      endpoint:            "POST /virtual-account",
    });

    const result = await squadSandboxGateway.createVirtualAccount({
      ...rest,
      beneficiary_account: resolvedBeneficiary,
    });

    res.status(200).json({
      success:        true,
      squad_response: result,
      meta:           sandboxMeta("POST /virtual-account"),
    });
  } catch (err) {
    const msg = (err as Error).message ?? "Unknown error";
    logger.error("squad_uat_individual_account_error", { admin_id: req.user?.id, error: msg });
    res.status(502).json({ success: false, error: msg, meta: sandboxMeta("POST /virtual-account") });
  }
}

// ── Scenario 2: Create Business Virtual Account ───────────────────────────────
// POST /api/v1/admin/squad-uat/business-account

export async function uatCreateBusinessAccountController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!assertSandboxConfigured(res)) return;
    const parsed = BusinessVASchema.safeParse(req.body);
    if (!parsed.success) { validationError(res, parsed.error); return; }

    const { beneficiary_account, ...rest } = parsed.data;
    const resolvedBeneficiary = beneficiary_account || config.squadSandbox.beneficiaryAccount;

    logger.info("squad_uat_business_account", {
      admin_id:            req.user?.id,
      customer_identifier: rest.customer_identifier,
      endpoint:            "POST /virtual-account/business",
    });

    const result = await squadSandboxGateway.createBusinessVirtualAccount({
      ...rest,
      beneficiary_account: resolvedBeneficiary,
    });

    res.status(200).json({
      success:        true,
      squad_response: result,
      meta:           sandboxMeta("POST /virtual-account/business"),
    });
  } catch (err) {
    const msg = (err as Error).message ?? "Unknown error";
    logger.error("squad_uat_business_account_error", { admin_id: req.user?.id, error: msg });
    res.status(502).json({ success: false, error: msg, meta: sandboxMeta("POST /virtual-account/business") });
  }
}

// ── Scenario 3: Simulate Bank Transfer (sandbox only) ─────────────────────────
// POST /api/v1/admin/squad-uat/simulate-payment

export async function uatSimulatePaymentController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!assertSandboxConfigured(res)) return;
    const parsed = SimulatePaymentSchema.safeParse(req.body);
    if (!parsed.success) { validationError(res, parsed.error); return; }

    logger.info("squad_uat_simulate_payment", {
      admin_id:               req.user?.id,
      virtual_account_number: parsed.data.virtual_account_number,
      amount:                 parsed.data.amount,
      endpoint:               "POST /virtual-account/simulate/payment",
    });

    const result = await squadSandboxGateway.simulateVirtualAccountPayment(parsed.data);

    res.status(200).json({
      success:        true,
      squad_response: result,
      meta: {
        ...sandboxMeta("POST /virtual-account/simulate/payment"),
        note: "Squad will send a virtual-account.credit webhook to your registered webhook URL after processing.",
      },
    });
  } catch (err) {
    const msg = (err as Error).message ?? "Unknown error";
    logger.error("squad_uat_simulate_payment_error", { admin_id: req.user?.id, error: msg });
    res.status(502).json({ success: false, error: msg, meta: sandboxMeta("POST /virtual-account/simulate/payment") });
  }
}

// ── Scenario 4: Customer Transactions ─────────────────────────────────────────
// GET /api/v1/admin/squad-uat/customer-transactions/:customerIdentifier

export async function uatGetCustomerTransactionsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!assertSandboxConfigured(res)) return;
    const { customerIdentifier } = req.params as { customerIdentifier: string };
    if (!customerIdentifier) {
      res.status(400).json({ success: false, error: "customerIdentifier param is required" });
      return;
    }

    const qParsed = TransactionQuerySchema.safeParse(req.query);
    if (!qParsed.success) { validationError(res, qParsed.error); return; }

    const endpoint = `GET /virtual-account/customer/transactions/${customerIdentifier}`;
    logger.info("squad_uat_customer_transactions", { admin_id: req.user?.id, customer_identifier: customerIdentifier, endpoint });

    const result = await squadSandboxGateway.getCustomerVirtualAccountTransactions(
      customerIdentifier,
      qParsed.data
    );

    res.status(200).json({
      success:        true,
      squad_response: result,
      meta:           sandboxMeta(endpoint),
    });
  } catch (err) {
    const msg = (err as Error).message ?? "Unknown error";
    logger.error("squad_uat_customer_transactions_error", { admin_id: req.user?.id, error: msg });
    res.status(502).json({ success: false, error: msg });
  }
}

// ── Scenario 5: Merchant Transactions ─────────────────────────────────────────
// GET /api/v1/admin/squad-uat/merchant-transactions

export async function uatGetMerchantTransactionsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!assertSandboxConfigured(res)) return;
    const qParsed = MerchantTransactionQuerySchema.safeParse(req.query);
    if (!qParsed.success) { validationError(res, qParsed.error); return; }

    logger.info("squad_uat_merchant_transactions", {
      admin_id: req.user?.id,
      endpoint: "GET /virtual-account/merchant/transactions",
    });

    const result = await squadSandboxGateway.getMerchantVirtualAccountTransactions(qParsed.data);

    res.status(200).json({
      success:        true,
      squad_response: result,
      meta:           sandboxMeta("GET /virtual-account/merchant/transactions"),
    });
  } catch (err) {
    const msg = (err as Error).message ?? "Unknown error";
    logger.error("squad_uat_merchant_transactions_error", { admin_id: req.user?.id, error: msg });
    res.status(502).json({ success: false, error: msg });
  }
}

// ── Scenario 6: Retrieve VA by Account Number ─────────────────────────────────
// GET /api/v1/admin/squad-uat/account-number/:virtualAccountNumber

export async function uatFetchVAByNumberController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!assertSandboxConfigured(res)) return;
    const { virtualAccountNumber } = req.params as { virtualAccountNumber: string };
    if (!virtualAccountNumber) {
      res.status(400).json({ success: false, error: "virtualAccountNumber param is required" });
      return;
    }

    const endpoint = `GET /virtual-account/customer/${virtualAccountNumber}`;
    logger.info("squad_uat_va_by_number", { admin_id: req.user?.id, virtual_account_number: virtualAccountNumber, endpoint });

    const result = await squadSandboxGateway.fetchVirtualAccountByNumber(virtualAccountNumber);

    res.status(200).json({
      success:        true,
      squad_response: result,
      meta:           sandboxMeta(endpoint),
    });
  } catch (err) {
    const msg = (err as Error).message ?? "Unknown error";
    logger.error("squad_uat_va_by_number_error", { admin_id: req.user?.id, error: msg });
    res.status(502).json({ success: false, error: msg });
  }
}

// ── Scenario 7: Retrieve VA by Customer Identifier ────────────────────────────
// GET /api/v1/admin/squad-uat/customer/:customerIdentifier

export async function uatFetchVAByCustomerController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!assertSandboxConfigured(res)) return;
    const { customerIdentifier } = req.params as { customerIdentifier: string };
    if (!customerIdentifier) {
      res.status(400).json({ success: false, error: "customerIdentifier param is required" });
      return;
    }

    const endpoint = `GET /virtual-account/${customerIdentifier}`;
    logger.info("squad_uat_va_by_customer", { admin_id: req.user?.id, customer_identifier: customerIdentifier, endpoint });

    const result = await squadSandboxGateway.fetchVirtualAccount(customerIdentifier);

    res.status(200).json({
      success:        true,
      squad_response: result,
      meta:           sandboxMeta(endpoint),
    });
  } catch (err) {
    const msg = (err as Error).message ?? "Unknown error";
    logger.error("squad_uat_va_by_customer_error", { admin_id: req.user?.id, error: msg });
    res.status(502).json({ success: false, error: msg });
  }
}

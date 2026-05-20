import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  listProviderWallets,
  getProviderWallet,
  upsertProviderWalletInfo,
  checkProviderBalance,
  manualBalanceUpdate,
} from "../services/provider-wallet.service";

// ── GET /admin/provider-wallets ───────────────────────────────────────────────

export async function listProviderWalletsController(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const rows = await listProviderWallets();
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
}

// ── GET /admin/provider-wallets/:providerCode ─────────────────────────────────

export async function getProviderWalletController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { providerCode } = req.params;
    const row = await getProviderWallet(providerCode);
    if (!row) {
      res.status(404).json({ success: false, error: "Provider not found" });
      return;
    }
    res.json({ success: true, data: row });
  } catch (err) {
    next(err);
  }
}

// ── PATCH /admin/provider-wallets/:providerCode ───────────────────────────────

const UpdateWalletSchema = z.object({
  funding_bank_name:      z.string().max(200).nullable().optional(),
  funding_account_number: z.string().max(50).nullable().optional(),
  funding_account_name:   z.string().max(200).nullable().optional(),
  low_balance_threshold:  z.number().min(0).nullable().optional(),
  notes:                  z.string().max(2000).nullable().optional(),
}).refine((d) => Object.keys(d).length > 0, {
  message: "At least one field must be provided",
});

export async function updateProviderWalletController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { providerCode } = req.params;

    // Verify provider exists
    const existing = await getProviderWallet(providerCode);
    if (!existing) {
      res.status(404).json({ success: false, error: "Provider not found" });
      return;
    }

    const input = UpdateWalletSchema.parse(req.body);
    const row = await upsertProviderWalletInfo({ provider_code: providerCode, ...input });
    res.json({ success: true, data: row });
  } catch (err) {
    next(err);
  }
}

// ── POST /admin/provider-wallets/:providerCode/check-balance ──────────────────

export async function checkBalanceController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { providerCode } = req.params;

    const existing = await getProviderWallet(providerCode);
    if (!existing) {
      res.status(404).json({ success: false, error: "Provider not found" });
      return;
    }

    const result = await checkProviderBalance(providerCode);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// ── POST /admin/provider-wallets/:providerCode/manual-balance-update ──────────

const ManualUpdateSchema = z.object({
  balance:  z.number().min(0),
  currency: z.string().max(10).optional(),
  notes:    z.string().max(2000).nullable().optional(),
});

export async function manualBalanceUpdateController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { providerCode } = req.params;

    const existing = await getProviderWallet(providerCode);
    if (!existing) {
      res.status(404).json({ success: false, error: "Provider not found" });
      return;
    }

    const input = ManualUpdateSchema.parse(req.body);
    const row = await manualBalanceUpdate({
      provider_code: providerCode,
      ...input,
    });
    res.json({ success: true, data: row });
  } catch (err) {
    next(err);
  }
}

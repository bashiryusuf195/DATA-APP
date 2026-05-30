import { z } from "zod";

export const FundTestSchema = z.object({
  amount: z.number().positive().max(100000),
});

export type FundTestInput = z.infer<typeof FundTestSchema>;

export const TransferSchema = z.object({
  to_wallet_id:    z.string().uuid(),
  amount:          z.number().positive().max(1000000),
  description:     z.string().min(3).max(255).optional(),
  idempotency_key: z.string().min(8).max(128).optional(),
  transaction_pin: z
    .string()
    .regex(/^\d{4}$|^\d{6}$/, "transaction_pin must be exactly 4 or 6 digits"),
});

export type TransferInput = z.infer<typeof TransferSchema>;
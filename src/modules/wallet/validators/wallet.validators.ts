import { z } from "zod";

export const FundTestSchema = z.object({
  amount: z.number().positive().max(100000),
});

export type FundTestInput = z.infer<typeof FundTestSchema>;
export const TransferSchema = z.object({
  to_wallet_id: z.string().uuid(),
  amount: z.number().positive().max(1000000),
  description: z.string().min(3).max(255).optional(),
});

export type TransferInput = z.infer<typeof TransferSchema>;
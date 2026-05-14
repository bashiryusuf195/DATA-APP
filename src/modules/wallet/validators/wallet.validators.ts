import { z } from "zod";

export const FundTestSchema = z.object({
  amount: z.number().positive().max(100000),
});

export type FundTestInput = z.infer<typeof FundTestSchema>;
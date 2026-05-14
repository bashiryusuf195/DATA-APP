import { z } from "zod";

export const AirtimePurchaseSchema = z.object({
  phone: z
    .string()
    .min(11)
    .max(15),

  amount: z
    .number()
    .positive()
    .max(50000),
});
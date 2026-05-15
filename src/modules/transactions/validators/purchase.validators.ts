import { z } from "zod";

// Airtime: amount is user-supplied; no plan lookup needed.
export const AirtimePurchaseSchema = z.object({
  phone: z.string().min(11).max(15),
  amount: z.number().positive().max(50000),
});

// Data: amount comes from DB plan; only variation_code is needed.
export const DataPurchaseSchema = z.object({
  phone: z.string().min(11).max(15),
  variation_code: z.string().min(1),
});

// Electricity: amount is user-supplied (variable top-up); variation_code selects meter type.
export const ElectricityPurchaseSchema = z.object({
  meter_number: z.string().min(6).max(20),
  amount: z.number().positive().max(500000),
  variation_code: z.enum(["prepaid", "postpaid"]),
  phone: z.string().min(11).max(15).optional(),
});

// Cable TV: amount comes from DB plan.
export const CableTvPurchaseSchema = z.object({
  smartcard_number: z.string().min(5).max(20),
  variation_code: z.string().min(1),
});

// Exam PIN: amount comes from DB plan.
export const ExamPinPurchaseSchema = z.object({
  phone: z.string().min(11).max(15),
  variation_code: z.string().min(1),
});

// Identity verification: amount comes from DB plan.
export const IdentityVerificationSchema = z
  .object({
    phone: z.string().min(11).max(15).optional(),
    customer_name: z.string().min(2).max(100).optional(),
    variation_code: z.string().min(1),
  })
  .refine((d) => d.phone ?? d.customer_name, {
    message: "Either phone or customer_name is required",
  });

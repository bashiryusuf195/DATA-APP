import { z } from "zod";

export const AirtimePurchaseSchema = z.object({
  phone: z.string().min(11).max(15),
  amount: z.number().positive().max(50000),
});

export const DataPurchaseSchema = z.object({
  phone: z.string().min(11).max(15),
  amount: z.number().positive().max(50000),
  variation_code: z.string().min(1),
});

export const ElectricityPurchaseSchema = z.object({
  meter_number: z.string().min(6).max(20),
  amount: z.number().positive().max(500000),
  variation_code: z.enum(["prepaid", "postpaid"]),
  phone: z.string().min(11).max(15).optional(),
});

export const CableTvPurchaseSchema = z.object({
  smartcard_number: z.string().min(5).max(20),
  amount: z.number().positive().max(200000),
  variation_code: z.string().min(1),
});

export const ExamPinPurchaseSchema = z.object({
  phone: z.string().min(11).max(15),
  amount: z.number().positive().max(20000),
  variation_code: z.string().min(1),
});

export const IdentityVerificationSchema = z
  .object({
    phone: z.string().min(11).max(15).optional(),
    customer_name: z.string().min(2).max(100).optional(),
    amount: z.number().positive().max(10000),
    variation_code: z.string().min(1),
  })
  .refine((d) => d.phone ?? d.customer_name, {
    message: "Either phone or customer_name is required",
  });
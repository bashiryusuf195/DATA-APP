import { z } from "zod";

// ── Shared field validators ────────────────────────────────────────────────────

// Nigerian phone numbers: 080/081/070/090/091/etc. local format or +234/234 prefix.
// Accepts: 08012345678, +2348012345678, 2348012345678
const nigerianPhone = z
  .string()
  .regex(
    /^(\+?234|0)[789]\d{8}$/,
    "Phone must be a valid Nigerian number (e.g. 08012345678 or +2348012345678)",
  );

// Meter numbers are 6–13 digits (varies by DISCO: IKEDC=11, EKEDC=13, others=11).
const meterNumber = z
  .string()
  .regex(/^\d{6,13}$/, "Meter number must be 6–13 digits with no spaces or letters");

// Smartcard/IUC numbers: DSTV/GOtv are 10 digits; Startimes may be alphanumeric.
const smartcardNumber = z
  .string()
  .regex(
    /^[0-9A-Za-z]{5,15}$/,
    "Smartcard number must be 5–15 alphanumeric characters",
  );

// Variation codes are lowercase slugs stored in the DB (e.g. "mtn-airtime", "ekedc-prepaid").
// Reject anything with shell-special or URL-special characters.
const variationCode = z
  .string()
  .min(1)
  .max(80)
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    "Variation code contains invalid characters",
  );

// Biller codes (cable TV) follow the same safe-slug pattern.
const billerCode = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[a-zA-Z0-9_-]+$/, "Biller code contains invalid characters");

// Customer name: printable characters only, no control chars or HTML.
const customerName = z
  .string()
  .min(2)
  .max(100)
  .regex(/^[\w\s'.,-]+$/, "Customer name contains invalid characters");

// ── Purchase schemas ──────────────────────────────────────────────────────────

// Airtime: amount is user-supplied; no plan lookup needed.
// variation_code carries the network prefix (e.g. "mtn-airtime") and is
// forwarded to the queue so providers can resolve the operator.
export const AirtimePurchaseSchema = z.object({
  phone:          nigerianPhone,
  amount:         z.number().positive().int().max(50_000),
  variation_code: variationCode.optional(),
});

// Data: amount comes from DB plan; only variation_code is needed.
export const DataPurchaseSchema = z.object({
  phone:          nigerianPhone,
  variation_code: variationCode,
});

// Electricity verify: resolves disco + meter type from plan (no wallet debit).
export const ElectricityVerifySchema = z.object({
  meter_number:   meterNumber,
  variation_code: variationCode,
});

// Electricity: amount is user-supplied (variable top-up); variation_code is the full
// plan slug (e.g. "ekedc-prepaid"), not just "prepaid"/"postpaid".
export const ElectricityPurchaseSchema = z.object({
  meter_number:           meterNumber,
  amount:                 z.number().positive().int().min(100).max(500_000),
  variation_code:         variationCode,
  phone:                  nigerianPhone.optional(),
  verified_customer_name: z.string().max(150).optional(),
});

// Cable TV verify: resolves biller from plan (no wallet debit).
export const CableTvVerifySchema = z.object({
  smartcard_number: smartcardNumber,
  biller_code:      billerCode,
});

// Cable TV: amount comes from DB plan; phone + verified customer optional.
export const CableTvPurchaseSchema = z.object({
  smartcard_number:       smartcardNumber,
  variation_code:         variationCode,
  phone:                  nigerianPhone.optional(),
  verified_customer_name: z.string().max(150).optional(),
});

// Exam PIN: amount comes from DB plan.
export const ExamPinPurchaseSchema = z.object({
  phone:          nigerianPhone,
  variation_code: variationCode,
});

// Identity verification: amount comes from DB plan.
// id_number: the NIN (11 digits) or BVN (11 digits) of the subject.
// phone:     Nigerian phone number — valid alternative identifier for NIN-by-phone
//            lookups; not accepted for BVN (provider only supports BVN-by-number).
// At least one of id_number or phone is required.
export const IdentityVerificationSchema = z
  .object({
    id_number:      z.string().regex(/^\d{10,11}$/, "NIN/BVN must be 10–11 digits").optional(),
    phone:          nigerianPhone.optional(),
    variation_code: variationCode,
  })
  .refine((d) => d.id_number ?? d.phone, {
    message: "NIN/BVN number or phone number is required",
  });

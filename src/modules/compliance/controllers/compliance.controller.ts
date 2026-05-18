import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { AppError } from "../../../shared/errors/AppError";
import { listKycUsers, listKycVerifications, updateKycStatus } from "../services/kyc.service";
import { listRiskFlags, createRiskFlag, updateRiskFlag }       from "../services/risk.service";
import { listComplianceReports, getComplianceReport }          from "../services/compliance.service";
import { listBlacklist, addToBlacklist, removeFromBlacklist }  from "../services/blacklist.service";
import { freezeAccount, unfreezeAccount, listFrozenAccounts }  from "../services/freeze.service";

// ─── Shared helpers ────────────────────────────────────────────────────────────

function actorFrom(req: Request): { id: string; email: string } {
  if (!req.user) throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  return { id: req.user.id, email: req.user.email };
}

function paginationFrom(req: Request): { page: number; limit: number } {
  const page  = req.query.page  ? parseInt(String(req.query.page),  10) : 1;
  const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 25;
  return { page, limit };
}

// ─── Schemas ───────────────────────────────────────────────────────────────────

const KycStatusSchema = z.object({
  kyc_level: z.enum(["none", "tier_1", "tier_2", "tier_3"]),
  notes:     z.string().optional(),
});

const FLAG_TYPES = [
  "suspicious_volume",
  "duplicate_funding",
  "fraud_suspected",
  "chargeback_risk",
  "account_takeover",
  "manual_review",
] as const;

const SEVERITIES = ["low", "medium", "high", "critical"] as const;
const FLAG_STATUSES = ["open", "investigating", "resolved", "dismissed"] as const;

const CreateRiskFlagSchema = z.object({
  user_id:         z.string().uuid(),
  flag_type:       z.enum(FLAG_TYPES),
  severity:        z.enum(SEVERITIES),
  title:           z.string().min(1),
  description:     z.string().optional(),
  evidence:        z.record(z.unknown()).optional(),
  transaction_ref: z.string().optional(),
});

const UpdateRiskFlagSchema = z.object({
  status:           z.enum(FLAG_STATUSES).optional(),
  severity:         z.enum(SEVERITIES).optional(),
  assigned_to:      z.string().uuid().optional().nullable(),
  resolution_notes: z.string().optional(),
});

const BLACKLIST_ENTITY_TYPES = ["user", "email", "phone", "bvn", "nin", "ip", "card"] as const;

const AddBlacklistSchema = z.object({
  entity_type:  z.enum(BLACKLIST_ENTITY_TYPES),
  entity_value: z.string().min(1),
  reason:       z.string().min(1),
  notes:        z.string().optional(),
  metadata:     z.record(z.unknown()).optional(),
});

const RemoveBlacklistSchema = z.object({
  reason: z.string().optional(),
});

const FreezeAccountSchema = z.object({
  reason: z.string().min(1),
});

const UnfreezeAccountSchema = z.object({
  notes: z.string().optional(),
});

// ─── KYC Controllers ──────────────────────────────────────────────────────────

export async function listKycUsersController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { kyc_level, search, status } = req.query;
    const { page, limit }               = paginationFrom(req);

    const bvn_verified = req.query.bvn_verified !== undefined
      ? req.query.bvn_verified === "true"
      : undefined;
    const nin_verified = req.query.nin_verified !== undefined
      ? req.query.nin_verified === "true"
      : undefined;

    const result = await listKycUsers({
      kyc_level:     typeof kyc_level === "string" ? kyc_level : undefined,
      search:        typeof search    === "string" ? search    : undefined,
      status:        typeof status    === "string" ? status    : undefined,
      bvn_verified,
      nin_verified,
      page,
      limit,
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

export async function listKycVerificationsController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { user_id, verification_type, status, from, to } = req.query;
    const { page, limit } = paginationFrom(req);

    const result = await listKycVerifications({
      user_id:           typeof user_id           === "string" ? user_id           : undefined,
      verification_type: typeof verification_type === "string" ? verification_type : undefined,
      status:            typeof status            === "string" ? status            : undefined,
      from:              typeof from              === "string" ? from              : undefined,
      to:                typeof to               === "string" ? to                : undefined,
      page,
      limit,
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

export async function updateKycStatusController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id }    = req.params;
    const data      = KycStatusSchema.parse(req.body);
    const { id: actorId, email: actorEmail } = actorFrom(req);

    const updated = await updateKycStatus(id, data, actorId, actorEmail);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
}

// ─── Risk Flag Controllers ────────────────────────────────────────────────────

export async function listRiskFlagsController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { user_id, flag_type, severity, status, from, to, search } = req.query;
    const { page, limit } = paginationFrom(req);

    const result = await listRiskFlags({
      user_id:   typeof user_id   === "string" ? user_id   : undefined,
      flag_type: typeof flag_type === "string" ? flag_type : undefined,
      severity:  typeof severity  === "string" ? severity  : undefined,
      status:    typeof status    === "string" ? status    : undefined,
      from:      typeof from      === "string" ? from      : undefined,
      to:        typeof to        === "string" ? to        : undefined,
      search:    typeof search    === "string" ? search    : undefined,
      page,
      limit,
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

export async function createRiskFlagController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data  = CreateRiskFlagSchema.parse(req.body);
    const { id: actorId, email: actorEmail } = actorFrom(req);

    const created = await createRiskFlag(data, actorId, actorEmail);
    res.status(201).json({ success: true, data: created });
  } catch (err) { next(err); }
}

export async function updateRiskFlagController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const data   = UpdateRiskFlagSchema.parse(req.body);
    const { id: actorId, email: actorEmail } = actorFrom(req);

    const updated = await updateRiskFlag(id, data, actorId, actorEmail);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
}

// ─── Compliance Report Controllers ───────────────────────────────────────────

export async function listComplianceReportsController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { report_type, status, from, to } = req.query;
    const { page, limit } = paginationFrom(req);

    const result = await listComplianceReports({
      report_type: typeof report_type === "string" ? report_type : undefined,
      status:      typeof status      === "string" ? status      : undefined,
      from:        typeof from        === "string" ? from        : undefined,
      to:          typeof to          === "string" ? to          : undefined,
      page,
      limit,
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

export async function getComplianceReportController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const report = await getComplianceReport(req.params.id);
    res.json({ success: true, data: report });
  } catch (err) { next(err); }
}

// ─── Blacklist Controllers ────────────────────────────────────────────────────

export async function listBlacklistController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { entity_type, search } = req.query;
    const { page, limit }         = paginationFrom(req);
    const include_removed         = req.query.include_removed === "true";

    const result = await listBlacklist({
      entity_type:     typeof entity_type === "string" ? entity_type : undefined,
      search:          typeof search      === "string" ? search      : undefined,
      include_removed,
      page,
      limit,
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

export async function addToBlacklistController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data  = AddBlacklistSchema.parse(req.body);
    const { id: actorId, email: actorEmail } = actorFrom(req);

    const created = await addToBlacklist(data, actorId, actorEmail);
    res.status(201).json({ success: true, data: created });
  } catch (err) { next(err); }
}

export async function removeFromBlacklistController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const data   = RemoveBlacklistSchema.parse(req.body);
    const { id: actorId, email: actorEmail } = actorFrom(req);

    const updated = await removeFromBlacklist(id, data, actorId, actorEmail);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
}

// ─── Freeze Controllers ───────────────────────────────────────────────────────

export async function freezeAccountController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const data   = FreezeAccountSchema.parse(req.body);
    const { id: actorId, email: actorEmail } = actorFrom(req);

    const updated = await freezeAccount(id, data, actorId, actorEmail);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
}

export async function unfreezeAccountController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const data   = UnfreezeAccountSchema.parse(req.body);
    const { id: actorId, email: actorEmail } = actorFrom(req);

    const updated = await unfreezeAccount(id, data, actorId, actorEmail);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
}

export async function listFrozenAccountsController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { search, from, to } = req.query;
    const { page, limit }      = paginationFrom(req);

    const result = await listFrozenAccounts({
      search: typeof search === "string" ? search : undefined,
      from:   typeof from   === "string" ? from   : undefined,
      to:     typeof to     === "string" ? to     : undefined,
      page,
      limit,
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

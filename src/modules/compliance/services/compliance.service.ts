import { getDbInstance } from "../../../db/knex";
import { AppError }      from "../../../shared/errors/AppError";

const db = getDbInstance();

export interface ListComplianceReportsFilters {
  report_type?: string;
  status?:      string;
  from?:        string;
  to?:          string;
  page?:        number;
  limit?:       number;
}

export async function listComplianceReports(filters: ListComplianceReportsFilters) {
  const page   = Math.max(1, filters.page  ?? 1);
  const limit  = Math.min(100, Math.max(1, filters.limit ?? 25));
  const offset = (page - 1) * limit;

  const base = db("compliance_reports as cr")
    .leftJoin("users as u",         "u.id",        "cr.generated_by")
    .leftJoin("user_profiles as p",  "p.user_id",  "u.id")
    .modify((q) => {
      if (filters.report_type) q.where("cr.report_type", filters.report_type);
      if (filters.status)      q.where("cr.status",      filters.status);
      if (filters.from)        q.where("cr.created_at", ">=", filters.from);
      if (filters.to)          q.where("cr.created_at", "<=", filters.to);
    });

  const [{ count }] = await base
    .clone()
    .count<{ count: string }[]>("cr.id as count");

  const rows = await base
    .clone()
    .orderBy("cr.created_at", "desc")
    .limit(limit)
    .offset(offset)
    .select(
      "cr.id",
      "cr.report_type",
      "cr.title",
      "cr.period_start",
      "cr.period_end",
      "cr.summary",
      "cr.status",
      "cr.generated_by",
      "cr.created_at",
      "cr.updated_at",
      db.raw(
        "COALESCE(NULLIF(TRIM(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'')), ''), u.email) AS generated_by_name",
      ),
      "u.email AS generated_by_email",
    );

  return {
    data:  rows,
    total: parseInt(count, 10),
    page,
    limit,
  };
}

export async function getComplianceReport(id: string) {
  const report = await db("compliance_reports as cr")
    .leftJoin("users as u",         "u.id",       "cr.generated_by")
    .leftJoin("user_profiles as p",  "p.user_id", "u.id")
    .where("cr.id", id)
    .first(
      "cr.id",
      "cr.report_type",
      "cr.title",
      "cr.period_start",
      "cr.period_end",
      "cr.summary",
      "cr.data",
      "cr.status",
      "cr.generated_by",
      "cr.created_at",
      "cr.updated_at",
      db.raw(
        "COALESCE(NULLIF(TRIM(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'')), ''), u.email) AS generated_by_name",
      ),
      "u.email AS generated_by_email",
    );

  if (!report) {
    throw new AppError(404, "REPORT_NOT_FOUND", "Compliance report not found");
  }

  return report;
}

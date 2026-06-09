import { getDbInstance } from "../../../db/knex";
import { AppError } from "../../../shared/errors/AppError";

const db = getDbInstance();

export type ServiceStatusValue = "available" | "delayed" | "maintenance" | "unavailable";

export interface ServiceStatusRow {
  service_key:       string;
  service_name:      string;
  category:          string;
  status:            ServiceStatusValue;
  message:           string | null;
  maintenance_start: Date | null;
  maintenance_end:   Date | null;
  updated_by:        string | null;
  created_at:        Date;
  updated_at:        Date;
}

export interface UpdateServiceStatusInput {
  status?:            ServiceStatusValue;
  message?:           string | null;
  maintenance_start?: string | null;
  maintenance_end?:   string | null;
  updated_by?:        string;
}

export async function getAllServiceStatuses(): Promise<ServiceStatusRow[]> {
  return db("service_statuses")
    .orderByRaw("CASE category WHEN 'airtime_data' THEN 0 WHEN 'electricity' THEN 1 WHEN 'cable_tv' THEN 2 WHEN 'exam_pin' THEN 3 ELSE 4 END")
    .orderBy("service_key") as Promise<ServiceStatusRow[]>;
}

export async function updateServiceStatus(
  key:   string,
  input: UpdateServiceStatusInput,
): Promise<ServiceStatusRow> {
  const patch: Record<string, unknown> = { updated_at: new Date() };
  if (input.status            !== undefined) patch.status            = input.status;
  if (input.message           !== undefined) patch.message           = input.message ?? null;
  if (input.maintenance_start !== undefined) patch.maintenance_start = input.maintenance_start ? new Date(input.maintenance_start) : null;
  if (input.maintenance_end   !== undefined) patch.maintenance_end   = input.maintenance_end   ? new Date(input.maintenance_end)   : null;
  if (input.updated_by        !== undefined) patch.updated_by        = input.updated_by;

  const [row] = await db("service_statuses")
    .where({ service_key: key })
    .update(patch)
    .returning("*");

  if (!row) throw new AppError(404, "NOT_FOUND", "Service not found");
  return row as ServiceStatusRow;
}

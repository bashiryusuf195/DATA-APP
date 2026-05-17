import { getDbInstance } from "../../../db/knex";
import { NotFoundError } from "../../../lib/errors";
import { checkRedisHealth } from "../../../config/redis";
import {
  fetchAllSettings,
  fetchSettingByKey,
  updateSetting,
  type SettingRow,
} from "../repositories/settings.repository";

export type SafeSettingRow = Omit<SettingRow, "value"> & { value: string | null };

export interface SettingsByCategory {
  [category: string]: SafeSettingRow[];
}

export interface EnvironmentInfo {
  node_version: string;
  uptime_seconds: number;
  memory_mb: { rss: number; heap_used: number; heap_total: number };
  redis_healthy: boolean;
  db_healthy: boolean;
  env: string;
}

function maskSecret(row: SettingRow): SafeSettingRow {
  return { ...row, value: row.is_secret ? null : row.value };
}

function validateValue(row: SettingRow, raw: string): string {
  const v = raw.trim();
  switch (row.value_type) {
    case "boolean":
      if (v !== "true" && v !== "false") {
        throw new Error(`Setting "${row.key}" must be "true" or "false"`);
      }
      return v;

    case "number": {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) {
        throw new Error(`Setting "${row.key}" must be a non-negative number`);
      }
      return v;
    }

    case "json":
      try {
        JSON.parse(v);
      } catch {
        throw new Error(`Setting "${row.key}" must be valid JSON`);
      }
      return v;

    case "text":
      if (v.length > 2000) {
        throw new Error(`Setting "${row.key}" must be 2000 characters or fewer`);
      }
      return v;

    default:
      return v;
  }
}

export async function listSettings(): Promise<SettingsByCategory> {
  const db = getDbInstance();
  const rows = await fetchAllSettings(db);
  const grouped: SettingsByCategory = {};
  for (const row of rows) {
    if (!grouped[row.category]) grouped[row.category] = [];
    grouped[row.category].push(maskSecret(row));
  }
  return grouped;
}

export async function updateSettingByKey(
  key: string,
  rawValue: string,
  updatedBy: string,
): Promise<SafeSettingRow> {
  const db = getDbInstance();
  const existing = await fetchSettingByKey(db, key);
  if (!existing) throw new NotFoundError(`Setting "${key}"`);

  const validated = validateValue(existing, rawValue);
  const updated = await updateSetting(db, key, validated, updatedBy);
  if (!updated) throw new NotFoundError(`Setting "${key}"`);

  return maskSecret(updated);
}

export async function getEnvironmentInfo(): Promise<EnvironmentInfo> {
  const db = getDbInstance();
  const mem = process.memoryUsage();

  const [redisHealthy, dbHealthy] = await Promise.all([
    checkRedisHealth(),
    db("admin_settings").select(db.raw("1")).limit(1).then(() => true).catch(() => false),
  ]);

  return {
    node_version: process.version,
    uptime_seconds: Math.floor(process.uptime()),
    memory_mb: {
      rss: Math.round(mem.rss / 1024 / 1024),
      heap_used: Math.round(mem.heapUsed / 1024 / 1024),
      heap_total: Math.round(mem.heapTotal / 1024 / 1024),
    },
    redis_healthy: redisHealthy,
    db_healthy: dbHealthy,
    env: process.env.NODE_ENV ?? "development",
  };
}

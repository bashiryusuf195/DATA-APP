import type { Knex } from "knex";

export interface SettingRow {
  key: string;
  value: string;
  value_type: "text" | "number" | "boolean" | "json";
  label: string;
  description: string | null;
  category: string;
  is_secret: boolean;
  updated_by: string | null;
  updated_at: string;
}

export async function fetchAllSettings(db: Knex): Promise<SettingRow[]> {
  return db("admin_settings")
    .orderBy("category")
    .orderBy("key")
    .select<SettingRow[]>("*");
}

export async function fetchSettingByKey(
  db: Knex,
  key: string,
): Promise<SettingRow | undefined> {
  return db("admin_settings").where({ key }).first<SettingRow>();
}

export async function updateSetting(
  db: Knex,
  key: string,
  value: string,
  updatedBy: string,
): Promise<SettingRow | undefined> {
  const rows = await db("admin_settings")
    .where({ key })
    .update({ value, updated_by: updatedBy, updated_at: db.fn.now() })
    .returning("*");
  return rows[0] as SettingRow | undefined;
}

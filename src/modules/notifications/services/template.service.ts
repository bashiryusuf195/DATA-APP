import { randomUUID } from "crypto";
import { getDbInstance } from "../../../db/knex";
import { AppError } from "../../../shared/errors/AppError";

const db = getDbInstance();

export interface NotificationTemplate {
  id: string;
  name: string;
  type: string;
  notification_type: string;
  subject: string | null;
  body: string;
  variables: string[];
  is_active: boolean;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export async function listTemplates(filters: {
  type?: string;
  notification_type?: string;
  is_active?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const page   = Math.max(1, filters.page  ?? 1);
  const limit  = Math.min(100, Math.max(1, filters.limit ?? 25));
  const offset = (page - 1) * limit;

  const base = db("notification_templates").modify((q) => {
    if (filters.type)              q.where("type", filters.type);
    if (filters.notification_type) q.where("notification_type", filters.notification_type);
    if (filters.is_active !== undefined) q.where("is_active", filters.is_active);
    if (filters.search) {
      const term = `%${filters.search}%`;
      q.where(function () {
        this.whereRaw("name ILIKE ?", [term]).orWhereRaw("body ILIKE ?", [term]);
      });
    }
  });

  const [{ count }] = await base.clone().count<{ count: string }[]>("id as count");
  const rows        = await base.clone().orderBy("created_at", "desc").limit(limit).offset(offset);

  return { data: rows as NotificationTemplate[], total: parseInt(count, 10), page, limit };
}

export async function getTemplate(id: string): Promise<NotificationTemplate> {
  const row = await db("notification_templates").where({ id }).first();
  if (!row) throw new AppError(404, "NOT_FOUND", "Template not found");
  return row as NotificationTemplate;
}

export async function createTemplate(input: {
  name: string;
  type: string;
  notification_type: string;
  subject?: string | null;
  body: string;
  variables?: string[];
  is_active?: boolean;
  created_by?: string;
}): Promise<NotificationTemplate> {
  const existing = await db("notification_templates").where("name", input.name).first();
  if (existing) throw new AppError(409, "DUPLICATE", `Template "${input.name}" already exists`);

  const [template] = await db("notification_templates")
    .insert({
      id:                randomUUID(),
      name:              input.name,
      type:              input.type,
      notification_type: input.notification_type,
      subject:           input.subject ?? null,
      body:              input.body,
      variables:         JSON.stringify(input.variables ?? []),
      is_active:         input.is_active ?? true,
      created_by:        input.created_by ?? null,
    })
    .returning("*");

  return template as NotificationTemplate;
}

export async function updateTemplate(
  id: string,
  input: Partial<{
    name:              string;
    type:              string;
    notification_type: string;
    subject:           string | null;
    body:              string;
    variables:         string[];
    is_active:         boolean;
  }>
): Promise<NotificationTemplate> {
  const tmpl = await db("notification_templates").where({ id }).first();
  if (!tmpl) throw new AppError(404, "NOT_FOUND", "Template not found");

  if (input.name && input.name !== (tmpl.name as string)) {
    const conflict = await db("notification_templates")
      .where("name", input.name)
      .whereNot("id", id)
      .first();
    if (conflict) throw new AppError(409, "DUPLICATE", `Name "${input.name}" is already taken`);
  }

  const patch: Record<string, unknown> = { updated_at: new Date() };
  if (input.name              !== undefined) patch.name              = input.name;
  if (input.type              !== undefined) patch.type              = input.type;
  if (input.notification_type !== undefined) patch.notification_type = input.notification_type;
  if (input.subject           !== undefined) patch.subject           = input.subject;
  if (input.body              !== undefined) patch.body              = input.body;
  if (input.variables         !== undefined) patch.variables         = JSON.stringify(input.variables);
  if (input.is_active         !== undefined) patch.is_active         = input.is_active;

  const [updated] = await db("notification_templates").where({ id }).update(patch).returning("*");
  return updated as NotificationTemplate;
}

export function renderTemplate(body: string, variables: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key: string) => variables[key] ?? `{{${key}}}`);
}

import { randomUUID } from "crypto";
import { getDbInstance } from "../../../db/knex";
import { AppError } from "../../../shared/errors/AppError";

const db = getDbInstance();

export interface Announcement {
  id:           string;
  title:        string;
  message:      string;
  display_type: "popup" | "ticker";
  priority:     number;
  status:       "active" | "inactive";
  start_at:     Date | null;
  end_at:       Date | null;
  created_by:   string | null;
  created_at:   Date;
  updated_at:   Date;
}

export interface CreateAnnouncementInput {
  title:        string;
  message:      string;
  display_type: "popup" | "ticker";
  priority?:    number;
  status?:      "active" | "inactive";
  start_at?:    string | null;
  end_at?:      string | null;
  created_by?:  string;
}

export type UpdateAnnouncementInput = Partial<Omit<CreateAnnouncementInput, "created_by">>;

export async function listActiveAnnouncements(): Promise<Announcement[]> {
  const now = new Date();
  return db("announcements")
    .where("status", "active")
    .whereIn("display_type", ["popup", "ticker"])
    .where(function () {
      this.whereNull("start_at").orWhere("start_at", "<=", now);
    })
    .where(function () {
      this.whereNull("end_at").orWhere("end_at", ">=", now);
    })
    .orderBy([
      { column: "priority", order: "desc" },
      { column: "created_at", order: "desc" },
    ]);
}

export async function listAllAnnouncements(filters: {
  status?:       string;
  display_type?: string;
  page?:         number;
  limit?:        number;
}): Promise<{ data: Announcement[]; total: number; page: number; limit: number }> {
  const page   = Math.max(1, filters.page  ?? 1);
  const limit  = Math.min(100, Math.max(1, filters.limit ?? 25));
  const offset = (page - 1) * limit;

  const base = db("announcements").modify((q) => {
    if (filters.status)       q.where("status",       filters.status);
    if (filters.display_type) q.where("display_type", filters.display_type);
  });

  const [{ count }] = await base.clone().count<{ count: string }[]>("id as count");
  const data        = await base.clone().orderBy("created_at", "desc").limit(limit).offset(offset);

  return { data: data as Announcement[], total: parseInt(count, 10), page, limit };
}

export async function createAnnouncement(input: CreateAnnouncementInput): Promise<Announcement> {
  const [row] = await db("announcements")
    .insert({
      id:           randomUUID(),
      title:        input.title,
      message:      input.message,
      display_type: input.display_type,
      priority:     input.priority  ?? 0,
      status:       input.status    ?? "active",
      start_at:     input.start_at  ? new Date(input.start_at)  : null,
      end_at:       input.end_at    ? new Date(input.end_at)    : null,
      created_by:   input.created_by ?? null,
    })
    .returning("*");
  return row as Announcement;
}

export async function updateAnnouncement(
  id:    string,
  input: UpdateAnnouncementInput,
): Promise<Announcement> {
  const patch: Record<string, unknown> = { updated_at: new Date() };
  if (input.title        !== undefined) patch.title        = input.title;
  if (input.message      !== undefined) patch.message      = input.message;
  if (input.display_type !== undefined) patch.display_type = input.display_type;
  if (input.priority     !== undefined) patch.priority     = input.priority;
  if (input.status       !== undefined) patch.status       = input.status;
  if (input.start_at     !== undefined) patch.start_at     = input.start_at ? new Date(input.start_at) : null;
  if (input.end_at       !== undefined) patch.end_at       = input.end_at   ? new Date(input.end_at)   : null;

  const [row] = await db("announcements").where({ id }).update(patch).returning("*");
  if (!row) throw new AppError(404, "NOT_FOUND", "Announcement not found");
  return row as Announcement;
}

export async function deleteAnnouncement(id: string): Promise<void> {
  const deleted = await db("announcements").where({ id }).delete();
  if (!deleted) throw new AppError(404, "NOT_FOUND", "Announcement not found");
}

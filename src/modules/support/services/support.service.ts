import { randomUUID } from "crypto";
import { getDbInstance } from "../../../db/knex";
import { sendAdminPushNotification } from "../../notifications/services/admin-push.service";

const db = getDbInstance();

function generateTicketRef(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).toUpperCase().slice(2, 6);
  return `TKT-${date}-${rand}`;
}

export type TicketStatus   = "open" | "pending" | "resolved" | "closed";
export type TicketPriority = "low" | "medium" | "high" | "urgent";
export type TicketCategory = "complaint" | "dispute" | "inquiry" | "technical" | "billing";
export type MessageSenderType = "admin" | "customer" | "system";

export interface CreateTicketData {
  user_id?:               string | null;
  user_email?:            string | null;
  transaction_reference?: string | null;
  subject:                string;
  description?:           string | null;
  status?:                TicketStatus;
  priority?:              TicketPriority;
  category?:              TicketCategory | null;
  assigned_to?:           string | null;
  assigned_to_email?:     string | null;
}

export interface UpdateTicketData {
  status?:            TicketStatus;
  priority?:          TicketPriority;
  category?:          TicketCategory | null;
  assigned_to?:       string | null;
  assigned_to_email?: string | null;
  resolution_notes?:  string | null;
}

export interface AddMessageData {
  sender_type:   MessageSenderType;
  sender_id?:    string | null;
  sender_email?: string | null;
  body:          string;
  is_internal?:  boolean;
}

export async function adminListTickets(filters: {
  status?:      string;
  priority?:    string;
  category?:    string;
  assigned_to?: string;
  user_id?:     string;
  search?:      string;
  page?:        number;
  limit?:       number;
}) {
  const page   = Math.max(1, filters.page  ?? 1);
  const limit  = Math.min(100, Math.max(1, filters.limit ?? 25));
  const offset = (page - 1) * limit;

  const base = db("support_tickets as t").modify((q) => {
    if (filters.status)      q.where("t.status",      filters.status);
    if (filters.priority)    q.where("t.priority",    filters.priority);
    if (filters.category)    q.where("t.category",    filters.category);
    if (filters.assigned_to) q.where("t.assigned_to", filters.assigned_to);
    if (filters.user_id)     q.where("t.user_id",     filters.user_id);
    if (filters.search) {
      const term = `%${filters.search}%`;
      q.where(function () {
        this.whereRaw("t.subject ILIKE ?",               [term])
          .orWhereRaw("t.reference ILIKE ?",             [term])
          .orWhereRaw("t.user_email ILIKE ?",            [term])
          .orWhereRaw("t.transaction_reference ILIKE ?", [term]);
      });
    }
  });

  const [{ count }] = await base.clone().count<{ count: string }[]>("t.id as count");
  const rows = await base
    .clone()
    .orderBy("t.created_at", "desc")
    .limit(limit)
    .offset(offset)
    .select(
      "t.id", "t.reference", "t.user_id", "t.user_email",
      "t.transaction_reference", "t.subject", "t.description",
      "t.status", "t.priority", "t.category",
      "t.assigned_to", "t.assigned_to_email",
      "t.resolution_notes", "t.resolved_at", "t.closed_at",
      "t.created_at", "t.updated_at",
    );

  return { data: rows, total: parseInt(count, 10), page, limit };
}

export async function adminGetTicket(id: string) {
  const ticket = await db("support_tickets").where({ id }).first();
  if (!ticket) return null;
  const messages = await db("support_messages")
    .where({ ticket_id: id })
    .orderBy("created_at", "asc")
    .select("*");
  return { ...ticket, messages };
}

export async function createTicket(data: CreateTicketData) {
  const [row] = await db("support_tickets")
    .insert({
      id:                    randomUUID(),
      reference:             generateTicketRef(),
      user_id:               data.user_id               ?? null,
      user_email:            data.user_email             ?? null,
      transaction_reference: data.transaction_reference  ?? null,
      subject:               data.subject,
      description:           data.description            ?? null,
      status:                data.status                 ?? "open",
      priority:              data.priority               ?? "medium",
      category:              data.category               ?? null,
      assigned_to:           data.assigned_to            ?? null,
      assigned_to_email:     data.assigned_to_email      ?? null,
    })
    .returning("*");

  sendAdminPushNotification({
    title:             "New Support Ticket",
    body:              `"${data.subject}" from ${data.user_email ?? "anonymous"}`,
    deep_link:         `/support/tickets`,
    notification_type: "admin_support_message",
    preference_key:    "admin_support_messages",
    metadata: {
      ticket_reference: (row as Record<string, unknown>).reference as string ?? "",
      subject:          data.subject,
      user_email:       data.user_email ?? "",
      priority:         data.priority ?? "medium",
    },
  }).catch(() => {});

  return row;
}

export async function updateTicket(id: string, data: UpdateTicketData) {
  const patch: Record<string, unknown> = { ...data, updated_at: new Date() };
  if (data.status === "resolved") patch.resolved_at = new Date();
  if (data.status === "closed")   patch.closed_at   = new Date();

  const rows = await db("support_tickets")
    .where({ id })
    .update(patch)
    .returning("*");
  return rows[0] ?? null;
}

export async function addMessage(ticketId: string, data: AddMessageData) {
  const [row] = await db("support_messages")
    .insert({
      id:           randomUUID(),
      ticket_id:    ticketId,
      sender_type:  data.sender_type,
      sender_id:    data.sender_id    ?? null,
      sender_email: data.sender_email ?? null,
      body:         data.body,
      is_internal:  data.is_internal  ?? false,
    })
    .returning("*");
  return row;
}

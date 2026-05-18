import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { AppError } from "../../../shared/errors/AppError";
import {
  adminListTickets,
  adminGetTicket,
  createTicket,
  updateTicket,
  addMessage,
} from "../services/support.service";

const TICKET_STATUSES       = ["open", "pending", "resolved", "closed"]                          as const;
const TICKET_PRIORITIES     = ["low", "medium", "high", "urgent"]                                as const;
const TICKET_CATEGORIES     = ["complaint", "dispute", "inquiry", "technical", "billing"]        as const;
const MESSAGE_SENDER_TYPES  = ["admin", "customer", "system"]                                    as const;

const CreateTicketSchema = z.object({
  user_id:               z.string().uuid().nullable().optional(),
  user_email:            z.string().email().max(200).nullable().optional(),
  transaction_reference: z.string().max(200).nullable().optional(),
  subject:               z.string().min(1).max(500),
  description:           z.string().max(10000).nullable().optional(),
  status:                z.enum(TICKET_STATUSES).default("open"),
  priority:              z.enum(TICKET_PRIORITIES).default("medium"),
  category:              z.enum(TICKET_CATEGORIES).nullable().optional(),
  assigned_to:           z.string().uuid().nullable().optional(),
  assigned_to_email:     z.string().email().max(200).nullable().optional(),
});

const UpdateTicketSchema = z
  .object({
    status:            z.enum(TICKET_STATUSES).optional(),
    priority:          z.enum(TICKET_PRIORITIES).optional(),
    category:          z.enum(TICKET_CATEGORIES).nullable().optional(),
    assigned_to:       z.string().uuid().nullable().optional(),
    assigned_to_email: z.string().email().max(200).nullable().optional(),
    resolution_notes:  z.string().max(10000).nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "At least one field must be provided" });

const AddMessageSchema = z.object({
  sender_type:  z.enum(MESSAGE_SENDER_TYPES),
  sender_id:    z.string().uuid().nullable().optional(),
  sender_email: z.string().email().max(200).nullable().optional(),
  body:         z.string().min(1).max(10000),
  is_internal:  z.boolean().default(false),
});

export async function listTicketsController(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { status, priority, category, assigned_to, user_id, search } = req.query;
    const page  = req.query.page  ? parseInt(String(req.query.page),  10) : 1;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 25;

    const result = await adminListTickets({
      status:      typeof status      === "string" ? status      : undefined,
      priority:    typeof priority    === "string" ? priority    : undefined,
      category:    typeof category    === "string" ? category    : undefined,
      assigned_to: typeof assigned_to === "string" ? assigned_to : undefined,
      user_id:     typeof user_id     === "string" ? user_id     : undefined,
      search:      typeof search      === "string" ? search      : undefined,
      page,
      limit,
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

export async function getTicketController(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const ticket = await adminGetTicket(req.params.id);
    if (!ticket) throw new AppError(404, "TICKET_NOT_FOUND", "Support ticket not found");
    res.json({ success: true, data: ticket });
  } catch (err) { next(err); }
}

export async function createTicketController(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const data   = CreateTicketSchema.parse(req.body);
    const ticket = await createTicket(data);
    res.status(201).json({ success: true, data: ticket });
  } catch (err) { next(err); }
}

export async function updateTicketController(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const data   = UpdateTicketSchema.parse(req.body);
    const ticket = await updateTicket(req.params.id, data);
    if (!ticket) throw new AppError(404, "TICKET_NOT_FOUND", "Support ticket not found");
    res.json({ success: true, data: ticket });
  } catch (err) { next(err); }
}

export async function addMessageController(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const ticketId = req.params.id;
    const exists   = await adminGetTicket(ticketId);
    if (!exists) throw new AppError(404, "TICKET_NOT_FOUND", "Support ticket not found");

    const data    = AddMessageSchema.parse(req.body);
    const message = await addMessage(ticketId, data);
    res.status(201).json({ success: true, data: message });
  } catch (err) { next(err); }
}

import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  listAllAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
} from "../services/announcement.service";
import { AppError } from "../../../shared/errors/AppError";

const DisplayTypeEnum = z.enum(["popup", "ticker"]);
const StatusEnum      = z.enum(["active", "inactive"]);

const CreateSchema = z.object({
  title:        z.string().min(1).max(255),
  message:      z.string().min(1),
  display_type: DisplayTypeEnum,
  priority:     z.number().int().min(0).max(100).optional(),
  status:       StatusEnum.optional(),
  start_at:     z.string().datetime().optional().nullable(),
  end_at:       z.string().datetime().optional().nullable(),
});

const UpdateSchema = CreateSchema.partial();

const ListQuerySchema = z.object({
  status:       StatusEnum.optional(),
  display_type: DisplayTypeEnum.optional(),
  page:         z.coerce.number().int().min(1).default(1),
  limit:        z.coerce.number().int().min(1).max(100).default(25),
});

export async function listAnnouncementsController(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const q      = ListQuerySchema.parse(req.query);
    const result = await listAllAnnouncements(q);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

export async function createAnnouncementController(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const body      = CreateSchema.parse(req.body);
    const createdBy = (req as Request & { user?: { id: string } }).user?.id;
    const row       = await createAnnouncement({ ...body, created_by: createdBy });
    res.status(201).json({ success: true, data: row });
  } catch (err) { next(err); }
}

export async function updateAnnouncementController(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) throw new AppError(400, "MISSING_PARAM", "id is required");
    const body = UpdateSchema.parse(req.body);
    const row  = await updateAnnouncement(id, body);
    res.json({ success: true, data: row });
  } catch (err) { next(err); }
}

export async function deleteAnnouncementController(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) throw new AppError(400, "MISSING_PARAM", "id is required");
    await deleteAnnouncement(id);
    res.status(204).end();
  } catch (err) { next(err); }
}

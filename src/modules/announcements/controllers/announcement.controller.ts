import type { Request, Response, NextFunction } from "express";
import { listActiveAnnouncements } from "../services/announcement.service";

export async function getActiveAnnouncementsController(
  _req: Request,
  res:  Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await listActiveAnnouncements();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

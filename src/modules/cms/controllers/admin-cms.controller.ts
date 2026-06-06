import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  listPages,
  getPage,
  upsertPage,
  setPublished,
  deletePage,
} from "../services/cms.service";
import { AppError } from "../../../shared/errors/AppError";

const SlugSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, or hyphens");

const UpsertSchema = z.object({
  title:        z.string().min(1).max(255),
  content:      z.string(),
  is_published: z.boolean().optional(),
});

const PublishSchema = z.object({
  is_published: z.boolean(),
});

function userId(req: Request): string {
  const id = (req as Request & { user?: { id: string } }).user?.id;
  if (!id) throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  return id;
}

export async function listPagesController(
  _req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const pages = await listPages();
    res.json({ success: true, data: pages });
  } catch (err) { next(err); }
}

export async function getPageController(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { slug } = req.params;
    if (!slug) throw new AppError(400, "MISSING_PARAM", "slug is required");
    const page = await getPage(slug);
    res.json({ success: true, data: page });
  } catch (err) { next(err); }
}

export async function upsertPageController(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { slug } = req.params;
    if (!slug) throw new AppError(400, "MISSING_PARAM", "slug is required");
    SlugSchema.parse(slug);
    const body = UpsertSchema.parse(req.body);
    const page = await upsertPage(slug, body, userId(req));
    res.json({ success: true, data: page });
  } catch (err) { next(err); }
}

export async function createPageController(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const body   = UpsertSchema.extend({ slug: SlugSchema }).parse(req.body);
    const { slug, ...rest } = body;
    const page   = await upsertPage(slug, rest, userId(req));
    res.status(201).json({ success: true, data: page });
  } catch (err) { next(err); }
}

export async function publishPageController(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { slug } = req.params;
    if (!slug) throw new AppError(400, "MISSING_PARAM", "slug is required");
    const { is_published } = PublishSchema.parse(req.body);
    const page = await setPublished(slug, is_published, userId(req));
    res.json({ success: true, data: page });
  } catch (err) { next(err); }
}

export async function deletePageController(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { slug } = req.params;
    if (!slug) throw new AppError(400, "MISSING_PARAM", "slug is required");
    await deletePage(slug);
    res.status(204).end();
  } catch (err) { next(err); }
}

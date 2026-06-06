import type { Request, Response, NextFunction } from "express";
import { getPublishedPage } from "../services/cms.service";
import { AppError } from "../../../shared/errors/AppError";

export async function getPublishedPageController(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { slug } = req.params;
    if (!slug) throw new AppError(400, "MISSING_PARAM", "slug is required");
    const page = await getPublishedPage(slug);
    res.json({ success: true, data: page });
  } catch (err) { next(err); }
}

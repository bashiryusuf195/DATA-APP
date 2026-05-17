import type { Request, Response } from "express";
import { z } from "zod";
import { NotFoundError } from "../../../lib/errors";
import {
  listSettings,
  updateSettingByKey,
  getEnvironmentInfo,
} from "../services/settings.service";

const UpdateSettingBodySchema = z.object({
  value: z.string(),
});

export async function listSettingsController(_req: Request, res: Response): Promise<void> {
  const data = await listSettings();
  res.json({ success: true, data });
}

export async function updateSettingController(req: Request, res: Response): Promise<void> {
  const key = req.params.key;
  if (!key || typeof key !== "string") {
    res.status(400).json({ success: false, error: "Invalid setting key" });
    return;
  }

  const parsed = UpdateSettingBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  try {
    const updated = await updateSettingByKey(key, parsed.data.value, req.user!.id);
    res.json({ success: true, data: updated });
  } catch (err) {
    if (err instanceof NotFoundError) {
      res.status(404).json({ success: false, error: (err as Error).message });
      return;
    }
    if (err instanceof Error && err.message.includes("must be")) {
      res.status(400).json({ success: false, error: (err as Error).message });
      return;
    }
    throw err;
  }
}

export async function environmentInfoController(_req: Request, res: Response): Promise<void> {
  const data = await getEnvironmentInfo();
  res.json({ success: true, data });
}

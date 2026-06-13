import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { getDbInstance } from "../../../db/knex";

const db = getDbInstance();

export async function getSecuritySettingsController(
  req:  Request,
  res:  Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.id;
    const row = await db("users")
      .where({ id: userId })
      .select("biometric_purchase_enabled")
      .first<{ biometric_purchase_enabled: boolean } | undefined>();

    res.json({
      success: true,
      data: { biometric_purchase_enabled: row?.biometric_purchase_enabled ?? false },
    });
  } catch (err) {
    next(err);
  }
}

const UpdateSchema = z.object({
  biometric_purchase_enabled: z.boolean(),
});

export async function updateSecuritySettingsController(
  req:  Request,
  res:  Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.id;
    const body   = UpdateSchema.parse(req.body);

    await db("users")
      .where({ id: userId })
      .update({ biometric_purchase_enabled: body.biometric_purchase_enabled });

    res.json({
      success: true,
      data: { biometric_purchase_enabled: body.biometric_purchase_enabled },
    });
  } catch (err) {
    next(err);
  }
}

// src/modules/auth/controllers/biometric-device.controller.ts

import { z }                           from "zod";
import type { Request, Response, NextFunction } from "express";
import { getDbInstance }               from "../../../db/knex";
import { AppError }                    from "../../../shared/errors/AppError";
import {
  registerBiometricDevice,
  biometricLogin,
  listBiometricDevices,
  revokeBiometricDevice,
} from "../services/biometric-device.service";

// ── Validators ────────────────────────────────────────────────────────────────

const RegisterSchema = z.object({
  device_id:     z.string().uuid("device_id must be a UUID"),
  device_name:   z.string().min(1).max(100),
  platform:      z.enum(["android", "ios", "web"]),
  device_secret: z.string().min(32, "device_secret must be at least 32 characters"),
});

const LoginSchema = z.object({
  device_id:     z.string().uuid("device_id must be a UUID"),
  device_secret: z.string().min(32),
});

// ── POST /auth/biometric/register (protected) ─────────────────────────────────

export async function registerBiometricDeviceController(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    const input = RegisterSchema.parse(req.body);
    const db    = getDbInstance();

    const { id } = await registerBiometricDevice(db, {
      userId:       req.user.id,
      deviceId:     input.device_id,
      deviceName:   input.device_name,
      platform:     input.platform,
      deviceSecret: input.device_secret,
    });

    res.status(200).json({ success: true, data: { id } });
  } catch (err) {
    next(err);
  }
}

// ── POST /auth/biometric/login (public) ───────────────────────────────────────

export async function biometricLoginController(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const input = LoginSchema.parse(req.body);
    const db    = getDbInstance();

    const ip        = (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim()
                      ?? req.socket.remoteAddress ?? null;
    const userAgent = req.headers["user-agent"] ?? null;

    const result = await biometricLogin(db, {
      deviceId:     input.device_id,
      deviceSecret: input.device_secret,
      ipAddress:    ip,
      userAgent,
    });

    res.status(200).json({
      success: true,
      data: {
        user:       result.user,
        tokens:     result.tokens,
        session_id: result.session_id,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ── GET /auth/biometric/devices (protected) ───────────────────────────────────

export async function listBiometricDevicesController(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    const db      = getDbInstance();
    const devices = await listBiometricDevices(db, req.user.id);
    res.status(200).json({ success: true, data: devices });
  } catch (err) {
    next(err);
  }
}

// ── DELETE /auth/biometric/devices/:id (protected) ───────────────────────────

export async function revokeBiometricDeviceController(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    const { id } = req.params;
    if (!id) throw new AppError(400, "VALIDATION_ERROR", "Device id is required");
    const db = getDbInstance();
    await revokeBiometricDevice(db, req.user.id, id);
    res.status(200).json({ success: true, data: { message: "Biometric device revoked" } });
  } catch (err) {
    next(err);
  }
}

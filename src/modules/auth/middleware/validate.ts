// src/modules/auth/middleware/validate.ts
// Zod validation middleware factory.

import type { Request, Response, NextFunction } from "express";
import type { ZodSchema } from "zod";
import { AppError } from "../../../shared/errors/AppError";

/** Middleware factory: validates req.body against schema, replaces with parsed value. */
export function validate<T>(schema: ZodSchema<T>) {
  return function validationMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        field:   i.path.join("."),
        message: i.message,
        code:    i.code,
      }));
      res.status(422).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Validation failed", details },
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

/** Inline validation helper for use inside controllers (throws AppError). */
export function validateOrThrow<T>(schema: ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError(
      422,
      "VALIDATION_ERROR",
      "Request validation failed",
      result.error.flatten().fieldErrors
    );
  }
  return result.data;
}

/** Validate req.query against a schema. Stores parsed result in req.parsedQuery. */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return function queryValidationMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        field:   i.path.join("."),
        message: i.message,
      }));
      res.status(422).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Query validation failed", details },
      });
      return;
    }
    (req as Request & { parsedQuery: T }).parsedQuery = result.data;
    next();
  };
}

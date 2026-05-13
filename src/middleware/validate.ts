// src/middleware/validate.ts
//
// Factory that turns a Zod schema into Express middleware.
// Validates and coerces req.body (or req.query / req.params) before the
// request reaches the controller. On failure, passes a ValidationError to
// the error handler — so controllers receive clean, typed data or nothing.
//
// Usage:
//   import { z }        from 'zod';
//   import { validate } from '../middleware/validate';
//
//   const CreateTxSchema = z.object({
//     serviceId:   z.string().uuid(),
//     beneficiary: z.string().min(6),
//     amount:      z.number().positive(),
//   });
//
//   router.post('/transactions',
//     authenticate,
//     validate(CreateTxSchema),        // validates req.body
//     transactionController.create,
//   );

import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError }             from 'zod';
import { ValidationError }                 from '../lib/errors';

type Target = 'body' | 'query' | 'params';

export function validate(schema: ZodSchema, target: Target = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);

    if (!result.success) {
      const issues = flattenZodErrors(result.error);
      return next(new ValidationError('Request validation failed.', { issues }));
    }

    // Replace with the parsed (and coerced) value
    // e.g. "42" → 42 if the schema says z.coerce.number()
    (req as unknown as Record<string, unknown>)[target] = result.data;
    next();
  };
}

// Turn Zod's nested error structure into { fieldName: 'error message' }
function flattenZodErrors(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const path  = issue.path.join('.') || 'root';
    out[path]   = issue.message;
  }
  return out;
}

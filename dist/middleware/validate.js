"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = validate;
const errors_1 = require("../lib/errors");
function validate(schema, target = 'body') {
    return (req, _res, next) => {
        const result = schema.safeParse(req[target]);
        if (!result.success) {
            const issues = flattenZodErrors(result.error);
            return next(new errors_1.ValidationError('Request validation failed.', { issues }));
        }
        // Replace with the parsed (and coerced) value
        // e.g. "42" → 42 if the schema says z.coerce.number()
        req[target] = result.data;
        next();
    };
}
// Turn Zod's nested error structure into { fieldName: 'error message' }
function flattenZodErrors(error) {
    const out = {};
    for (const issue of error.issues) {
        const path = issue.path.join('.') || 'root';
        out[path] = issue.message;
    }
    return out;
}
//# sourceMappingURL=validate.js.map
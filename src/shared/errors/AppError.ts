/**
 * Re-uses the canonical AppError from src/lib/errors.ts so that
 * `instanceof AppError` checks in the global error handler
 * (which imports from lib/errors) recognise errors thrown by
 * src/modules/auth and other module-level code.
 *
 * Constructor argument order is (statusCode, code, message, details?)
 * to match the existing module-level call-sites.
 */
import { AppError as LibAppError } from '../../lib/errors'

export class AppError extends LibAppError {
  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(
      message,
      code,
      statusCode,
      typeof details === 'object' && details !== null && !Array.isArray(details)
        ? (details as Record<string, unknown>)
        : undefined,
    )
    // Maintain correct prototype chain when targeting ES5 in transpiled output.
    Object.setPrototypeOf(this, AppError.prototype)
  }
}

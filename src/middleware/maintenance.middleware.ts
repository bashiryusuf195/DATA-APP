import type { Request, Response, NextFunction } from 'express';
import { getDbInstance } from '../db/knex';
import { logger } from '../lib/logger';

// ── In-process cache ──────────────────────────────────────────────────────────
// Maintenance state is re-read from the DB at most every 10 seconds so that
// toggling in the admin dashboard propagates quickly without hammering the DB
// on every request.

let _cached: boolean | null = null;
let _cacheUntil             = 0;
let _bootstrapped           = false;
const CACHE_TTL_MS          = 10_000;

export function invalidateMaintenanceCache(): void {
  _cached     = null;
  _cacheUntil = 0;
}

async function isMaintenanceActive(): Promise<boolean> {
  const now = Date.now();
  if (_cached !== null && now < _cacheUntil) return _cached;

  try {
    const db = getDbInstance();

    if (!_bootstrapped) {
      await db('admin_settings')
        .insert({
          key:         'maintenance_mode',
          value:       'false',
          value_type:  'boolean',
          label:       'Maintenance Mode',
          description: 'When enabled, all customer API requests return 503. Admin routes, webhooks, and public endpoints remain accessible.',
          category:    'maintenance',
          is_secret:   false,
          updated_by:  null,
          updated_at:  db.fn.now(),
        })
        .onConflict('key')
        .ignore();
      _bootstrapped = true;
    }

    const row = await db('admin_settings').where({ key: 'maintenance_mode' }).first<{ value: string } | undefined>();
    _cached = row?.value === 'true';
  } catch (err) {
    logger.warn('maintenance_check_failed', { error: (err as Error).message });
    _cached = false;
  }

  _cacheUntil = Date.now() + CACHE_TTL_MS;
  return _cached ?? false;
}

// Paths that always bypass maintenance mode.
// /admin and /api/v1/admin → admin dashboard API
// /webhooks               → payment gateway callbacks (must keep running)
// /public                 → public endpoints including /public/status
// /auth                   → token refresh runs in the background; let it through
const BYPASS_PREFIXES = ['/admin', '/api/v1/admin', '/webhooks', '/public', '/auth'];

export async function maintenanceMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const isBypassed = BYPASS_PREFIXES.some((p) => req.path.startsWith(p));
  if (isBypassed) { next(); return; }

  try {
    const active = await isMaintenanceActive();
    if (!active) { next(); return; }

    logger.info('maintenance_mode_blocked', { path: req.path, method: req.method });
    res.status(503).json({
      success:     false,
      maintenance: true,
      error:       "System temporarily unavailable. We're performing maintenance.",
    });
  } catch {
    // Never block requests due to a maintenance-check error.
    next();
  }
}

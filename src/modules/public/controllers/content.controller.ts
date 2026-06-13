import { Request, Response, NextFunction } from 'express'
import { getDbInstance } from '../../../db/knex'
import { invalidateMaintenanceCache } from '../../../middleware/maintenance.middleware'

const DEFAULT_FUNDING_CARDS = [
  { type: 'quick_transfer',    enabled: true },
  { type: 'dedicated_account', enabled: true },
]

export async function getFundingConfigController(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const row = await getDbInstance()('admin_settings')
      .where({ key: 'dashboard_funding_cards' })
      .first()

    let cards = DEFAULT_FUNDING_CARDS
    if (row?.value) {
      try {
        const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value
        if (Array.isArray(parsed)) cards = parsed
      } catch { /* use default */ }
    }

    res.json({ cards })
  } catch (err) {
    next(err)
  }
}

export async function getSupportConfigController(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const db   = getDbInstance()
    const rows = await db('admin_settings')
      .whereIn('key', ['support_widget_enabled', 'support_whatsapp_url', 'support_ticket_url'])
      .select('key', 'value')

    const map: Record<string, string> = {}
    for (const r of rows) map[r.key] = r.value ?? ''

    res.json({
      enabled:      (map['support_widget_enabled'] ?? 'true') === 'true',
      whatsapp_url: map['support_whatsapp_url']  ?? '',
      ticket_url:   map['support_ticket_url']    ?? '',
    })
  } catch (err) {
    next(err)
  }
}

export async function getAppContentController(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const row = await getDbInstance()('admin_settings').where({ key: 'app_content' }).first()
    if (!row) {
      res.json({ landing: null, onboarding: [] })
      return
    }
    const content = typeof row.value === 'string' ? JSON.parse(row.value) : row.value
    res.json(content)
  } catch (err) {
    next(err)
  }
}

// ── GET /public/status ────────────────────────────────────────────────────────
// Public endpoint — no auth required. Returns maintenance state so the customer
// app can show the maintenance screen before making any authenticated request.

export async function getSystemStatusController(
  _req: Request,
  res:  Response,
): Promise<void> {
  try {
    const row = await getDbInstance()('admin_settings')
      .where({ key: 'maintenance_mode' })
      .first<{ value: string } | undefined>()
    // Ensure the in-process cache stays consistent with the DB value
    // (this endpoint bypasses the middleware, so refresh it here too)
    invalidateMaintenanceCache()
    res.json({ maintenance: row?.value === 'true' })
  } catch {
    // On any DB error, report not in maintenance so the app stays usable
    res.json({ maintenance: false })
  }
}

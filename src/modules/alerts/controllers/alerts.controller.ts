import type { Request, Response } from 'express';
import { getDbInstance } from '../../../db/knex';

const db = getDbInstance();

// ── List ──────────────────────────────────────────────────────────────────────

export async function listAlertsController(req: Request, res: Response): Promise<void> {
  const { severity, category, unread, limit = '50', page = '1' } = req.query as Record<string, string>;

  const pageNum  = Math.max(1, parseInt(page, 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10)));
  const offset   = (pageNum - 1) * pageSize;

  let query = db('admin_alerts').orderBy('created_at', 'desc');

  if (severity)        query = query.where({ severity });
  if (category)        query = query.where({ category });
  if (unread === 'true') query = query.where({ is_read: false });

  const [rows, [{ count }]] = await Promise.all([
    query.clone().limit(pageSize).offset(offset),
    query.clone().count('id as count'),
  ]);

  res.json({
    success: true,
    data:    rows,
    total:   parseInt(String(count), 10),
    page:    pageNum,
    limit:   pageSize,
  });
}

// ── Unread count (for the sidebar badge) ─────────────────────────────────────

export async function alertsCountController(_req: Request, res: Response): Promise<void> {
  const [{ count }] = await db('admin_alerts').where({ is_read: false }).count('id as count');
  res.json({ success: true, data: { unread: parseInt(String(count), 10) } });
}

// ── Mark read ─────────────────────────────────────────────────────────────────

export async function markAlertReadController(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const updated = await db('admin_alerts')
    .where({ id })
    .update({ is_read: true, updated_at: new Date() });

  if (!updated) {
    res.status(404).json({ success: false, error: 'Alert not found' });
    return;
  }
  res.json({ success: true });
}

// ── Mark all read ─────────────────────────────────────────────────────────────

export async function markAllAlertsReadController(_req: Request, res: Response): Promise<void> {
  await db('admin_alerts').where({ is_read: false }).update({ is_read: true, updated_at: new Date() });
  res.json({ success: true });
}

// ── Resolve ───────────────────────────────────────────────────────────────────

export async function resolveAlertController(req: Request, res: Response): Promise<void> {
  const { id }       = req.params;
  const resolvedBy   = req.user?.email ?? 'admin';
  const updated      = await db('admin_alerts')
    .where({ id })
    .update({ is_resolved: true, resolved_at: new Date(), resolved_by: resolvedBy, updated_at: new Date() });

  if (!updated) {
    res.status(404).json({ success: false, error: 'Alert not found' });
    return;
  }
  res.json({ success: true });
}

// ── Delete ────────────────────────────────────────────────────────────────────

export async function deleteAlertController(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const deleted = await db('admin_alerts').where({ id }).delete();

  if (!deleted) {
    res.status(404).json({ success: false, error: 'Alert not found' });
    return;
  }
  res.json({ success: true });
}

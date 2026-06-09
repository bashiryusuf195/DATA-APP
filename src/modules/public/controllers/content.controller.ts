import { Request, Response, NextFunction } from 'express'
import { getDbInstance } from '../../../db/knex'

export async function getFundingConfigController(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const row = await getDbInstance()('admin_settings')
      .where({ key: 'dashboard_funding_priority' })
      .first()
    const priority = (row?.value as string | undefined) ?? 'quick_first'
    res.json({ priority })
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

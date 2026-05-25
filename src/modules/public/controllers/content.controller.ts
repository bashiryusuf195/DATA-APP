import { Request, Response, NextFunction } from 'express'
import { getDbInstance } from '../../../db/knex'

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

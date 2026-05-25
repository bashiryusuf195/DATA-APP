import { Router } from 'express'
import { getAppContentController } from '../controllers/content.controller'

const router = Router()

router.get('/content', getAppContentController)

export { router as publicRouter }

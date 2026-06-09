import { Router } from 'express'
import { getAppContentController, getFundingConfigController } from '../controllers/content.controller'

const router = Router()

router.get('/content',        getAppContentController)
router.get('/funding-config', getFundingConfigController)

export { router as publicRouter }

import { Router } from 'express'
import {
  getAppContentController,
  getFundingConfigController,
  getSupportConfigController,
  getSystemStatusController,
} from '../controllers/content.controller'

const router = Router()

router.get('/status',         getSystemStatusController)
router.get('/content',        getAppContentController)
router.get('/funding-config', getFundingConfigController)
router.get('/support-config', getSupportConfigController)

export { router as publicRouter }

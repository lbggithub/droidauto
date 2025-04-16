import { Router, Request, Response } from 'express'
import { getFormattedUIElements } from '../services/uiService'
import logger from '../utils/logger'

const router = Router()

/**
 * 获取格式化的UI元素
 * GET /api/ui/formatted
 */
router.get('/formatted', async (req: Request, res: Response) => {
  try {
    const formattedData = await getFormattedUIElements()
    res.json({
      success: true,
      ...formattedData,
    })
  } catch (error) {
    logger.error('获取格式化UI元素失败:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
})

export default router

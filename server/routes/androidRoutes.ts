import express, { Request, Response } from 'express'
import * as androidConnection from '../services/androidConnection'
import { extractUIElements } from '../services/uiExtractor'
import logger from '../utils/logger'

const router = express.Router()

/**
 * 获取设备连接状态
 * GET /api/android/status
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const device = await androidConnection.checkConnectedDevices()
    res.json({ success: true, device })
  } catch (error) {
    logger.error('获取设备状态失败:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
})

/**
 * 获取当前屏幕截图
 * GET /api/android/screenshot
 */
router.get('/screenshot', async (req: Request, res: Response) => {
  try {
    const screenshot = await androidConnection.getScreenshot()
    res.json({
      success: true,
      screenshot: {
        base64: screenshot.base64,
        timestamp: screenshot.timestamp,
      },
    })
  } catch (error) {
    logger.error('获取截图失败:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
})

/**
 * 获取UI层次结构
 * GET /api/android/ui
 */
router.get('/ui', async (req: Request, res: Response) => {
  try {
    const uiElements = await extractUIElements()
    res.json({ success: true, uiElements })
  } catch (error) {
    logger.error('获取UI层次结构失败:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
})

/**
 * 执行触摸操作
 * POST /api/android/tap
 * @body {number} x - X坐标
 * @body {number} y - Y坐标
 */
router.post('/tap', async (req: Request, res: Response) => {
  try {
    const { x, y } = req.body

    if (typeof x !== 'number' || typeof y !== 'number') {
      return res.status(400).json({ success: false, error: '无效的坐标参数' })
    }

    const result = await androidConnection.tap(x, y)
    res.json({ success: true, result })
  } catch (error) {
    logger.error('执行点击操作失败:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
})

/**
 * 执行滑动操作
 * POST /api/android/swipe
 * @body {number} startX - 起始X坐标
 * @body {number} startY - 起始Y坐标
 * @body {number} endX - 结束X坐标
 * @body {number} endY - 结束Y坐标
 * @body {number} [duration] - 滑动持续时间（毫秒）
 */
router.post('/swipe', async (req: Request, res: Response) => {
  try {
    const { startX, startY, endX, endY, duration } = req.body

    if (typeof startX !== 'number' || typeof startY !== 'number' || typeof endX !== 'number' || typeof endY !== 'number') {
      return res.status(400).json({ success: false, error: '无效的滑动参数' })
    }

    const result = await androidConnection.swipe(startX, startY, endX, endY, duration)
    res.json({ success: true, result })
  } catch (error) {
    logger.error('执行滑动操作失败:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
})

/**
 * 执行输入文本操作
 * POST /api/android/text
 * @body {string} text - 要输入的文本
 */
router.post('/text', async (req: Request, res: Response) => {
  try {
    const { text } = req.body

    if (typeof text !== 'string' || text.trim() === '') {
      return res.status(400).json({ success: false, error: '无效的文本参数' })
    }

    const result = await androidConnection.inputText(text)
    res.json({ success: true, result })
  } catch (error) {
    logger.error('执行文本输入失败:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
})

/**
 * 执行按键操作
 * POST /api/android/key
 * @body {number|string} keycode - 要按下的按键码
 */
router.post('/key', async (req: Request, res: Response) => {
  try {
    const { keycode } = req.body

    if (typeof keycode !== 'number' && typeof keycode !== 'string') {
      return res.status(400).json({ success: false, error: '无效的按键参数' })
    }

    const result = await androidConnection.pressKey(keycode)
    res.json({ success: true, result })
  } catch (error) {
    logger.error('执行按键操作失败:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
})

export default router

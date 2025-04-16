import express, { Request, Response } from 'express'
import { handleAIInstruction } from '../services/aiService'
import { getScreenshot } from '../services/androidConnection'
import { extractUIElements } from '../services/uiExtractor'
import logger from '../utils/logger'

const router = express.Router()

/**
 * 会话上下文接口
 */
interface SessionContext {
  id?: string
  history?: Array<{
    instruction: string
    timestamp: number
    parsedResponse?: {
      thinking?: string
      commands?: any[]
    }
  }>
  [key: string]: any
}

// 会话存储
const sessions = new Map<string, SessionContext>()

/**
 * 处理AI指令
 * POST /api/ai/instruction
 * @body {string} instruction - 用户指令
 * @body {string} [sessionId] - 会话ID（可选）
 */
router.post('/instruction', async (req: Request, res: Response) => {
  try {
    const { instruction, sessionId } = req.body

    if (!instruction) {
      return res.status(400).json({ success: false, error: '指令不能为空' })
    }

    // 获取或创建会话
    let sessionContext: SessionContext = {}
    if (sessionId && sessions.has(sessionId)) {
      sessionContext = sessions.get(sessionId) || {}
    } else {
      const newSessionId = Date.now().toString()
      sessions.set(newSessionId, sessionContext)
      sessionContext.id = newSessionId
    }

    // 获取当前屏幕截图
    const screenshot = await getScreenshot()

    // 提取UI元素
    const uiElements = await extractUIElements()

    // 调用AI处理指令
    const response = await handleAIInstruction({
      instruction,
      screenshot,
      uiElements: {
        elements: uiElements.elements,
        timestamp: typeof uiElements.timestamp === 'string' ? Number(uiElements.timestamp) : uiElements.timestamp,
      },
      sessionContext: sessionContext as any,
    })

    // 保存会话上下文
    if (sessionContext.id) {
      sessions.set(sessionContext.id, sessionContext)
    }

    res.json({
      success: true,
      sessionId: sessionContext.id,
      response,
    })
  } catch (error) {
    logger.error('处理AI指令失败:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
})

/**
 * 获取会话历史
 * GET /api/ai/session/:sessionId
 * @param {string} sessionId - 会话ID
 */
router.get('/session/:sessionId', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params

    if (!sessionId || !sessions.has(sessionId)) {
      return res.status(404).json({ success: false, error: '会话不存在' })
    }

    const sessionContext = sessions.get(sessionId)

    // 返回会话历史，但不包含大型数据如截图
    const history = sessionContext?.history
      ? sessionContext.history.map((item) => ({
          instruction: item.instruction,
          timestamp: item.timestamp,
          thinking: item.parsedResponse ? item.parsedResponse.thinking : null,
          commands: item.parsedResponse ? item.parsedResponse.commands : [],
        }))
      : []

    res.json({
      success: true,
      sessionId,
      history,
    })
  } catch (error) {
    logger.error('获取会话历史失败:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
})

/**
 * 清除会话历史
 * DELETE /api/ai/session/:sessionId
 * @param {string} sessionId - 会话ID
 */
router.delete('/session/:sessionId', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params

    if (sessionId && sessions.has(sessionId)) {
      sessions.delete(sessionId)
    }

    res.json({ success: true })
  } catch (error) {
    logger.error('清除会话历史失败:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
})

export default router

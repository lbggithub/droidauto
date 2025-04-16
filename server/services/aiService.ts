import axios, { AxiosError } from 'axios'
import logger from '../utils/logger'
import { Command, CommandType } from './commandExecutor'

// 最大上下文存储数量
const MAX_CONTEXT_ITEMS = 5

/**
 * 会话历史项接口
 */
export interface SessionHistoryItem {
  instruction: string
  screenshot?: { timestamp: number }
  uiElements?: { timestamp: number }
  parsedResponse: AIResponse | SimpleAIResponse
}

/**
 * 简化的AI响应接口，用于历史记录
 */
interface SimpleAIResponse {
  thinking: string
  commands: SimpleCommand[]
  result?: string
  isTaskComplete?: boolean
}

/**
 * 简化的命令接口，用于历史记录
 */
interface SimpleCommand {
  type: string
  isTaskComplete?: boolean
}

/**
 * 会话上下文接口
 */
export interface SessionContext {
  history?: SessionHistoryItem[]
  lastOperation?: {
    instruction: string
    timestamp: string
  }
}

/**
 * AI响应接口
 */
export interface AIResponse {
  thinking: string
  commands: Command[]
  rawResponse?: string
  error?: string
  result?: string
  isTaskComplete?: boolean
}

/**
 * 错误信息接口
 */
export interface ErrorInfo {
  command: Command
  message: string
}

/**
 * 处理选项接口
 */
export interface HandleInstructionOptions {
  instruction?: string
  screenshot?: {
    base64: string
    path: string
    timestamp: number
  }
  uiElements?: {
    elements: any
    timestamp: number
  }
  sessionContext?: SessionContext
  isErrorCorrection?: boolean
  error?: ErrorInfo | null
  isContinuation?: boolean
  previousCommand?: Command
}

/**
 * 提示内容接口
 */
export interface PromptContent {
  systemPrompt: string
  contextPrompt?: string
  errorContextPrompt?: string
  recentHistoryPrompt?: string
  currentStatePrompt: string
}

/**
 * OpenAI消息接口
 */
interface OpenAIMessage {
  role: string
  content: string | { type: string; text?: string; image_url?: { url: string } }[]
}

// 系统提示基础模板 - 所有提示共享的基础内容
const BASE_SYSTEM_PROMPT = `你是DroidAuto安卓自动化助手，可以控制Android设备执行各种任务。
请遵循以下规则：
1. 分析当前屏幕截图和UI元素，理解用户当前所在的界面和可执行的操作
2. 所有文本必须使用中文回复
3. 回复必须包含thinking、commands和isTaskComplete字段
4. 严格按照示例格式返回命令，不要使用替代参数名称

可用的命令类型如下，必须使用"type"字段指定类型：
- tap: 点击屏幕坐标，必须包含x和y参数
  例如: {"type": "tap", "x": 160, "y": 200, "isTaskComplete": false}
- swipe: 滑动屏幕，必须包含startX, startY, endX, endY参数，可选duration参数
  例如: {"type": "swipe", "startX": 160, "startY": 800, "endX": 160, "endY": 200, "duration": 300, "isTaskComplete": false}
  注意: 不要使用coordinate或coordinate2参数，必须使用startX, startY, endX, endY
- text: 输入文本，必须包含text参数
  例如: {"type": "text", "text": "要输入的文字", "isTaskComplete": false}
- key: 按下按键，必须包含keycode参数
  例如: {"type": "key", "keycode": 4, "isTaskComplete": false}
- wait: 等待一段时间，必须包含duration参数(毫秒)
  例如: {"type": "wait", "duration": 1000, "isTaskComplete": false}
- back: 返回键
  例如: {"type": "back", "isTaskComplete": false}
- home: 主页键
  例如: {"type": "home", "isTaskComplete": false}
- app_switch: 最近任务键
  例如: {"type": "app_switch", "isTaskComplete": false}
- composite: 复合命令，必须包含commands数组
  例如: {"type": "composite", "commands": [{"type": "tap", "x": 160, "y": 200}, {"type": "wait", "duration": 1000}], "isTaskComplete": false}

点击屏幕的正确格式为：
{"type": "tap", "x": 160, "y": 200, "isTaskComplete": false, "isFinalCommand": true}
注意: 不要使用coordinate:[160, 200]参数，必须使用x和y

滑动屏幕的正确格式为：
{"type": "swipe", "startX": 160, "startY": 800, "endX": 160, "endY": 200, "duration": 300, "isTaskComplete": false}
注意: 不要使用coordinate或coordinate2参数，必须使用startX, startY, endX, endY

每个命令都应该包含以下字段：
- isTaskComplete: 布尔值，指示此命令执行后任务是否完成
- isFinalCommand: 布尔值，指示此命令是否为当前步骤的最后一个命令(可选，默认最后一个命令)`

/**
 * 处理AI指令
 * @param {HandleInstructionOptions} options - 处理选项
 * @returns {Promise<AIResponse>} AI处理结果
 */
async function handleAIInstruction(options: HandleInstructionOptions): Promise<AIResponse> {
  const {
    instruction = '',
    screenshot,
    uiElements,
    sessionContext = {},
    isErrorCorrection = false,
    error = null,
    isContinuation = false,
    previousCommand = null,
  } = options

  try {
    // 根据情况构建不同类型的提示
    const prompt =
      isErrorCorrection && error
        ? buildErrorCorrectionPrompt(error, screenshot, uiElements, sessionContext)
        : isContinuation && previousCommand
        ? buildContinuationPrompt(instruction, previousCommand, screenshot, uiElements, sessionContext)
        : buildInstructionPrompt(instruction, screenshot, uiElements, sessionContext)

    // 调用大语言模型API
    const response = await callLLMAPI(prompt, screenshot)

    // 解析模型响应
    const parsedResponse = parseModelResponse(response)

    // 添加响应到会话上下文，只存储轻量级历史数据
    updateSessionContext(sessionContext, {
      instruction: instruction || '自动纠错',
      screenshot: screenshot ? { timestamp: screenshot.timestamp } : undefined, // 只保存时间戳
      uiElements: uiElements ? { timestamp: uiElements.timestamp } : undefined, // 只保存时间戳
      parsedResponse,
    })

    return parsedResponse
  } catch (error) {
    logger.error('处理AI指令失败:', error)
    throw error
  }
}

/**
 * 构建指令处理提示
 */
function buildInstructionPrompt(instruction: string, screenshot: any, uiElements: any, sessionContext: SessionContext): PromptContent {
  // 基础系统提示扩展
  const systemPrompt = `${BASE_SYSTEM_PROMPT}

根据用户指令，制定完整的操作计划，分步骤执行。
对于多步骤任务，所有中间步骤的命令和整体响应都必须将isTaskComplete设为false。
如果命令只是一个中间步骤（如点击导航到其他页面），确保将该命令的isTaskComplete设为false。
只有当已经获取到任务要求的完整结果数据时，才将isTaskComplete设为true。
当任务完成时，必须提供明确的result结果数据。

完整的响应格式示例：
{
  "thinking": "我对当前屏幕的分析...",
  "commands": [
    {"type": "tap", "x": 160, "y": 200, "isTaskComplete": false}
  ],
  "isTaskComplete": false
}

当任务完成时，应提供result字段并将isTaskComplete设为true：
{
  "thinking": "任务已完成...",
  "commands": [],
  "result": "14天后的天气是晴天，温度26度",
  "isTaskComplete": true
}

当UI元素无法分析或识别时，可尝试基于视觉识别的方法：
1. 分析屏幕截图，查找视觉元素如按钮、文本框、图表等
2. 识别和提取屏幕上的文本内容，特别是日期、数字和关键信息
3. 估计元素在屏幕上的位置和尺寸
4. 使用tap命令点击估计的坐标位置`

  // 历史上下文提示
  let contextPrompt = ''
  if (sessionContext.history && sessionContext.history.length > 0) {
    contextPrompt = '历史操作记录(简要):\n'
    // 只取最近的3个历史记录
    const recentHistory = sessionContext.history.slice(-3)
    recentHistory.forEach((item, index) => {
      contextPrompt += `操作${index + 1}: ${item.instruction}\n`
      if (item.parsedResponse && item.parsedResponse.thinking) {
        // 仅使用分析的前1000个字符
        contextPrompt += `分析: ${item.parsedResponse.thinking.substring(0, 1000)}...\n`
      }

      // 添加命令类型简要描述
      if (item.parsedResponse && item.parsedResponse.commands && item.parsedResponse.commands.length > 0) {
        const cmdTypes = item.parsedResponse.commands.map((cmd) => cmd.type).join(', ')
        contextPrompt += `执行: ${cmdTypes}\n`
      }
    })
  }

  // 当前状态提示
  const currentStatePrompt = `当前屏幕UI元素:${uiElements}

用户指令: ${instruction}`

  return {
    systemPrompt,
    contextPrompt,
    currentStatePrompt,
  }
}

/**
 * 构建错误纠正提示
 */
function buildErrorCorrectionPrompt(error: ErrorInfo, screenshot: any, uiElements: any, sessionContext: SessionContext): PromptContent {
  // 错误纠正系统提示
  const systemPrompt = `${BASE_SYSTEM_PROMPT}

你现在是纠错助手，负责修复操作执行过程中的错误。
请遵循以下规则：
1. 分析执行失败的命令和错误信息
2. 检查当前屏幕状态和UI元素
3. 确定失败原因，可能是：
   - 坐标不准确
   - 元素不存在或已变化
   - 需要先执行其他操作
   - 设备响应超时
4. 提供修正后的命令或替代方案

完整的响应格式示例：
{
  "thinking": "我对错误的分析...",
  "commands": [
    {"type": "tap", "x": 160, "y": 200},
    {"type": "wait", "duration": 1000}
  ],
  "isTaskComplete": false
}

当UI分析无法解决问题时，切换到视觉识别模式:
1. 分析屏幕截图，查找关键视觉元素
2. 估计新元素位置
3. 制定新的操作计划`

  // 错误上下文提示
  const errorContextPrompt = error ? `执行失败的命令: ${JSON.stringify(error.command)}\n错误信息: ${error.message}` : ''

  // 最近操作历史提示
  let recentHistoryPrompt = ''
  if (sessionContext.history && sessionContext.history.length > 0) {
    // 只取最近的1个历史记录
    const recentHistory = sessionContext.history.slice(-1)
    recentHistoryPrompt = '最近操作记录:\n'
    recentHistory.forEach((item, index) => {
      recentHistoryPrompt += `操作: ${item.instruction}\n`

      // 添加命令类型简要描述
      if (item.parsedResponse && item.parsedResponse.commands && item.parsedResponse.commands.length > 0) {
        const cmdTypes = item.parsedResponse.commands.map((cmd) => cmd.type).join(', ')
        recentHistoryPrompt += `执行: ${cmdTypes}\n`
      }
    })
  }

  // 当前状态提示
  const currentStatePrompt = `当前屏幕UI元素:${uiElements}`

  return {
    systemPrompt,
    errorContextPrompt,
    recentHistoryPrompt,
    currentStatePrompt,
  }
}

/**
 * 构建持续处理提示
 */
function buildContinuationPrompt(
  instruction: string,
  previousCommand: Command,
  screenshot: any,
  uiElements: any,
  sessionContext: SessionContext
): PromptContent {
  // 持续处理系统提示
  const systemPrompt = `${BASE_SYSTEM_PROMPT}

你正在执行一个持续的工作流。上一个命令已经执行完成，现在需要分析新的屏幕状态，并决定下一步操作。

用户的原始指令是: "${instruction}"

请遵循以下规则：
1. 判断任务是否已完成，特别注意区分"导航到相关页面"和"完成整个任务目标"的区别
2. 对于多步骤任务（如"总结14天后的天气"），仅点击导航按钮还不算完成任务
3. 只有当已经获取到用户要求的数据（如具体天气信息）时，才算任务完成
4. 如果任务已完成，提供详细的结果数据并将isTaskComplete设为true
5. 如果任务未完成，提供下一步命令并将isTaskComplete设为false

完整的响应格式示例：
{
  "thinking": "我对当前屏幕的分析...",
  "commands": [
    {"type": "tap", "x": 160, "y": 200, "isTaskComplete": false, "isFinalCommand": true}
  ],
  "isTaskComplete": false
}

或当任务完成时：
{
  "thinking": "任务已完成的分析...",
  "commands": [],
  "result": "这是任务的最终结果，例如14天后的天气数据是晴天，温度26度",
  "isTaskComplete": true
}`

  // 上一步操作信息 - 简化命令表示
  const simplePrevCmd = {
    type: previousCommand.type,
    isTaskComplete: previousCommand.isTaskComplete,
  }
  const previousActionPrompt = `上一步执行的命令类型: ${simplePrevCmd.type}\n任务状态: ${
    simplePrevCmd.isTaskComplete ? '已完成' : '进行中'
  }`

  // 当前状态提示
  const currentStatePrompt = `当前屏幕状态:${uiElements}

用户原始指令: ${instruction}`

  return {
    systemPrompt,
    contextPrompt: previousActionPrompt,
    currentStatePrompt,
  }
}

/**
 * 调用大语言模型API
 */
async function callLLMAPI(prompt: PromptContent, screenshot: any = null): Promise<any> {
  try {
    const messages: OpenAIMessage[] = [{ role: 'system', content: prompt.systemPrompt }]

    // 添加各种上下文提示
    if (prompt.contextPrompt) {
      messages.push({ role: 'system', content: prompt.contextPrompt })
    }

    if (prompt.errorContextPrompt) {
      messages.push({ role: 'system', content: prompt.errorContextPrompt })
    }

    if (prompt.recentHistoryPrompt) {
      messages.push({ role: 'system', content: prompt.recentHistoryPrompt })
    }

    // 添加当前状态
    const userContent = prompt.currentStatePrompt
    let userMessage: OpenAIMessage = { role: 'user', content: userContent }

    // 如果有截图，则添加到消息中
    if (screenshot && screenshot.base64) {
      userMessage.content = [
        { type: 'text', text: userContent },
        {
          type: 'image_url',
          image_url: {
            url: `data:image/png;base64,${screenshot.base64}`,
          },
        },
      ]
    }

    messages.push(userMessage)

    // 获取API配置
    const apiKey = process.env.LLM_API_KEY || ''
    const modelName = process.env.LLM_MODEL || ''
    const endpoint = process.env.LLM_ENDPOINT || ''

    if (!apiKey || !modelName || !endpoint) {
      throw new Error('API配置错误')
    }

    // 优化日志记录，避免记录大量数据
    logger.info(`调用LLM API: ${endpoint}, 模型: ${modelName}`)

    // 只记录消息数量和类型，不记录完整内容
    const messagesInfo = messages.map((msg) => {
      const content = typeof msg.content === 'string' ? `文本(长度:${msg.content.length})` : `多模态(项目:${msg.content.length})`
      return { role: msg.role, contentType: content }
    })

    logger.info(`请求消息概况: ${JSON.stringify(messagesInfo)}`)

    // if (screenshot && screenshot.base64) {
    //   const imageSize = Math.round((screenshot.base64.length * 3) / 4)
    //   logger.info(`请求包含图片数据 (约 ${imageSize / 1024} KB)`)
    // }

    const requestBody = {
      model: modelName,
      messages,
      temperature: 0.6,
      max_tokens: 4096,
      top_p: 0.7,
      n: 1,
    }

    const response = await axios.post(endpoint, requestBody, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
    })

    logger.info(`LLM API响应: ${JSON.stringify(response.data)}`)

    return response.data
  } catch (error) {
    logApiError(error as AxiosError)
    throw error
  }
}

/**
 * 记录API错误
 */
function logApiError(error: AxiosError): void {
  if (error.response) {
    logger.error(`调用LLM API失败: 状态码 ${error.response.status}`)
    logger.error(`错误详情: ${JSON.stringify(error.response.data)}`)
  } else if (error.request) {
    logger.error(`调用LLM API失败: 未收到响应`)
  } else {
    logger.error(`调用LLM API失败: ${error.message}`)
  }
}

/**
 * 处理命令转换
 */
function normalizeCommand(cmd: any): Command {
  const normalizedCmd = { ...cmd }

  // 如果使用了action而不是type
  if (normalizedCmd.action && !normalizedCmd.type) {
    normalizedCmd.type = normalizedCmd.action
    delete normalizedCmd.action
  }

  // 处理点击命令格式
  if (
    normalizedCmd.type === 'click' ||
    (normalizedCmd.type === 'tap' && Array.isArray(normalizedCmd.coordinate) && normalizedCmd.coordinate.length === 2)
  ) {
    normalizedCmd.type = 'tap'
    if (Array.isArray(normalizedCmd.coordinate) && normalizedCmd.coordinate.length === 2) {
      normalizedCmd.x = normalizedCmd.coordinate[0]
      normalizedCmd.y = normalizedCmd.coordinate[1]
      delete normalizedCmd.coordinate
    }
  }

  // 处理滑动命令格式
  if (normalizedCmd.type === 'swipe') {
    // coordinate和coordinate2格式
    if (Array.isArray(normalizedCmd.coordinate) && Array.isArray(normalizedCmd.coordinate2)) {
      normalizedCmd.startX = normalizedCmd.coordinate[0]
      normalizedCmd.startY = normalizedCmd.coordinate[1]
      normalizedCmd.endX = normalizedCmd.coordinate2[0]
      normalizedCmd.endY = normalizedCmd.coordinate2[1]
      delete normalizedCmd.coordinate
      delete normalizedCmd.coordinate2
    }
    // 单一数组coordinate格式
    else if (Array.isArray(normalizedCmd.coordinate) && normalizedCmd.coordinate.length === 4) {
      normalizedCmd.startX = normalizedCmd.coordinate[0]
      normalizedCmd.startY = normalizedCmd.coordinate[1]
      normalizedCmd.endX = normalizedCmd.coordinate[2]
      normalizedCmd.endY = normalizedCmd.coordinate[3]
      delete normalizedCmd.coordinate
    }
  }

  return normalizedCmd
}

/**
 * 解析模型响应
 */
function parseModelResponse(response: any): AIResponse {
  try {
    if (!response || !response.choices || response.choices.length === 0) {
      throw new Error('无效的API响应')
    }

    const content = response.choices[0].message.content

    // 尝试解析JSON响应
    try {
      // 检查内容是否包含JSON
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/{[\s\S]*}/)

      if (jsonMatch) {
        const jsonContent = jsonMatch[1] || jsonMatch[0]
        const parsedResponse = JSON.parse(jsonContent)

        // 确保响应包含必要的字段
        if (!parsedResponse.thinking) {
          parsedResponse.thinking = '无分析过程'
        }

        if (!parsedResponse.commands) {
          parsedResponse.commands = []
        }

        // 处理命令格式
        parsedResponse.commands = parsedResponse.commands.map(normalizeCommand)

        // 添加任务完成标记
        parsedResponse.commands = parsedResponse.commands.map((cmd: any) => {
          if (cmd.isTaskComplete === undefined) {
            cmd.isTaskComplete = parsedResponse.isTaskComplete || false
          }

          if (cmd.isFinalCommand === undefined) {
            cmd.isFinalCommand = false
          }

          return cmd
        })

        // 将最后一个命令标记为最终命令
        if (parsedResponse.commands.length > 0) {
          parsedResponse.commands[parsedResponse.commands.length - 1].isFinalCommand = true
        }

        // 创建精简版响应对象，不包含原始响应数据
        const cleanResponse: AIResponse = {
          thinking: parsedResponse.thinking,
          commands: parsedResponse.commands,
          result: parsedResponse.result,
          isTaskComplete: parsedResponse.isTaskComplete,
        }

        return cleanResponse
      }
    } catch (jsonError) {
      logger.error('解析JSON响应失败:', jsonError)
    }

    // 备用解析方法
    const commandsMatch = content.match(/命令[：:]([\s\S]*?)(?:\n\n|$)/)
    const thinkingMatch = content.match(/思考[：:]([\s\S]*?)(?:\n\n|$)/)

    return {
      thinking: thinkingMatch ? thinkingMatch[1].trim() : '无法解析思考过程',
      commands: commandsMatch ? [{ type: CommandType.TEXT, text: commandsMatch[1].trim() }] : [],
      // 不包含原始响应
    }
  } catch (error) {
    logger.error('解析模型响应失败:', error)
    return {
      thinking: '响应解析失败',
      commands: [],
      error: (error as Error).message,
    }
  }
}

/**
 * 更新会话上下文
 */
function updateSessionContext(sessionContext: SessionContext, newItem: SessionHistoryItem): void {
  if (!sessionContext.history) {
    sessionContext.history = []
  }

  // 简化AI响应，只保留关键信息
  const simplifiedResponse: SimpleAIResponse = {
    thinking: newItem.parsedResponse.thinking.substring(0, 150),
    commands: newItem.parsedResponse.commands.map((cmd) => ({
      type: cmd.type,
      isTaskComplete: cmd.isTaskComplete,
    })),
    result: newItem.parsedResponse.result,
    isTaskComplete: newItem.parsedResponse.isTaskComplete,
  }

  // 创建精简版历史项
  const simplifiedItem: SessionHistoryItem = {
    instruction: newItem.instruction,
    screenshot: newItem.screenshot,
    uiElements: newItem.uiElements,
    parsedResponse: simplifiedResponse,
  }

  // 添加新项目到历史记录
  sessionContext.history.push(simplifiedItem)

  // 限制历史记录大小
  if (sessionContext.history.length > MAX_CONTEXT_ITEMS) {
    sessionContext.history = sessionContext.history.slice(-MAX_CONTEXT_ITEMS)
  }

  // 更新最后一次操作信息
  sessionContext.lastOperation = {
    instruction: newItem.instruction,
    timestamp: new Date().toISOString(),
  }
}

export { handleAIInstruction }

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
  parsedResponse: AIResponse
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
    // 准备提示内容
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

    // 添加响应到会话上下文
    updateSessionContext(sessionContext, {
      instruction: instruction || '自动纠错',
      screenshot: screenshot ? { timestamp: screenshot.timestamp } : undefined,
      uiElements: uiElements ? { timestamp: uiElements.timestamp } : undefined,
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
 * @param {string} instruction - 用户指令
 * @param {Object} screenshot - 屏幕截图
 * @param {Object} uiElements - UI元素
 * @param {SessionContext} sessionContext - 会话上下文
 * @returns {PromptContent} 提示内容
 */
function buildInstructionPrompt(instruction: string, screenshot: any, uiElements: any, sessionContext: SessionContext): PromptContent {
  // 基础系统提示
  const systemPrompt = `你是DroidAuto安卓自动化助手，可以控制Android设备执行各种任务，以及根据当前屏幕状态和UI元素，返回用户需要的信息。
请遵循以下规则：
1. 分析当前屏幕截图和UI元素，理解用户当前所在的界面和可执行的操作
2. 根据用户指令，制定完整的操作计划，分步骤执行
3. 返回JSON格式的操作命令，确保每个命令的坐标或参数准确无误
4. 所有文本必须使用中文回复
5. 回复必须包含thinking、commands和isTaskComplete三个字段
6. 对于多步骤任务，所有中间步骤的命令和整体响应都必须将isTaskComplete设为false
7. 如果命令只是一个中间步骤（如点击导航到其他页面），确保将该命令的isTaskComplete设为false
8. 只有当已经获取到任务要求的完整结果数据时，才将isTaskComplete设为true
9. 当任务完成时，必须提供明确的result结果数据
10. 严格按照示例格式返回命令，不要使用替代参数名称

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

每个命令都应该包含以下字段：
- isTaskComplete: 布尔值，指示此命令执行后任务是否完成
- isFinalCommand: 布尔值，指示此命令是否为当前步骤的最后一个命令(可选，默认最后一个命令为最终命令)

点击屏幕的正确格式为：
{"type": "tap", "x": 160, "y": 200, "isTaskComplete": false, "isFinalCommand": true}
注意: 不要使用coordinate:[160, 200]参数，必须使用x和y

滑动屏幕的正确格式为：
{"type": "swipe", "startX": 160, "startY": 800, "endX": 160, "endY": 200, "duration": 300, "isTaskComplete": false}
注意: 不要使用coordinate或coordinate2参数，必须使用startX, startY, endX, endY

完整的响应格式示例：
{
  "thinking": "我对当前屏幕的分析...",
  "commands": [
    {"type": "tap", "x": 160, "y": 200, "isTaskComplete": false}
  ],
  "isTaskComplete": false
}

对于需要多步骤操作的任务，系统会在每个命令执行后重新获取屏幕状态，并让你继续提供下一步命令，直到整个任务完成。
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
4. 使用tap命令点击估计的坐标位置
5. 对于多步骤任务，每完成一个步骤后要继续监测新的屏幕内容，直到获取最终结果

尽可能精确地执行用户指令，记住，你的目标是完成整个任务，而不仅仅是执行单个命令。`

  // 历史上下文提示
  let contextPrompt = ''
  if (sessionContext.history && sessionContext.history.length > 0) {
    contextPrompt = '历史操作记录:\n'
    sessionContext.history.forEach((item, index) => {
      contextPrompt += `操作${index + 1}: ${item.instruction}\n`
      if (item.parsedResponse && item.parsedResponse.thinking) {
        contextPrompt += `分析: ${item.parsedResponse.thinking.substring(0, 100)}...\n`
      }
    })
  }

  // 当前状态提示
  const currentStatePrompt = `当前屏幕状态:
${formatUIElements(uiElements)}

用户指令: ${instruction}`

  return {
    systemPrompt,
    contextPrompt,
    currentStatePrompt,
  }
}

/**
 * 构建错误纠正提示
 * @param {ErrorInfo} error - 错误信息
 * @param {Object} screenshot - 屏幕截图
 * @param {Object} uiElements - UI元素
 * @param {SessionContext} sessionContext - 会话上下文
 * @returns {PromptContent} 提示内容
 */
function buildErrorCorrectionPrompt(error: ErrorInfo, screenshot: any, uiElements: any, sessionContext: SessionContext): PromptContent {
  // 错误纠正系统提示
  const systemPrompt = `你是DroidAuto安卓自动化纠错助手，负责修复操作执行过程中的错误。
请遵循以下规则：
1. 分析执行失败的命令和错误信息
2. 检查当前屏幕状态和UI元素
3. 确定失败原因，可能是：
   - 坐标不准确
   - 元素不存在或已变化
   - 需要先执行其他操作
   - 设备响应超时
4. 提供修正后的命令或替代方案
5. 所有文本必须使用中文回复
6. 回复必须包含thinking和commands两个字段
7. 严格按照示例格式返回命令，不要使用替代参数名称

可用的命令类型如下，必须使用"type"字段指定类型：
- tap: 点击屏幕坐标，必须包含x和y参数
  例如: {"type": "tap", "x": 160, "y": 200}
- swipe: 滑动屏幕，必须包含startX, startY, endX, endY参数，可选duration参数
  例如: {"type": "swipe", "startX": 160, "startY": 800, "endX": 160, "endY": 200, "duration": 300}
  注意: 不要使用coordinate或coordinate2参数，必须使用startX, startY, endX, endY
- text: 输入文本，必须包含text参数
  例如: {"type": "text", "text": "要输入的文字"}
- key: 按下按键，必须包含keycode参数
  例如: {"type": "key", "keycode": 4}
- wait: 等待一段时间，必须包含duration参数(毫秒)
  例如: {"type": "wait", "duration": 1000}
- back: 返回键
  例如: {"type": "back"}
- home: 主页键
  例如: {"type": "home"}
- app_switch: 最近任务键
  例如: {"type": "app_switch"}
- composite: 复合命令，必须包含commands数组
  例如: {"type": "composite", "commands": [{"type": "tap", "x": 160, "y": 200}, {"type": "wait", "duration": 1000}]}

点击屏幕的正确格式为：
{"type": "tap", "x": 160, "y": 200, "isTaskComplete": false, "isFinalCommand": true}
注意: 不要使用coordinate:[160, 200]参数，必须使用x和y

滑动屏幕的正确格式为：
{"type": "swipe", "startX": 160, "startY": 800, "endX": 160, "endY": 200, "duration": 300, "isTaskComplete": false}
注意: 不要使用coordinate或coordinate2参数，必须使用startX, startY, endX, endY

完整的响应格式示例：
{
  "thinking": "我对错误的分析...",
  "commands": [
    {"type": "tap", "x": 160, "y": 200},
    {"type": "wait", "duration": 1000}
  ]
}

当UI分析无法解决问题时，切换到视觉识别模式:
1. 分析屏幕截图，查找关键视觉元素
2. 估计新元素位置
3. 制定新的操作计划

尽可能智能地修复问题，无法修复时给出明确原因。`

  // 错误上下文提示
  let errorContextPrompt = ''
  if (error) {
    errorContextPrompt = `执行失败的命令: ${JSON.stringify(error.command)}
错误信息: ${error.message}`
  }

  // 最近操作历史提示
  let recentHistoryPrompt = ''
  if (sessionContext.history && sessionContext.history.length > 0) {
    const recentHistory = sessionContext.history.slice(-2)
    recentHistoryPrompt = '最近操作记录:\n'
    recentHistory.forEach((item, index) => {
      recentHistoryPrompt += `操作${index + 1}: ${item.instruction}\n`
    })
  }

  // 当前状态提示
  const currentStatePrompt = `当前屏幕状态:
${formatUIElements(uiElements)}`

  return {
    systemPrompt,
    errorContextPrompt,
    recentHistoryPrompt,
    currentStatePrompt,
  }
}

/**
 * 构建持续处理提示
 * @param {string} instruction - 用户原始指令
 * @param {Command} previousCommand - 上一个执行的命令
 * @param {Object} screenshot - 屏幕截图
 * @param {Object} uiElements - UI元素
 * @param {SessionContext} sessionContext - 会话上下文
 * @returns {PromptContent} 提示内容
 */
function buildContinuationPrompt(
  instruction: string,
  previousCommand: Command,
  screenshot: any,
  uiElements: any,
  sessionContext: SessionContext
): PromptContent {
  // 持续处理系统提示
  const systemPrompt = `你是DroidAuto安卓自动化助手，正在执行一个持续的工作流。
上一个命令已经执行完成，现在你需要分析新的屏幕状态，并决定下一步操作。

用户的原始指令是: "${instruction}"

请遵循以下规则：
1. 分析当前屏幕截图和UI元素，理解用户当前所在的界面和可执行的操作
2. 判断任务是否已完成，特别注意区分"导航到相关页面"和"完成整个任务目标"的区别
3. 对于多步骤任务（如"总结14天后的天气"），仅点击导航按钮还不算完成任务
4. 只有当已经获取到用户要求的数据（如具体天气信息）时，才算任务完成
5. 如果任务已完成，提供详细的结果数据并将isTaskComplete设为true
6. 如果任务未完成，提供下一步命令并将isTaskComplete设为false
7. 所有文本必须使用中文回复
8. 回复必须包含thinking、commands、result(如果任务完成)和isTaskComplete字段
9. 严格按照示例格式返回命令，不要使用替代参数名称

可用的命令类型与基本指令相同，但需添加以下字段：
- isTaskComplete: 布尔值，指示此命令执行后任务是否完成
- isFinalCommand: 布尔值，指示此命令是否为当前步骤的最后一个命令

点击屏幕的正确格式为：
{"type": "tap", "x": 160, "y": 200, "isTaskComplete": false, "isFinalCommand": true}
注意: 不要使用coordinate:[160, 200]参数，必须使用x和y

滑动屏幕的正确格式为：
{"type": "swipe", "startX": 160, "startY": 800, "endX": 160, "endY": 200, "duration": 300, "isTaskComplete": false}
注意: 不要使用coordinate或coordinate2参数，必须使用startX, startY, endX, endY

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
}

记住，你的目标是完整执行用户的指令，而不仅仅是执行单个操作。`

  // 上一步操作信息
  const previousActionPrompt = `上一步执行的命令: ${JSON.stringify(previousCommand)}`

  // 当前状态提示
  const currentStatePrompt = `当前屏幕状态:
${formatUIElements(uiElements)}

用户原始指令: ${instruction}`

  return {
    systemPrompt,
    contextPrompt: previousActionPrompt,
    currentStatePrompt,
  }
}

/**
 * 格式化UI元素为文本
 * @param {Object} uiElements - UI元素
 * @returns {string} 格式化的文本
 */
function formatUIElements(uiElements: any): string {
  if (!uiElements || !uiElements.elements) {
    return '无法获取UI元素'
  }

  // 简化的UI元素描述
  function formatElement(element: any, indent: number = 0): string {
    if (!element) return ''

    const indentStr = ' '.repeat(indent * 2)
    let result = `${indentStr}- 类型: ${element.type || '未知'}\n`

    if (element.text) {
      result += `${indentStr}  文本: "${element.text}"\n`
    }

    if (element.contentDesc) {
      result += `${indentStr}  描述: "${element.contentDesc}"\n`
    }

    if (element.id) {
      result += `${indentStr}  ID: ${element.id}\n`
    }

    if (element.clickable) {
      result += `${indentStr}  可点击: 是\n`
    }

    if (element.bounds) {
      result += `${indentStr}  位置: [${element.bounds.centerX},${element.bounds.centerY}]\n`
    }

    // 限制子元素数量，以避免提示过长
    if (element.children && element.children.length > 0) {
      const limitedChildren = element.children.slice(0, 5)
      result += `${indentStr}  子元素(${Math.min(5, element.children.length)}/${element.children.length}):\n`
      limitedChildren.forEach((child: any) => {
        result += formatElement(child, indent + 1)
      })

      if (element.children.length > 5) {
        result += `${indentStr}    ... 省略${element.children.length - 5}个子元素 ...\n`
      }
    }

    return result
  }

  return formatElement(uiElements.elements)
}

/**
 * 接口描述OpenAI请求消息
 */
interface OpenAIMessage {
  role: string
  content: string | { type: string; text?: string; image_url?: { url: string } }[]
}

/**
 * 调用大语言模型API
 * @param {PromptContent} prompt - 提示内容
 * @param {Object} screenshot - 屏幕截图(可选)
 * @returns {Promise<any>} API响应
 */
async function callLLMAPI(prompt: PromptContent, screenshot: any = null): Promise<any> {
  try {
    const messages: OpenAIMessage[] = [{ role: 'system', content: prompt.systemPrompt }]

    // 添加上下文消息
    if (prompt.contextPrompt) {
      messages.push({
        role: 'system',
        content: prompt.contextPrompt,
      })
    }

    // 添加错误上下文(如果存在)
    if (prompt.errorContextPrompt) {
      messages.push({
        role: 'system',
        content: prompt.errorContextPrompt,
      })
    }

    // 添加最近操作历史(如果存在)
    if (prompt.recentHistoryPrompt) {
      messages.push({
        role: 'system',
        content: prompt.recentHistoryPrompt,
      })
    }

    // 添加当前状态
    messages.push({
      role: 'user',
      content: prompt.currentStatePrompt,
    })

    // 如果有截图，则添加到消息中
    if (screenshot && screenshot.base64) {
      // 修改最后一条消息，添加图片
      const lastMessage = messages[messages.length - 1]
      lastMessage.content = [
        { type: 'text', text: lastMessage.content as string },
        {
          type: 'image_url',
          image_url: {
            url: `data:image/png;base64,${screenshot.base64}`,
          },
        },
      ]
    }

    // 调用API
    const apiKey = process.env.LLM_API_KEY || ''
    const modelName = process.env.LLM_MODEL || ''
    const endpoint = process.env.LLM_ENDPOINT || ''

    if (!apiKey || !modelName || !endpoint) {
      throw new Error('API配置错误')
    }

    // 记录请求信息（不包含敏感信息）
    logger.info(`调用LLM API: ${endpoint}, 模型: ${modelName}`)

    const requestBody = {
      model: modelName,
      messages,
      temperature: 0.6,
      max_tokens: 4096,
      top_p: 0.7,
      n: 1,
    }

    // 记录图片数量（如果有）
    if (screenshot && screenshot.base64) {
      logger.info(`请求包含图片数据`)
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
    const axiosError = error as AxiosError
    if (axiosError.response) {
      // 服务器返回了错误响应
      logger.error(`调用LLM API失败: 状态码 ${axiosError.response.status}`)
      logger.error(`错误详情: ${JSON.stringify(axiosError.response.data)}`)
    } else if (axiosError.request) {
      // 请求已发送但未收到响应
      logger.error(`调用LLM API失败: 未收到响应`)
    } else {
      // 请求配置错误
      logger.error(`调用LLM API失败: ${axiosError.message}`)
    }
    throw error
  }
}

/**
 * 解析模型响应
 * @param {any} response - API响应
 * @returns {AIResponse} 解析后的响应
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

        // 处理命令中的任务完成标志
        parsedResponse.commands = parsedResponse.commands.map((cmd: any) => {
          // 如果使用了action而不是type，将action转换为type
          if (cmd.action && !cmd.type) {
            const newCmd: any = { ...cmd, type: cmd.action }
            delete newCmd.action

            // 对于click操作，转换为tap命令
            if (newCmd.type === 'click' && Array.isArray(cmd.coordinate) && cmd.coordinate.length === 2) {
              newCmd.type = 'tap'
              newCmd.x = cmd.coordinate[0]
              newCmd.y = cmd.coordinate[1]
              delete newCmd.coordinate
            }

            return newCmd
          }

          // 处理swipe命令中使用coordinate和coordinate2的情况
          if (cmd.type === 'swipe') {
            // 如果使用coordinate和coordinate2格式
            if (Array.isArray(cmd.coordinate) && Array.isArray(cmd.coordinate2)) {
              const newCmd = { ...cmd }
              newCmd.startX = cmd.coordinate[0]
              newCmd.startY = cmd.coordinate[1]
              newCmd.endX = cmd.coordinate2[0]
              newCmd.endY = cmd.coordinate2[1]
              delete newCmd.coordinate
              delete newCmd.coordinate2
              return newCmd
            }
            // 如果使用单一数组coordinate格式(假设格式为[startX, startY, endX, endY])
            else if (Array.isArray(cmd.coordinate) && cmd.coordinate.length === 4) {
              const newCmd = { ...cmd }
              newCmd.startX = cmd.coordinate[0]
              newCmd.startY = cmd.coordinate[1]
              newCmd.endX = cmd.coordinate[2]
              newCmd.endY = cmd.coordinate[3]
              delete newCmd.coordinate
              return newCmd
            }
          }

          // 添加isTaskComplete和isFinalCommand属性（如果未指定）
          if (cmd.isTaskComplete === undefined) {
            cmd.isTaskComplete = parsedResponse.isTaskComplete || false
          }

          if (cmd.isFinalCommand === undefined) {
            // 默认最后一个命令为最终命令
            cmd.isFinalCommand = false
          }

          return cmd
        })

        // 如果有命令，将最后一个命令标记为最终命令
        if (parsedResponse.commands.length > 0) {
          parsedResponse.commands[parsedResponse.commands.length - 1].isFinalCommand = true
        }

        return parsedResponse as AIResponse
      }
    } catch (jsonError) {
      logger.error('解析JSON响应失败:', jsonError)
    }

    // 如果JSON解析失败，尝试提取命令
    const commandsMatch = content.match(/命令[：:]([\s\S]*?)(?:\n\n|$)/)
    const thinkingMatch = content.match(/思考[：:]([\s\S]*?)(?:\n\n|$)/)

    return {
      thinking: thinkingMatch ? thinkingMatch[1].trim() : '无法解析思考过程',
      commands: commandsMatch ? [{ type: CommandType.TEXT, text: commandsMatch[1].trim() }] : [],
      rawResponse: content,
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
 * @param {SessionContext} sessionContext - 会话上下文
 * @param {SessionHistoryItem} newItem - 新的上下文项
 */
function updateSessionContext(sessionContext: SessionContext, newItem: SessionHistoryItem): void {
  if (!sessionContext.history) {
    sessionContext.history = []
  }

  // 添加新项目到历史记录
  sessionContext.history.push(newItem)

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

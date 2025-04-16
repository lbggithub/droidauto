import { Server as SocketServer, Socket } from 'socket.io'
import logger from './utils/logger'
import { executeCommand, Command } from './services/commandExecutor'
import { getScreenshot } from './services/androidConnection'
import { extractUIElements } from './services/uiExtractor'
import { handleAIInstruction, SessionContext } from './services/aiService'

/**
 * 扩展的Socket接口，包含会话上下文
 */
interface SessionSocket extends Socket {
  sessionContext?: SessionContext
}

/**
 * 命令执行结果接口
 */
interface CommandResult {
  command: Command
  success: boolean
  result?: any
  error?: string
}

/**
 * 获取当前屏幕状态
 */
async function getCurrentScreenState() {
  const screenshot = await getScreenshot()
  const uiElements = await extractUIElements()

  return {
    screenshot,
    uiElements: {
      ...uiElements,
      timestamp: typeof uiElements.timestamp === 'string' ? Number(uiElements.timestamp) : uiElements.timestamp,
    },
  }
}

/**
 * 格式化错误消息
 */
function formatError(error: any): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 执行单个命令并处理结果
 */
async function executeAndHandleSingleCommand(socket: SessionSocket, command: Command, logPrefix: string = ''): Promise<CommandResult> {
  logger.info(`${logPrefix}执行命令: ${JSON.stringify(command)}`)
  socket.emit('command-start', command)

  try {
    // 执行命令
    const result = await executeCommand(command)

    // 构建成功结果
    const commandResult = {
      command,
      success: true,
      result,
    }

    // 发送结果到客户端
    socket.emit('command-result', commandResult)

    // 等待界面更新
    await new Promise((resolve) => setTimeout(resolve, 1000))

    return commandResult
  } catch (error) {
    // 构建错误结果
    const errorMessage = formatError(error)
    logger.error(`${logPrefix}命令执行失败: ${errorMessage}`)

    const commandResult = {
      command,
      success: false,
      error: errorMessage,
    }

    // 发送错误结果到客户端
    socket.emit('command-result', commandResult)

    // 尝试自动纠错
    await handleErrorCorrection(socket, command, error)

    return commandResult
  }
}

/**
 * 执行命令序列
 */
async function executeCommandSequence(
  socket: SessionSocket,
  commands: Command[],
  instruction: string,
  logPrefix: string = ''
): Promise<void> {
  for (const command of commands) {
    const result = await executeAndHandleSingleCommand(socket, command, logPrefix)

    // 如果命令执行成功且任务未完成，继续处理
    if (result.success && !command.isTaskComplete) {
      await continueTaskExecution(socket, instruction, command, `${logPrefix}继续处理`)
    }

    // 如果命令失败或已完成任务，停止处理后续命令
    if (!result.success || command.isTaskComplete) {
      break
    }
  }
}

/**
 * 继续执行任务流程
 */
async function continueTaskExecution(
  socket: SessionSocket,
  instruction: string,
  previousCommand: Command,
  logPrefix: string = ''
): Promise<void> {
  logger.info(`${logPrefix}任务尚未完成，继续处理工作流...`)

  // 获取新的屏幕状态
  const { screenshot, uiElements } = await getCurrentScreenState()

  // 请求AI继续处理任务
  const continuationResponse = await handleAIInstruction({
    instruction,
    screenshot,
    uiElements,
    sessionContext: socket.sessionContext || ({} as any),
    isContinuation: true,
    previousCommand,
  })

  // 处理结果数据
  if (continuationResponse.result) {
    socket.emit('task-result', {
      instruction,
      result: continuationResponse.result,
    })
  }

  // 处理新命令
  if (continuationResponse.commands && continuationResponse.commands.length > 0) {
    socket.emit('instruction-response', continuationResponse)
    await executeCommandSequence(socket, continuationResponse.commands, instruction, `${logPrefix}子任务`)
  }
}

/**
 * 设置WebSocket事件处理
 * @param io - Socket.io服务器实例
 */
export function setupSocketHandlers(io: SocketServer): void {
  io.on('connection', (socket: SessionSocket) => {
    logger.info('新客户端连接')

    // 发送指令给AI
    socket.on('send-instruction', async (instruction: string) => {
      logger.info(`收到指令: ${instruction}`)

      try {
        // 获取当前屏幕状态
        const { screenshot, uiElements } = await getCurrentScreenState()

        socket.emit('handle-instruction-start')

        // 发送上下文和指令给AI进行处理
        const response = await handleAIInstruction({
          instruction,
          screenshot,
          uiElements,
          sessionContext: socket.sessionContext || ({} as any),
        })

        // 更新会话上下文
        socket.sessionContext = {
          ...socket.sessionContext,
          history: socket.sessionContext?.history || [],
          lastOperation: {
            instruction,
            timestamp: new Date().toISOString(),
          },
        }

        // 发送AI处理结果给客户端
        socket.emit('instruction-response', response)

        // 执行命令序列
        if (response.commands && response.commands.length > 0) {
          await executeCommandSequence(socket, response.commands, instruction)
        }
      } catch (error) {
        const errorMessage = formatError(error)
        logger.error(`处理指令时出错: ${errorMessage}`)
        socket.emit('error', { message: `处理指令时出错: ${errorMessage}` })
      }
    })

    // 断开连接
    socket.on('disconnect', () => {
      logger.info('客户端断开连接')
    })
  })
}

/**
 * 处理命令执行错误并尝试自动纠正
 * @param socket - Socket连接
 * @param command - 执行失败的命令
 * @param error - 错误对象
 */
async function handleErrorCorrection(socket: SessionSocket, command: Command, error: any): Promise<void> {
  try {
    // 获取当前屏幕状态
    const { screenshot, uiElements } = await getCurrentScreenState()

    // 发送纠错通知
    socket.emit('error-correction-start')

    // 调用AI纠错服务
    const correction = await handleAIInstruction({
      instruction: undefined, // 不需要用户指令，而是让AI根据错误进行纠错
      screenshot,
      uiElements,
      sessionContext: socket.sessionContext || ({} as any),
      isErrorCorrection: true,
      error: {
        command,
        message: formatError(error),
      },
    })

    // 如果有纠正命令，执行它们
    if (correction.commands && correction.commands.length > 0) {
      for (const correctionCommand of correction.commands) {
        await executeAndHandleSingleCommand(socket, correctionCommand, '纠错:')
      }
    }

    // 发送纠错完成通知
    socket.emit('error-correction-end', correction)
  } catch (correctionError) {
    const errorMessage = formatError(correctionError)
    logger.error(`纠错过程出错: ${errorMessage}`)
    socket.emit('error', { message: `纠错过程出错: ${errorMessage}` })
  }
}

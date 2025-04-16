import { Server as SocketServer, Socket } from 'socket.io'
import logger from './utils/logger'
import { executeCommand } from './services/commandExecutor'
import { getScreenshot } from './services/androidConnection'
import { extractUIElements } from './services/uiExtractor'
import { handleAIInstruction, SessionContext } from './services/aiService'

/**
 * 命令接口
 */
interface Command {
  type: string
  [key: string]: any
}

/**
 * 扩展的Socket接口，包含会话上下文
 */
interface SessionSocket extends Socket {
  sessionContext?: SessionContext
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
        // 获取当前屏幕截图
        const screenshot = await getScreenshot()

        // 提取UI元素
        const uiElements = await extractUIElements()
        const processedUiElements = {
          ...uiElements,
          timestamp: typeof uiElements.timestamp === 'string' ? Number(uiElements.timestamp) : uiElements.timestamp,
        }

        // 发送上下文和指令给AI进行处理
        const response = await handleAIInstruction({
          instruction,
          screenshot,
          uiElements: processedUiElements,
          sessionContext: socket.sessionContext || ({} as any),
        })

        // 记录会话上下文
        socket.sessionContext = {
          ...socket.sessionContext,
          history: socket.sessionContext?.history || [],
          lastOperation: {
            instruction: instruction,
            timestamp: new Date().toISOString(),
          },
        }

        // 先将AI处理结果发送回客户端
        socket.emit('instruction-response', response)

        // 执行AI返回的命令
        if (response.commands && response.commands.length > 0) {
          for (const command of response.commands) {
            logger.info(`执行命令: ${JSON.stringify(command)}`)

            // 发送命令执行前通知
            socket.emit('command-start', command)

            try {
              // 执行命令
              const result = await executeCommand(command)

              // 发送命令执行结果
              socket.emit('command-result', {
                command,
                success: true,
                result,
              })

              // 命令执行后等待一小段时间，让界面有时间更新
              await new Promise((resolve) => setTimeout(resolve, 1000))

              // 检查命令是否完成了整个任务，如果没有完成，获取新的屏幕状态并继续处理
              if (!command.isTaskComplete) {
                logger.info('任务尚未完成，继续处理工作流...')

                // 获取新的屏幕截图和UI元素
                const newScreenshot = await getScreenshot()
                const newUiElements = await extractUIElements()
                const processedNewUiElements = {
                  ...newUiElements,
                  timestamp: typeof newUiElements.timestamp === 'string' ? Number(newUiElements.timestamp) : newUiElements.timestamp,
                }

                // 使用持续处理模式继续处理任务
                const continuationResponse = await handleAIInstruction({
                  instruction,
                  screenshot: newScreenshot,
                  uiElements: processedNewUiElements,
                  sessionContext: socket.sessionContext || ({} as any),
                  isContinuation: true,
                  previousCommand: command,
                })

                // 如果有结果数据，发送给客户端
                if (continuationResponse.result) {
                  socket.emit('task-result', {
                    instruction,
                    result: continuationResponse.result,
                  })
                }

                // 如果有新命令要执行，添加到响应中
                if (continuationResponse.commands && continuationResponse.commands.length > 0) {
                  // 将新的响应单独发送给客户端，避免与之前的响应合并
                  socket.emit('instruction-response', continuationResponse)
                }
              }
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error)
              logger.error(`命令执行失败: ${errorMessage}`)

              // 发送命令失败通知
              socket.emit('command-result', {
                command,
                success: false,
                error: errorMessage,
              })

              // 调用自动纠错机制
              await handleErrorCorrection(socket, command, error)
            }
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
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
    const screenshot = await getScreenshot()
    const uiElements = await extractUIElements()
    const processedUiElements = {
      ...uiElements,
      timestamp: typeof uiElements.timestamp === 'string' ? Number(uiElements.timestamp) : uiElements.timestamp,
    }

    // 发送纠错通知
    socket.emit('error-correction-start')

    // 调用AI纠错服务
    const correction = await handleAIInstruction({
      instruction: undefined, // 不需要用户指令，而是让AI根据错误进行纠错
      screenshot,
      uiElements: processedUiElements,
      sessionContext: socket.sessionContext || ({} as any),
      isErrorCorrection: true,
      error: {
        command: command as any,
        message: error instanceof Error ? error.message : String(error),
      },
    })

    // 如果有纠正命令，执行它们
    if (correction.commands && correction.commands.length > 0) {
      for (const correctionCommand of correction.commands) {
        logger.info(`执行纠正命令: ${JSON.stringify(correctionCommand)}`)

        try {
          const result = await executeCommand(correctionCommand)
          socket.emit('correction-result', {
            command: correctionCommand,
            success: true,
            result,
          })
        } catch (correctionError) {
          const errorMessage = correctionError instanceof Error ? correctionError.message : String(correctionError)

          logger.error(`纠正命令执行失败: ${errorMessage}`)
          socket.emit('correction-result', {
            command: correctionCommand,
            success: false,
            error: errorMessage,
          })
        }
      }
    }

    // 发送纠错完成通知
    socket.emit('error-correction-end', correction)
  } catch (correctionError) {
    const errorMessage = correctionError instanceof Error ? correctionError.message : String(correctionError)

    logger.error(`纠错过程出错: ${errorMessage}`)
    socket.emit('error', { message: `纠错过程出错: ${errorMessage}` })
  }
}

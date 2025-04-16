import logger from '../utils/logger'
import * as androidConnection from './androidConnection'
import { CommandResult } from './androidConnection'

/**
 * 命令类型枚举
 */
export enum CommandType {
  TAP = 'tap',
  SWIPE = 'swipe',
  TEXT = 'text',
  KEY = 'key',
  WAIT = 'wait',
  BACK = 'back',
  HOME = 'home',
  APP_SWITCH = 'app_switch',
  COMPOSITE = 'composite',
}

/**
 * 基础命令接口
 */
export interface BaseCommand {
  type: CommandType | string
  isTaskComplete?: boolean
  isFinalCommand?: boolean
}

/**
 * 点击命令接口
 */
export interface TapCommand extends BaseCommand {
  type: CommandType.TAP
  x: number
  y: number
}

/**
 * 滑动命令接口
 */
export interface SwipeCommand extends BaseCommand {
  type: CommandType.SWIPE
  startX: number
  startY: number
  endX: number
  endY: number
  duration?: number
}

/**
 * 文本输入命令接口
 */
export interface TextCommand extends BaseCommand {
  type: CommandType.TEXT
  text: string
}

/**
 * 按键命令接口
 */
export interface KeyCommand extends BaseCommand {
  type: CommandType.KEY
  keycode: number
}

/**
 * 等待命令接口
 */
export interface WaitCommand extends BaseCommand {
  type: CommandType.WAIT
  duration?: number
}

/**
 * 返回键命令接口
 */
export interface BackCommand extends BaseCommand {
  type: CommandType.BACK
}

/**
 * 主页键命令接口
 */
export interface HomeCommand extends BaseCommand {
  type: CommandType.HOME
}

/**
 * 应用切换命令接口
 */
export interface AppSwitchCommand extends BaseCommand {
  type: CommandType.APP_SWITCH
}

/**
 * 复合命令接口
 */
export interface CompositeCommand extends BaseCommand {
  type: CommandType.COMPOSITE
  commands: Command[]
}

/**
 * 命令联合类型
 */
export type Command =
  | TapCommand
  | SwipeCommand
  | TextCommand
  | KeyCommand
  | WaitCommand
  | BackCommand
  | HomeCommand
  | AppSwitchCommand
  | CompositeCommand

/**
 * 复合命令执行结果接口
 */
export interface CompositeCommandResult extends CommandResult {
  type: 'composite'
  results: CommandResult[]
}

/**
 * 执行AI返回的命令
 * @param {Command} command - 命令对象
 * @returns {Promise<CommandResult | CompositeCommandResult>} 命令执行结果
 */
export async function executeCommand(command: Command): Promise<CommandResult | CompositeCommandResult> {
  if (!command || !command.type) {
    throw new Error('无效的命令格式')
  }

  logger.info(`执行命令: ${JSON.stringify(command)}`)

  switch (command.type) {
    case CommandType.TAP: {
      const tapCmd = command as TapCommand
      return await androidConnection.tap(tapCmd.x, tapCmd.y)
    }

    case CommandType.SWIPE: {
      const swipeCmd = command as SwipeCommand
      return await androidConnection.swipe(swipeCmd.startX, swipeCmd.startY, swipeCmd.endX, swipeCmd.endY, swipeCmd.duration)
    }

    case CommandType.TEXT: {
      const textCmd = command as TextCommand
      return await androidConnection.inputText(textCmd.text)
    }

    case CommandType.KEY: {
      const keyCmd = command as KeyCommand
      return await androidConnection.pressKey(keyCmd.keycode)
    }

    case CommandType.WAIT: {
      const waitCmd = command as WaitCommand
      return await wait(waitCmd.duration || 1000)
    }

    case CommandType.BACK:
      return await androidConnection.pressKey(4) // KEYCODE_BACK

    case CommandType.HOME:
      return await androidConnection.pressKey(3) // KEYCODE_HOME

    case CommandType.APP_SWITCH:
      return await androidConnection.pressKey(187) // KEYCODE_APP_SWITCH

    case CommandType.COMPOSITE: {
      const compositeCmd = command as CompositeCommand
      return await executeCompositeCommand(compositeCmd.commands)
    }

    default:
      throw new Error(`未知的命令类型: ${(command as BaseCommand).type}`)
  }
}

/**
 * 等待指定时间
 * @param {number} duration - 等待时间(毫秒)
 * @returns {Promise<CommandResult>} 等待结果
 */
async function wait(duration: number): Promise<CommandResult> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ success: true, duration })
    }, duration)
  })
}

/**
 * 执行复合命令
 * @param {Array<Command>} commands - 命令数组
 * @returns {Promise<CompositeCommandResult>} 所有命令的执行结果
 */
export async function executeCompositeCommand(commands: Command[]): Promise<CompositeCommandResult> {
  if (!Array.isArray(commands) || commands.length === 0) {
    throw new Error('复合命令必须是命令数组且不能为空')
  }

  const results: CommandResult[] = []

  for (const cmd of commands) {
    const result = await executeCommand(cmd)
    results.push(result)
  }

  return {
    success: true,
    type: 'composite',
    results,
  }
}

import { exec } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import util from 'util'
import logger from '../utils/logger'
import { fileURLToPath } from 'url'

const execPromise = util.promisify(exec)
const adbPath = process.env.ADB_PATH || 'adb'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const screenshotDir = path.join(__dirname, '../../screenshots')

/**
 * 设备信息接口
 */
export interface DeviceInfo {
  id: string
  status: string
}

/**
 * 截图结果接口
 */
export interface ScreenshotResult {
  base64: string
  path: string
  timestamp: number
}

/**
 * UI层次结构结果接口
 */
export interface UIHierarchyResult {
  xml: string
  path: string
  timestamp: number
}

/**
 * 命令执行结果接口
 */
export interface CommandResult {
  success: boolean
  [key: string]: any
}

// 保存当前连接的设备信息
let connectedDevice: DeviceInfo | null = null

/**
 * 设置并初始化Android连接
 * @returns {Promise<{status: string, device: DeviceInfo | null}>} 连接状态
 */
export async function setupAndroidConnection(): Promise<{ status: string; device: DeviceInfo | null }> {
  try {
    // 确保screenshots目录存在
    await fs.mkdir(screenshotDir, { recursive: true })

    // 检查连接的设备
    await checkConnectedDevices()

    // 返回连接状态
    return {
      status: 'connected',
      device: connectedDevice,
    }
  } catch (error) {
    logger.error('设置Android连接失败:', error)
    throw error
  }
}

/**
 * 检查已连接的Android设备
 * @returns {Promise<DeviceInfo | null>} 设备信息
 */
export async function checkConnectedDevices(): Promise<DeviceInfo | null> {
  try {
    const { stdout } = await execPromise(`${adbPath} devices`)
    const deviceLines = stdout.trim().split('\n').slice(1)

    if (deviceLines.length === 0 || (deviceLines.length === 1 && deviceLines[0].trim() === '')) {
      throw new Error('没有Android设备连接')
    }

    // 使用第一个已连接的设备
    for (const line of deviceLines) {
      const [deviceId, status] = line.trim().split('\t')
      if (status === 'device') {
        connectedDevice = { id: deviceId, status: 'connected' }
        logger.info(`已连接到设备: ${deviceId}`)
        return connectedDevice
      }
    }

    throw new Error('没有可用的Android设备')
  } catch (error) {
    logger.error('检查Android设备连接失败:', error)
    throw error
  }
}

/**
 * 获取当前设备截图
 * @returns {Promise<ScreenshotResult>} 截图的base64编码
 */
export async function getScreenshot(): Promise<ScreenshotResult> {
  try {
    if (!connectedDevice) {
      await checkConnectedDevices()
    }

    const timestamp = new Date().getTime()
    const filename = `screen_${timestamp}.png`
    const filePath = path.join(screenshotDir, filename)

    // 截图并保存到设备
    await execPromise(`${adbPath} shell screencap -p /sdcard/${filename}`)

    // 从设备上拉取截图
    await execPromise(`${adbPath} pull /sdcard/${filename} ${filePath}`)

    // 从设备上删除截图
    await execPromise(`${adbPath} shell rm /sdcard/${filename}`)

    // 读取并返回base64编码的截图
    const imageBuffer = await fs.readFile(filePath)
    const base64Image = imageBuffer.toString('base64')

    return {
      base64: base64Image,
      path: filePath,
      timestamp,
    }
  } catch (error) {
    logger.error('获取截图失败:', error)
    throw error
  }
}

/**
 * 获取当前设备UI层次结构
 * @returns {Promise<UIHierarchyResult>} XML格式的UI层次结构
 */
export async function getUIHierarchy(): Promise<UIHierarchyResult> {
  try {
    if (!connectedDevice) {
      await checkConnectedDevices()
    }

    const timestamp = new Date().getTime()
    const filename = `hierarchy_${timestamp}.xml`
    const filePath = path.join(screenshotDir, filename)

    // 获取UI层次结构并保存到设备
    await execPromise(`${adbPath} shell uiautomator dump /sdcard/${filename}`)

    // 从设备上拉取文件
    await execPromise(`${adbPath} pull /sdcard/${filename} ${filePath}`)

    // 从设备上删除文件
    await execPromise(`${adbPath} shell rm /sdcard/${filename}`)

    // 读取并返回UI层次结构
    const uiXml = await fs.readFile(filePath, 'utf-8')

    return {
      xml: uiXml,
      path: filePath,
      timestamp,
    }
  } catch (error) {
    logger.error('获取UI层次结构失败:', error)
    throw error
  }
}

/**
 * 执行触摸操作
 * @param {number} x - x坐标
 * @param {number} y - y坐标
 * @returns {Promise<CommandResult>} 执行结果
 */
export async function tap(x: number, y: number): Promise<CommandResult> {
  try {
    if (!connectedDevice) {
      await checkConnectedDevices()
    }

    await execPromise(`${adbPath} shell input tap ${x} ${y}`)
    return { success: true, x, y }
  } catch (error) {
    logger.error('触摸操作失败:', error)
    throw error
  }
}

/**
 * 执行滑动操作
 * @param {number} startX - 起始x坐标
 * @param {number} startY - 起始y坐标
 * @param {number} endX - 结束x坐标
 * @param {number} endY - 结束y坐标
 * @param {number} duration - 持续时间(毫秒)
 * @returns {Promise<CommandResult>} 执行结果
 */
export async function swipe(startX: number, startY: number, endX: number, endY: number, duration: number = 300): Promise<CommandResult> {
  try {
    if (!connectedDevice) {
      await checkConnectedDevices()
    }

    await execPromise(`${adbPath} shell input swipe ${startX} ${startY} ${endX} ${endY} ${duration}`)
    return { success: true, startX, startY, endX, endY, duration }
  } catch (error) {
    logger.error('滑动操作失败:', error)
    throw error
  }
}

/**
 * 输入文本
 * @param {string} text - 要输入的文本
 * @returns {Promise<CommandResult>} 执行结果
 */
export async function inputText(text: string): Promise<CommandResult> {
  try {
    if (!connectedDevice) {
      await checkConnectedDevices()
    }

    // 转义特殊字符
    const escapedText = text.replace(/[()&|;]/g, '\\$&').replace(/\s/g, '%s')

    await execPromise(`${adbPath} shell input text "${escapedText}"`)
    return { success: true, text }
  } catch (error) {
    logger.error('文本输入失败:', error)
    throw error
  }
}

/**
 * 按下特定按键
 * @param {number} keycode - 按键代码
 * @returns {Promise<CommandResult>} 执行结果
 */
export async function pressKey(keycode: number): Promise<CommandResult> {
  try {
    if (!connectedDevice) {
      await checkConnectedDevices()
    }

    await execPromise(`${adbPath} shell input keyevent ${keycode}`)
    return { success: true, keycode }
  } catch (error) {
    logger.error('按键操作失败:', error)
    throw error
  }
}

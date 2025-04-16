import { createLogger, format, transports } from 'winston'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

/**
 * 日志工具模块
 * 提供应用程序日志记录功能
 */

// 获取当前文件的目录路径（ES模块中的__dirname替代方案）
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 确保日志目录存在
const logDir = path.join(__dirname, '../../logs')
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true })
}

// 创建格式化工具
const customFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.printf(({ level, message, timestamp }) => {
    return `${timestamp} ${level.toUpperCase()}: ${message}`
  })
)

/**
 * 创建日志记录器
 * 根据环境配置不同的日志级别和输出方式
 */
const logger = createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: customFormat,
  transports: [
    // 输出到控制台
    new transports.Console({
      format: format.combine(format.colorize(), customFormat),
    }),
    // 输出到错误日志文件
    new transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
    }),
    // 输出到综合日志文件
    new transports.File({
      filename: path.join(logDir, 'combined.log'),
    }),
  ],
})

export default logger

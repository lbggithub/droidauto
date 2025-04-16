import 'dotenv/config'
import express from 'express'
import http from 'http'
import { Server as SocketServer } from 'socket.io'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { setupAndroidConnection } from './services/androidConnection'
import { setupSocketHandlers } from './socket'
import logger from './utils/logger'
import androidRoutes from './routes/androidRoutes'
import aiRoutes from './routes/aiRoutes'
import uiRoutes from './routes/uiRoutes'

// 在 ES 模块中获取 __dirname 的替代方案
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * 初始化 Express 应用
 */
const app = express()
const server = http.createServer(app)

/**
 * 配置 Socket.IO 服务器
 */
const io = new SocketServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
})

// 配置中间件
app.use(express.json())
app.use(express.static(path.join(__dirname, '../client/dist')))

// 配置 API 路由
app.use('/api/android', androidRoutes)
app.use('/api/ai', aiRoutes)
app.use('/api/ui', uiRoutes)

// 前端路由处理
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'))
})

// 设置 WebSocket 处理
setupSocketHandlers(io)

// 服务器端口配置
const PORT = process.env.PORT || 3000

/**
 * 启动服务器
 */
server.listen(PORT, async () => {
  logger.info(`服务器运行在端口 ${PORT}`)

  try {
    // 尝试建立 Android 连接
    await setupAndroidConnection()
    logger.info('成功连接到 Android 设备')
  } catch (error) {
    logger.error('连接 Android 设备失败:', (error as Error).message)
  }
})

// 处理未捕获的异常
process.on('uncaughtException', (error: Error) => {
  logger.error('未捕获的异常:', error)
})

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.error('未处理的 Promise 拒绝:', reason)
})

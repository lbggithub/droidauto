<template>
  <div class="container">
    <header class="header">
      <h1 class="title">DroidAuto</h1>
      <div class="connection-status" :class="{ connected: isConnected }">
        <span class="status-dot"></span>
        {{ isConnected ? '已连接' : '未连接' }}
      </div>
    </header>

    <main class="main">
      <div class="screen-panel">
        <div class="device-screen">
          <img v-if="screenshot" :src="'data:image/png;base64,' + screenshot" alt="设备屏幕" />
          <div v-else class="no-screenshot">
            <i class="fas fa-mobile-alt"></i>
            <p>等待设备连接</p>
          </div>
        </div>
        <div class="screen-controls">
          <button @click="refreshScreenshot" class="refresh-btn"><i class="fas fa-sync-alt"></i> 刷新屏幕</button>
        </div>
      </div>

      <div class="control-panel">
        <div class="chat-history" ref="chatHistoryContainer">
          <div v-for="(message, index) in chatHistory" :key="index" class="message" :class="message.role">
            <div class="message-content">
              <p v-if="message.role === 'user'">{{ message.content }}</p>
              <div v-else class="ai-message">
                <div v-if="message.thinking" class="thinking">
                  <h4>分析过程</h4>
                  <p>{{ message.thinking }}</p>
                </div>
                <div v-if="message.commands && message.commands.length > 0" class="commands">
                  <h4>执行命令</h4>
                  <div v-for="(cmd, cmdIndex) in message.commands" :key="cmdIndex" class="command">
                    <div class="command-type">
                      {{ getCommandTypeName(cmd.type) }}
                    </div>
                    <div class="command-details">
                      <span v-if="cmd.type === 'tap'"> 坐标: ({{ cmd.x }}, {{ cmd.y }}) </span>
                      <span v-else-if="cmd.type === 'swipe'">
                        从 ({{ cmd.startX }}, {{ cmd.startY }}) 到 ({{ cmd.endX }}, {{ cmd.endY }})
                      </span>
                      <span v-else-if="cmd.type === 'text'"> 文本: "{{ cmd.text }}" </span>
                      <span v-else>{{ JSON.stringify(cmd) }}</span>
                    </div>
                  </div>
                </div>
                <div v-if="message.result" class="result">
                  <h4>结果</h4>
                  <div class="result-content">
                    {{ message.result }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="input-area">
          <textarea v-model="userInput" placeholder="输入指令..." class="instruction-input" @keyup.enter.ctrl="sendInstruction"></textarea>
          <button @click="sendInstruction" class="send-btn" :disabled="isProcessing">
            <i class="fas fa-paper-plane"></i>
            {{ isProcessing ? '处理中...' : '发送' }}
          </button>
        </div>
      </div>
    </main>

    <footer class="footer">
      <p>DroidAuto · 基于AI的Android自动化控制框架</p>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, nextTick, onUnmounted } from 'vue'
import axios from 'axios'
import { io, Socket } from 'socket.io-client'

// 类型定义
interface Command {
  type: string
  [key: string]: any
}

interface Message {
  role: 'user' | 'ai' | 'system'
  content?: string
  thinking?: string
  commands?: Command[]
  result?: string
}

// 响应式状态
const screenshot = ref<string | null>(null)
const isConnected = ref<boolean>(false)
const userInput = ref<string>('')
const chatHistory = ref<Message[]>([])
const isProcessing = ref<boolean>(false)
const chatHistoryContainer = ref<HTMLElement | null>(null)
const socket = ref<Socket | null>(null)

/**
 * 获取设备连接状态
 * 检查设备是否已连接并更新状态
 */
const checkConnection = async (): Promise<void> => {
  try {
    const response = await axios.get('/api/android/status')
    isConnected.value = response.data.success
    if (isConnected.value) {
      await refreshScreenshot()
    }
  } catch (error) {
    console.error('检查设备连接失败:', error)
    isConnected.value = false
  }
}

/**
 * 刷新屏幕截图
 * 从设备获取当前屏幕截图
 */
const refreshScreenshot = async (): Promise<void> => {
  try {
    const response = await axios.get('/api/android/screenshot')
    if (response.data.success) {
      screenshot.value = response.data.screenshot.base64
    }
  } catch (error) {
    console.error('获取屏幕截图失败:', error)
  }
}

/**
 * 初始化WebSocket连接
 */
const initSocket = (): void => {
  socket.value = io()

  // 监听Socket连接事件
  socket.value.on('connect', () => {
    console.log('WebSocket连接已建立')
  })

  // 监听指令响应
  socket.value.on('instruction-response', (response) => {
    chatHistory.value.push({
      role: 'ai',
      thinking: response.thinking,
      commands: response.commands,
      result: response.result,
    })

    isProcessing.value = false
    refreshScreenshot()
    scrollToBottom()
  })

  // 监听命令开始执行
  socket.value.on('command-start', (command) => {
    console.log('命令开始执行:', command)
  })

  // 监听命令执行结果
  socket.value.on('command-result', (result) => {
    console.log('命令执行结果:', result)
  })

  // 监听任务最终结果
  socket.value.on('task-result', (result) => {
    console.log('任务最终结果:', result)
    // 更新最后一条AI消息
    for (let i = chatHistory.value.length - 1; i >= 0; i--) {
      if (chatHistory.value[i].role === 'ai') {
        chatHistory.value[i].result = result.result
        scrollToBottom()
        break
      }
    }
  })

  // 监听指令响应更新
  socket.value.on('instruction-response-update', (update) => {
    console.log('指令响应更新:', update)
    // 更新最后一条AI消息
    for (let i = chatHistory.value.length - 1; i >= 0; i--) {
      if (chatHistory.value[i].role === 'ai') {
        // 添加新命令
        if (update.commands) {
          chatHistory.value[i].commands = [...(chatHistory.value[i].commands || []), ...update.commands]
        }
        // 更新结果
        if (update.result) {
          chatHistory.value[i].result = update.result
        }
        scrollToBottom()
        break
      }
    }
  })

  // 监听错误
  socket.value.on('error', (error) => {
    console.error('WebSocket错误:', error)
    chatHistory.value.push({
      role: 'system',
      content: `错误: ${error.message}`,
    })
    isProcessing.value = false
    scrollToBottom()
  })

  // 监听断开连接
  socket.value.on('disconnect', () => {
    console.log('WebSocket连接已断开')
  })
}

/**
 * 发送指令给AI处理
 * 通过WebSocket发送用户指令
 */
const sendInstruction = (): void => {
  if (!userInput.value.trim() || isProcessing.value || !socket.value) return

  const instruction = userInput.value.trim()
  chatHistory.value.push({
    role: 'user',
    content: instruction,
  })

  userInput.value = ''
  isProcessing.value = true

  // 通过WebSocket发送指令
  socket.value.emit('send-instruction', instruction)
  scrollToBottom()
}

/**
 * 获取命令类型的中文名称
 * @param type 命令类型
 * @returns 命令类型的中文名称
 */
const getCommandTypeName = (type: string): string => {
  const typeMap: Record<string, string> = {
    tap: '点击',
    swipe: '滑动',
    text: '输入文本',
    key: '按键',
    wait: '等待',
    back: '返回',
    home: '主页',
    app_switch: '任务切换',
    composite: '组合命令',
  }

  return typeMap[type] || type
}

/**
 * 滚动聊天记录到底部
 */
const scrollToBottom = async (): Promise<void> => {
  await nextTick()
  const chatHistoryElement = chatHistoryContainer.value
  if (chatHistoryElement) {
    chatHistoryElement.scrollTop = chatHistoryElement.scrollHeight
  }
}

// 监听聊天历史变化，自动滚动
watch(chatHistory, scrollToBottom, { deep: true })

onMounted(async () => {
  // 初始化WebSocket连接
  initSocket()

  await checkConnection()

  // 定时检查连接和刷新截图
  setInterval(async () => {
    await checkConnection()
  }, 10000)
})

// 在组件卸载时关闭WebSocket连接
onUnmounted(() => {
  if (socket.value) {
    socket.value.disconnect()
  }
})
</script>

<style lang="less" scoped>
/* 防止页面滚动的样式 */
html,
body {
  height: 100%;
  overflow: hidden;
  margin: 0;
  padding: 0;
}

.container {
  height: 100vh;
  max-height: 100vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 0.5rem;
}

/* 添加结果区域样式 */
.result {
  margin-top: 1rem;
  padding: 0.5rem 1rem;
  background-color: #f0f8ff;
  border-radius: 4px;
  border-left: 4px solid #1e90ff;
}

.result h4 {
  margin: 0 0 0.5rem 0;
  color: #0066cc;
}

.result-content {
  white-space: pre-wrap;
  line-height: 1.5;
}

.header {
  flex: 0 0 auto;
  padding: 0.5rem 0;
  margin-bottom: 0.5rem;
}

.main {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.screen-panel,
.control-panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.device-screen {
  flex: 1;
  min-height: 0;
}

.chat-history {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.input-area {
  flex: 0 0 auto;
}

.instruction-input {
  height: 80px;
}

.footer {
  flex: 0 0 auto;
  padding: 0.5rem 0;
  margin-top: 0.5rem;
}

/* 调整屏幕尺寸 */
@media (max-width: 1024px) {
  .device-screen {
    height: auto;
    max-height: 40vh;
  }
}
</style>

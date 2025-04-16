import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

/**
 * Vite配置文件
 * 用于配置开发服务器和构建选项
 */
export default defineConfig({
  plugins: [vue()],
  // 指定前端根目录
  root: 'client',
  // 开发服务器配置
  server: {
    host: true,
    port: 8888,
    // API代理配置
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
      },
    },
  },
  // 路径别名配置
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './client/src'),
    },
  },
  // 构建输出配置
  build: {
    outDir: '../client/dist',
    emptyOutDir: true,
  },
})

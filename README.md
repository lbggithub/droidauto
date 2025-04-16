# DroidAuto

基于 AI 的 Android 自动化控制框架，使 AI 能够操控 Android 设备执行任何任务。

## 项目介绍

DroidAuto 是一个创新的自动化框架，结合大语言模型（LLM）和视觉识别 AI 能力，实现对 Android 设备的智能化控制。通过 Node.js 和 Vue3 构建的可视化界面，用户可以向 AI 发送自然语言指令，AI 将自动控制 Android 设备完成相应任务。

## 核心功能

- **UI 元素识别**：自动提取 Android 界面 UI 元素，并将其结构化信息传递给大语言模型
- **指令执行**：大语言模型理解用户指令并转化为 Android 可执行的操作
- **视觉识别兜底**：当 UI 元素分析无法满足操作需求时，自动切换到基于视觉的识别模式
- **自动纠错**：实时监控执行过程，当遇到中断或执行困难时，通过视觉大模型进行智能判断和纠正
- **操作日志**：实时记录并展示 AI 的操作流程和决策过程
- **可视化界面**：基于 Vue3 的直观操作界面，支持指令输入和执行结果可视化

## 技术架构

- **前端**：Vue3 + Node.js 构建的 Web 界面
- **后端**：Node.js 服务器处理用户请求和 AI 响应
- **AI 模型**：接入大语言模型用于指令理解和 UI 元素分析，视觉大模型用于图像识别
- **Android 连接**：通过 ADB 与 Android 设备建立通信

## 安装与使用

### 前提条件

- Node.js 14.0+
- Android 设备或模拟器
- ADB 工具
- 支持的大语言模型 API

### 安装步骤

```bash
# 克隆仓库
git clone https://github.com/lbggithub/droidauto.git
cd droidauto

# 安装依赖
npm install

# 启动应用
npm run dev
```

### 使用方法

1. 连接您的 Android 设备或启动模拟器
2. 启动 DroidAuto Web 界面
3. 在输入框中输入您希望执行的操作指令
4. 查看操作日志和设备反馈

## 开发计划

- [ ] 基础框架搭建
- [ ] Android 设备连接模块
- [ ] UI 元素提取引擎
- [ ] 大语言模型接入
- [ ] 视觉识别模型接入
- [ ] Vue3 前端界面开发
- [ ] 自动纠错机制实现

## 贡献指南

欢迎提交 Issues 和 Pull Requests 来帮助改进 DroidAuto。

## 许可证

[MIT License](LICENSE)

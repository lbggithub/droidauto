import { extractUIElements } from './uiExtractor'

/**
 * 获取格式化后的UI元素
 * @returns {Promise<{formattedUI: string, timestamp: string}>} 格式化后的UI元素和时间戳
 */
export async function getFormattedUIElements(): Promise<{ formattedUI: string; timestamp: string }> {
  try {
    // 获取UI元素
    const uiElements = await extractUIElements()

    return {
      formattedUI: JSON.stringify(uiElements),
      timestamp: uiElements.timestamp,
    }
  } catch (error) {
    console.error('获取格式化UI元素失败:', error)
    return {
      formattedUI: '无法获取UI元素',
      timestamp: new Date().toISOString(),
    }
  }
}

import { getUIHierarchy } from './androidConnection'
import { parseStringPromise } from 'xml2js'
import logger from '../utils/logger'

/**
 * UI元素的边界位置接口
 */
export interface Bounds {
  left: number
  top: number
  right: number
  bottom: number
  centerX: number
  centerY: number
  width: number
  height: number
}

/**
 * UI元素接口
 */
export interface UIElement {
  type: string
  id: string
  text: string
  contentDesc: string
  clickable: boolean
  bounds: Bounds
  depth: number
  children: UIElement[]
}

/**
 * UI元素提取结果接口
 */
export interface UIExtractResult {
  rootNode: any
  elements: UIElement | null
  timestamp: string
}

/**
 * 查找可点击元素的选项接口
 */
export interface FindClickableOptions {
  text?: string
  contentDesc?: string
  resourceId?: string
  className?: string
}

/**
 * 提取设备当前界面的UI元素
 * @returns {Promise<UIExtractResult>} 提取的UI元素结构
 */
export async function extractUIElements(): Promise<UIExtractResult> {
  try {
    // 获取UI层次结构
    const { xml } = await getUIHierarchy()

    // 解析XML
    const parsed = await parseStringPromise(xml, { explicitArray: false })

    if (!parsed || !parsed.hierarchy || !parsed.hierarchy.node) {
      throw new Error('无效的UI层次结构')
    }

    // 提取有用的元素
    const elements = processNode(parsed.hierarchy.node)

    return {
      rootNode: parsed.hierarchy.node,
      elements,
      timestamp: new Date().toISOString(),
    }
  } catch (error) {
    logger.error('提取UI元素失败:', error)
    throw error
  }
}

/**
 * 递归处理节点并提取信息
 * @param {any} node - UI节点
 * @param {number} depth - 当前深度
 * @returns {UIElement} 处理后的节点信息
 */
export function processNode(node: any, depth: number = 0): UIElement | null {
  if (!node) return null

  // 提取基本属性
  const element: UIElement = {
    type: node.class,
    id: node.resource_id,
    text: node.text,
    contentDesc: node.content_desc,
    clickable: node.clickable === 'true',
    bounds: parseBounds(node.bounds),
    depth,
    children: [],
  }

  // 递归处理子节点
  if (node.node) {
    const children = Array.isArray(node.node) ? node.node : [node.node]
    element.children = children.map((child: any) => processNode(child, depth + 1)).filter(Boolean) as UIElement[]
  }

  return element
}

/**
 * 解析边界字符串为坐标对象
 * @param {string} boundsStr - 边界字符串，格式为[x1,y1][x2,y2]
 * @returns {Bounds} 包含坐标的对象
 */
export function parseBounds(boundsStr: string): Bounds {
  if (!boundsStr) return { left: 0, top: 0, right: 0, bottom: 0, centerX: 0, centerY: 0, width: 0, height: 0 }

  // 从[x1,y1][x2,y2]格式解析坐标
  const match = boundsStr.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/)
  if (!match) return { left: 0, top: 0, right: 0, bottom: 0, centerX: 0, centerY: 0, width: 0, height: 0 }

  const [, left, top, right, bottom] = match.map(Number)
  const width = right - left
  const height = bottom - top

  return {
    left,
    top,
    right,
    bottom,
    // 添加中心点坐标，方便点击操作
    centerX: Math.floor((left + right) / 2),
    centerY: Math.floor((top + bottom) / 2),
    width,
    height,
  }
}

/**
 * 查找可点击元素
 * @param {UIElement} elements - UI元素结构
 * @param {FindClickableOptions} options - 查找选项
 * @returns {Array<UIElement>} 符合条件的可点击元素
 */
export function findClickableElements(elements: UIElement, options: FindClickableOptions = {}): UIElement[] {
  const { text, contentDesc, resourceId, className } = options
  const results: UIElement[] = []

  function traverse(element: UIElement): void {
    if (!element) return

    // 检查是否符合条件
    let matches = true

    if (text && element.text !== text) {
      matches = false
    }

    if (contentDesc && element.contentDesc !== contentDesc) {
      matches = false
    }

    if (resourceId && element.id !== resourceId) {
      matches = false
    }

    if (className && element.type !== className) {
      matches = false
    }

    // 如果是可点击元素并且符合条件，添加到结果中
    if (matches && element.clickable) {
      results.push(element)
    }

    // 遍历子元素
    if (element.children && element.children.length > 0) {
      element.children.forEach(traverse)
    }
  }

  traverse(elements)
  return results
}

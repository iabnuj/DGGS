/**
 * 剖分格缓冲区分析
 *
 * 对一组 GeoSOT 编码做邻域膨胀，产生缓冲区网格集合。
 * - buffer2D：按指定膨胀步数逐层扩展邻域
 * - bufferByDistance：按指定距离（米）自动折算膨胀步数
 */

import * as algebra from "./algebra"
import * as geosot from "./geosot"

/**
 * 对编码集做邻域膨胀，产生缓冲区网格。
 * 每步：当前集合 ∪ 所有格的四向邻域。
 *
 * @param codes 输入网格编码集合
 * @param steps 膨胀步数（≥0，0 = 返回原集）
 * @param diagonal 是否包含对角邻域（默认 false，只四向）
 * @returns 膨胀后的编码集合
 */
export function buffer2D(
  codes: string[],
  steps: number,
  options?: { diagonal?: boolean }
): string[] {
  if (steps <= 0) return [...codes]

  let current = new Set(codes)
  const diagonal = options?.diagonal ?? false

  for (let s = 0; s < steps; s++) {
    const next = new Set(current)
    for (const code of current) {
      try {
        const nbs = algebra.neighbors(code, { diagonal })
        for (const nb of nbs) {
          next.add(nb)
        }
      } catch {
        // 极地/边界网格可能无邻域，忽略
      }
    }
    current = next
  }

  return [...current]
}

/**
 * 对编码集做膨胀，过滤掉与源集重合的部分，只返回环带。
 */
export function bufferRing2D(
  codes: string[],
  steps: number,
  options?: { diagonal?: boolean }
): string[] {
  const sourceSet = new Set(codes)
  const buffered = buffer2D(codes, steps, options)
  if (steps <= 1) {
    // 单步膨胀：直接返回不在源集中的
    return buffered.filter((c) => !sourceSet.has(c))
  }
  // 多步膨胀：返回最外层环带
  const inner = new Set(buffer2D(codes, steps - 1, options))
  return buffered.filter((c) => !inner.has(c))
}

/**
 * 按指定距离（米）估算膨胀步数并执行膨胀。
 * 步数 = ceil(distanceMeters / cellSizeMeters)
 */
export function bufferByDistance(
  codes: string[],
  distanceMeters: number,
  options?: { diagonal?: boolean }
): string[] {
  if (codes.length === 0) return []

  const { level } = geosot.toId(codes[0]!)
  const cellDeg = 180 / 2 ** Math.max(1, level)
  const cellMeters = cellDeg * 110_574 // approx meters per degree lat

  const steps = Math.max(1, Math.ceil(distanceMeters / cellMeters))
  return buffer2D(codes, steps, options)
}

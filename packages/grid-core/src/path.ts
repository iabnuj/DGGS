/**
 * 剖分格路径（A*），在可通行网格上求最短路径。
 */
import * as algebra from "./algebra"
import * as geosot from "./geosot"

function cellCenter(code: string): { lng: number; lat: number } {
  const b = geosot.bboxFromCode(code)
  return { lng: (b.west + b.east) / 2, lat: (b.south + b.north) / 2 }
}

function heuristic(a: string, b: string): number {
  const ca = cellCenter(a)
  const cb = cellCenter(b)
  const dLng = ca.lng - cb.lng
  const dLat = ca.lat - cb.lat
  return Math.hypot(dLng, dLat)
}

export type PathOptions = {
  diagonal?: boolean
  /** 最大扩展节点数，防止失控 */
  maxExpand?: number
  /** 返回 true 表示禁行 */
  isBlocked?: (code: string) => boolean
}

/**
 * A* 求 start→goal 网格路径（含端点）。不可达返回 null。
 */
export function findPath(
  start: string,
  goal: string,
  options?: PathOptions
): string[] | null {
  if (start === goal) return [start]
  const diagonal = options?.diagonal ?? false
  const maxExpand = options?.maxExpand ?? 50_000
  const isBlocked = options?.isBlocked ?? (() => false)
  if (isBlocked(start) || isBlocked(goal)) return null

  const open = new Map<string, number>() // code → f
  const gScore = new Map<string, number>()
  const cameFrom = new Map<string, string>()
  gScore.set(start, 0)
  open.set(start, heuristic(start, goal))

  let expanded = 0
  while (open.size > 0) {
    let current: string | null = null
    let bestF = Infinity
    for (const [code, f] of open) {
      if (f < bestF) {
        bestF = f
        current = code
      }
    }
    if (current == null) break
    if (current === goal) {
      const path = [current]
      while (cameFrom.has(path[0]!)) {
        path.unshift(cameFrom.get(path[0]!)!)
      }
      return path
    }
    open.delete(current)
    expanded++
    if (expanded > maxExpand) return null

    const gCur = gScore.get(current) ?? Infinity
    for (const nb of algebra.neighbors(current, { diagonal })) {
      if (isBlocked(nb)) continue
      const tentative = gCur + 1
      if (tentative >= (gScore.get(nb) ?? Infinity)) continue
      cameFrom.set(nb, current)
      gScore.set(nb, tentative)
      open.set(nb, tentative + heuristic(nb, goal))
    }
  }
  return null
}

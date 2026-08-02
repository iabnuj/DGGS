/**
 * 航线通路规划（论证级）：
 * 综合高程 / 风速 / 电磁 / 雷达场约束，在可行格上 A* 求路径。
 */
import { path as gridPath, cover, geosot } from "@dggs/grid-core"
import type { GridCellRecord } from "@dggs/grid-ingest"
import { getWarehouse } from "@/data/warehouseBoot"

export type CorridorConstraints = {
  maxElevation: number
  maxWind: number
  maxEm: number
  maxRadar: number
}

export type ConstraintToggles = {
  elevation: boolean
  wind: boolean
  em: boolean
  radar: boolean
}

export type CorridorRunOptions = {
  constraints?: CorridorConstraints
  enabled?: Partial<ConstraintToggles>
  diagonal?: boolean
}

export const DEFAULT_CORRIDOR: CorridorConstraints = {
  maxElevation: 2800,
  maxWind: 35,
  maxEm: -45,
  maxRadar: -15,
}

export const DEFAULT_TOGGLES: ConstraintToggles = {
  elevation: true,
  wind: true,
  em: true,
  radar: true,
}

export const ELEV_SOURCES = ["elevation_dem_glo30", "elevation", "dem_glo30"]
export const WIND_SOURCES = ["wind_speed"]
export const EM_SOURCES = ["em_intensity"]
export const RADAR_SOURCES = ["radar_coverage"]

async function loadFieldMap(sources: string[]): Promise<Map<string, number>> {
  const wh = getWarehouse()
  const map = new Map<string, number>()
  for (const source of sources) {
    const rows = (await wh.list({ source })) as GridCellRecord[]
    for (const r of rows) {
      const v = r.attrs?.field_value
      if (typeof v === "number" && !Number.isNaN(v)) {
        map.set(r.gridId, v)
      }
    }
    if (map.size > 0) break
  }
  return map
}

/** 某类约束场是否已入库 */
export async function fieldSourceAvailable(sources: string[]): Promise<boolean> {
  const wh = getWarehouse()
  for (const source of sources) {
    const rows = (await wh.list({ source })) as GridCellRecord[]
    if (rows.some((r) => typeof r.attrs?.field_value === "number")) return true
  }
  return false
}

export type CorridorResult = {
  path: string[]
  blocked: string[]
  feasible: number
  level: number
  reason: string
}

/**
 * 在 start/goal 所在层级的包围区域内做约束过滤 + A*。
 */
export async function runAssaultCorridor(
  start: string,
  goal: string,
  options: CorridorRunOptions = {}
): Promise<CorridorResult> {
  const constraints = { ...DEFAULT_CORRIDOR, ...options.constraints }
  const enabled = { ...DEFAULT_TOGGLES, ...options.enabled }
  const diagonal = options.diagonal ?? true

  const level = geosot.toId(start).level
  if (geosot.toId(goal).level !== level) {
    throw new Error("起终点须为同一层级网格")
  }

  const bb0 = geosot.bboxFromCode(start)
  const bb1 = geosot.bboxFromCode(goal)
  const pad = Math.max(bb0.east - bb0.west, bb0.north - bb0.south) * 2
  const bbox = {
    west: Math.min(bb0.west, bb1.west) - pad,
    south: Math.min(bb0.south, bb1.south) - pad,
    east: Math.max(bb0.east, bb1.east) + pad,
    north: Math.max(bb0.north, bb1.north) + pad,
  }
  const universe = cover.coverBBox(bbox, level)

  const elev = enabled.elevation ? await loadFieldMap(ELEV_SOURCES) : new Map()
  const wind = enabled.wind ? await loadFieldMap(WIND_SOURCES) : new Map()
  const em = enabled.em ? await loadFieldMap(EM_SOURCES) : new Map()
  const radar = enabled.radar ? await loadFieldMap(RADAR_SOURCES) : new Map()

  const blocked = new Set<string>()
  for (const code of universe) {
    if (enabled.elevation) {
      const z = elev.get(code)
      if (z != null && z > constraints.maxElevation) {
        blocked.add(code)
        continue
      }
    }
    if (enabled.wind) {
      const w = wind.get(code)
      if (w != null && w > constraints.maxWind) {
        blocked.add(code)
        continue
      }
    }
    if (enabled.em) {
      const e = em.get(code)
      if (e != null && e > constraints.maxEm) {
        blocked.add(code)
        continue
      }
    }
    if (enabled.radar) {
      const r = radar.get(code)
      if (r != null && r > constraints.maxRadar) {
        blocked.add(code)
      }
    }
  }

  const path = gridPath.findPath(start, goal, {
    diagonal,
    isBlocked: (c) => blocked.has(c),
    maxExpand: 80_000,
  })

  if (!path) {
    return {
      path: [],
      blocked: [...blocked],
      feasible: universe.length - blocked.size,
      level,
      reason: "无可行航线通路（约束过严或起终点被阻断）",
    }
  }

  return {
    path,
    blocked: [...blocked],
    feasible: universe.length - blocked.size,
    level,
    reason: `航线通路 ${path.length} 格 · 禁行 ${blocked.size} · 可行 ${universe.length - blocked.size} · A*`,
  }
}

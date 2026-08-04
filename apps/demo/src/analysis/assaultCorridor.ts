/**
 * 空中突击通道（论证级）：
 * 综合高程 / 风速 / 电磁 / 雷达场 + 禁飞硬拦，在可行格上 A* 求路径。
 */
import { path as gridPath, cover, geosot } from "@dggs/grid-core"
import type { GridCellRecord } from "@dggs/grid-ingest"
import { getWarehouse } from "@/data/warehouseBoot"
import {
  listDrawnFieldSources,
  loadHardBlockCodes,
} from "@/data/drawnData"

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
  /** 禁飞 / 禁入空域（hard_block） */
  nofly: boolean
}

export type CorridorRunOptions = {
  constraints?: CorridorConstraints
  enabled?: Partial<ConstraintToggles>
  diagonal?: boolean
}

export const DEFAULT_CORRIDOR: CorridorConstraints = {
  maxElevation: 3000,
  maxWind: 40,
  maxEm: -40,
  maxRadar: -20,
}

export const DEFAULT_TOGGLES: ConstraintToggles = {
  elevation: true,
  wind: true,
  em: true,
  radar: true,
  nofly: true,
}

export const ELEV_SOURCES = ["elevation_dem_glo30", "elevation", "dem_glo30"]
export const WIND_SOURCES = ["wind_speed"]
export const EM_SOURCES = ["em_intensity"]
export const RADAR_SOURCES = ["radar_coverage"]

/** 多源合并：后出现的 source 覆盖同格（手绘区压过预置场） */
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
  }
  return map
}

async function resolveFieldSources(
  base: string[],
  kind: "em" | "radar" | "wind" | "elevation"
): Promise<string[]> {
  const drawn = await listDrawnFieldSources(kind)
  return [...base, ...drawn]
}

/** 某类约束场是否已入库（含手绘场） */
export async function fieldSourceAvailable(sources: string[]): Promise<boolean> {
  const wh = getWarehouse()
  for (const source of sources) {
    const rows = (await wh.list({ source })) as GridCellRecord[]
    if (rows.some((r) => typeof r.attrs?.field_value === "number")) return true
  }
  return false
}

export async function noflySourceAvailable(): Promise<boolean> {
  const codes = await loadHardBlockCodes()
  return codes.size > 0
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

  const elevSources = enabled.elevation
    ? await resolveFieldSources(ELEV_SOURCES, "elevation")
    : []
  const windSources = enabled.wind
    ? await resolveFieldSources(WIND_SOURCES, "wind")
    : []
  const emSources = enabled.em
    ? await resolveFieldSources(EM_SOURCES, "em")
    : []
  const radarSources = enabled.radar
    ? await resolveFieldSources(RADAR_SOURCES, "radar")
    : []

  const elev = elevSources.length ? await loadFieldMap(elevSources) : new Map()
  const wind = windSources.length ? await loadFieldMap(windSources) : new Map()
  const em = emSources.length ? await loadFieldMap(emSources) : new Map()
  const radar = radarSources.length
    ? await loadFieldMap(radarSources)
    : new Map()

  const hardBlocks =
    enabled.nofly !== false ? await loadHardBlockCodes() : new Set<string>()

  const blocked = new Set<string>()
  for (const code of universe) {
    if (hardBlocks.has(code)) {
      blocked.add(code)
      continue
    }
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
      reason: "无可行突击通道（约束过严或起终点被阻断）",
    }
  }

  const active: string[] = []
  if (enabled.nofly !== false && hardBlocks.size > 0) active.push("禁飞")
  if (enabled.elevation) active.push("地形")
  if (enabled.wind) active.push("气象")
  if (enabled.em) active.push("电磁")
  if (enabled.radar) active.push("雷达")

  return {
    path,
    blocked: [...blocked],
    feasible: universe.length - blocked.size,
    level,
    reason: `突击通道 ${path.length} 格 · 禁行 ${blocked.size} · 可行 ${universe.length - blocked.size} · 约束[${active.join("+") || "无"}]`,
  }
}

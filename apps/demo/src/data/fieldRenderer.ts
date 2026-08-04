/**
 * 场数据渲染器 —— 按类型色带 + 透明度生成 code→color 映射
 */
import { getWarehouse } from "./warehouseBoot"
import type { GridCellRecord } from "@dggs/grid-ingest"
import { useAppStore, type FieldStyleConfig } from "@/state/store"

/** 色带定义 */
export interface ColorRamp {
  name: string
  stops: { value: number; color: [number, number, number] }[]
}

/** 可选色带预设（按 id 选择） */
export const RAMP_PRESETS: Record<string, ColorRamp> = {
  default: {
    name: "默认",
    stops: [
      { value: 0, color: [0, 0, 180] },
      { value: 0.3, color: [0, 200, 200] },
      { value: 0.6, color: [0, 200, 0] },
      { value: 0.85, color: [255, 200, 0] },
      { value: 1, color: [220, 30, 30] },
    ],
  },
  temperature: {
    name: "温度",
    stops: [
      { value: 0, color: [0, 0, 180] },
      { value: 0.25, color: [0, 180, 180] },
      { value: 0.5, color: [0, 200, 0] },
      { value: 0.75, color: [255, 200, 0] },
      { value: 1, color: [220, 30, 30] },
    ],
  },
  pressure: {
    name: "气压",
    stops: [
      { value: 0, color: [40, 0, 120] },
      { value: 0.3, color: [70, 70, 220] },
      { value: 0.6, color: [130, 200, 255] },
      { value: 1, color: [255, 255, 255] },
    ],
  },
  wind_speed: {
    name: "风速",
    stops: [
      { value: 0, color: [220, 240, 255] },
      { value: 0.3, color: [100, 180, 255] },
      { value: 0.6, color: [30, 80, 220] },
      { value: 0.85, color: [120, 0, 180] },
      { value: 1, color: [200, 30, 30] },
    ],
  },
  water_temp: {
    name: "水文",
    stops: [
      { value: 0, color: [0, 0, 150] },
      { value: 0.3, color: [0, 180, 220] },
      { value: 0.6, color: [50, 220, 150] },
      { value: 1, color: [180, 250, 100] },
    ],
  },
  flow_speed: {
    name: "流速",
    stops: [
      { value: 0, color: [200, 230, 255] },
      { value: 0.4, color: [50, 150, 255] },
      { value: 0.7, color: [0, 40, 200] },
      { value: 1, color: [0, 0, 80] },
    ],
  },
  em_intensity: {
    name: "电磁",
    stops: [
      { value: 0, color: [0, 0, 60] },
      { value: 0.3, color: [0, 100, 0] },
      { value: 0.6, color: [200, 200, 0] },
      { value: 1, color: [255, 0, 0] },
    ],
  },
  radar_coverage: {
    name: "雷达",
    stops: [
      { value: 0, color: [0, 0, 80] },
      { value: 0.25, color: [0, 60, 180] },
      { value: 0.5, color: [0, 180, 100] },
      { value: 0.75, color: [220, 220, 0] },
      { value: 1, color: [255, 80, 0] },
    ],
  },
  magnetic_field: {
    name: "磁场",
    stops: [
      { value: 0, color: [0, 0, 200] },
      { value: 0.5, color: [255, 255, 255] },
      { value: 1, color: [200, 0, 0] },
    ],
  },
  elevation: {
    name: "地形",
    stops: [
      { value: 0, color: [40, 140, 40] },
      { value: 0.3, color: [140, 200, 60] },
      { value: 0.5, color: [220, 200, 100] },
      { value: 0.7, color: [180, 140, 80] },
      { value: 0.85, color: [220, 200, 180] },
      { value: 1, color: [250, 250, 250] },
    ],
  },
}

export function listRampPresets(): { id: string; name: string; ramp: ColorRamp }[] {
  return Object.entries(RAMP_PRESETS).map(([id, ramp]) => ({
    id,
    name: ramp.name,
    ramp,
  }))
}

export function defaultFieldStyle(source: string): FieldStyleConfig {
  // 去掉 semantic: 前缀再匹配，避免误用
  const raw = source.startsWith("semantic:")
    ? source.slice("semantic:".length)
    : source
  const s = raw.toLowerCase()
  if (raw in RAMP_PRESETS) {
    return { rampId: raw, opacity: 75 }
  }
  if (s in RAMP_PRESETS) {
    return { rampId: s, opacity: 75 }
  }
  if (/elev|dem|terrain|height|高程|地形|dtm|dsm/.test(s)) {
    return { rampId: "elevation", opacity: 80 }
  }
  if (/temp|气温|温度/.test(s)) {
    return { rampId: "temperature", opacity: 75 }
  }
  if (/wind|风速/.test(s)) {
    return { rampId: "wind_speed", opacity: 75 }
  }
  if (/press|气压/.test(s)) {
    return { rampId: "pressure", opacity: 75 }
  }
  if (/radar|雷达/.test(s)) {
    return { rampId: "radar_coverage", opacity: 70 }
  }
  if (/em_|电磁/.test(s)) {
    return { rampId: "em_intensity", opacity: 75 }
  }
  if (/water|水文|潮/.test(s)) {
    return { rampId: "water_temp", opacity: 75 }
  }
  return { rampId: "default", opacity: 75 }
}

export function resolveFieldStyle(source: string): FieldStyleConfig {
  const saved = useAppStore.getState().fieldStyles[source]
  const base = defaultFieldStyle(source)
  return {
    rampId: saved?.rampId && saved.rampId in RAMP_PRESETS ? saved.rampId : base.rampId,
    opacity: saved?.opacity ?? base.opacity,
  }
}

export function getRampById(rampId: string): ColorRamp {
  return RAMP_PRESETS[rampId] ?? RAMP_PRESETS.default
}

/** @deprecated 使用 getRampById / resolveFieldStyle */
export function getRamp(source: string): ColorRamp {
  return getRampById(resolveFieldStyle(source).rampId)
}

/**
 * 从仓库中查询指定数据源的场数据记录，构建 code→color 映射
 */
export async function computeFieldColorMap(
  sources: string[]
): Promise<Record<string, Map<string, string>>> {
  const wh = getWarehouse()
  if (!wh) return {}

  const result: Record<string, Map<string, string>> = {}

  for (const source of sources) {
    const records = (await wh.list({ source })) as GridCellRecord[]
    const style = resolveFieldStyle(source)
    const ramp = getRampById(style.rampId)

    const values: { code: string; value: number }[] = []
    for (const r of records) {
      const fv = r.attrs?.field_value
      if (typeof fv === "number" && !isNaN(fv)) {
        values.push({ code: r.gridId, value: fv })
      }
    }

    if (values.length === 0) {
      result[source] = new Map()
      continue
    }

    let min = Infinity
    let max = -Infinity
    for (const { value } of values) {
      if (value < min) min = value
      if (value > max) max = value
    }

    const colorMap = new Map<string, string>()
    if (min === max) {
      const c = rampColor(ramp, 0.5)
      for (const { code } of values) colorMap.set(code, c)
    } else {
      for (const { code, value } of values) {
        const t = (value - min) / (max - min)
        colorMap.set(code, rampColor(ramp, t))
      }
    }
    result[source] = colorMap
  }

  return result
}

/** 从色带中按 t ∈ [0,1] 取色，返回 CSS hex */
export function rampColor(ramp: ColorRamp, t: number): string {
  const stops = ramp.stops
  if (stops.length === 0) return "#888888"
  if (stops.length === 1) {
    const [r, g, b] = stops[0].color
    return rgbToHex(r, g, b)
  }

  let i = 0
  for (let j = 0; j < stops.length; j++) {
    if (stops[j].value > t) break
    i = j
  }

  if (i >= stops.length - 1) {
    const [r, g, b] = stops[stops.length - 1].color
    return rgbToHex(r, g, b)
  }

  const a = stops[i]
  const b = stops[i + 1]
  const localT = (t - a.value) / (b.value - a.value)
  const r = Math.round(a.color[0] + (b.color[0] - a.color[0]) * localT)
  const g = Math.round(a.color[1] + (b.color[1] - a.color[1]) * localT)
  const bl = Math.round(a.color[2] + (b.color[2] - a.color[2]) * localT)
  return rgbToHex(r, g, bl)
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, v))
  return `#${((1 << 24) | (clamp(r) << 16) | (clamp(g) << 8) | clamp(b)).toString(16).slice(1)}`
}

/** CSS linear-gradient 预览 */
export function rampGradientCss(ramp: ColorRamp): string {
  const parts = ramp.stops.map((s) => {
    const [r, g, b] = s.color
    return `${rgbToHex(r, g, b)} ${Math.round(s.value * 100)}%`
  })
  return `linear-gradient(90deg, ${parts.join(", ")})`
}

export async function getValueRange(
  source: string
): Promise<{ min: number; max: number } | null> {
  const wh = getWarehouse()
  if (!wh) return null

  const records = (await wh.list({ source })) as GridCellRecord[]
  let min = Infinity
  let max = -Infinity
  for (const r of records) {
    const fv = r.attrs?.field_value
    if (typeof fv === "number" && !isNaN(fv)) {
      if (fv < min) min = fv
      if (fv > max) max = fv
    }
  }
  if (min === Infinity) return null
  return { min, max }
}

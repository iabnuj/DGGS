/**
 * 选中格「另存为数据」：通用绘区入库（新建 / 追加上次图层）
 */
import { geosot } from "@dggs/grid-core"
import type { GridCellRecord } from "@dggs/grid-ingest"
import {
  getWarehouse,
  syncLayersFromWarehouse,
  refreshDataOverlay,
} from "@/data/warehouseBoot"
import { useAppStore } from "@/state/store"
import { getMapRuntime } from "@/map/useCesiumMap"

export type DrawnDataType = "region" | "nofly" | "em" | "radar" | "scalar"

export type DrawnPreset = {
  id: DrawnDataType
  label: string
  description: string
  /** 是否写入 field_value（场图层） */
  isField: boolean
  hardBlock: boolean
  fieldKind?: "em" | "radar" | "wind" | "elevation" | "scalar"
  unit?: string
  defaultValue?: number
  valueLabel?: string
  rampId?: string
  defaultName: string
}

export const DRAWN_PRESETS: DrawnPreset[] = [
  {
    id: "region",
    label: "普通区域",
    description: "矢量格集合，可参与选格/布尔等",
    isField: false,
    hardBlock: false,
    defaultName: "手绘区域",
  },
  {
    id: "nofly",
    label: "禁飞 / 禁入",
    description: "硬禁行，突击通道不可穿越",
    isField: false,
    hardBlock: true,
    defaultName: "禁飞区",
  },
  {
    id: "em",
    label: "电磁威胁",
    description: "标量场，参与电磁约束",
    isField: true,
    hardBlock: false,
    fieldKind: "em",
    unit: "dBm",
    defaultValue: -30,
    valueLabel: "电磁强度",
    rampId: "em_intensity",
    defaultName: "电磁威胁区",
  },
  {
    id: "radar",
    label: "雷达覆盖",
    description: "标量场，参与雷达约束",
    isField: true,
    hardBlock: false,
    fieldKind: "radar",
    unit: "dB",
    defaultValue: 0,
    valueLabel: "雷达回波",
    rampId: "radar_coverage",
    defaultName: "雷达覆盖区",
  },
  {
    id: "scalar",
    label: "自定义标量",
    description: "通用场值，可配置色带显示",
    isField: true,
    hardBlock: false,
    fieldKind: "scalar",
    unit: "",
    defaultValue: 1,
    valueLabel: "场值",
    rampId: "default",
    defaultName: "自定义场",
  },
]

export function getDrawnPreset(id: DrawnDataType): DrawnPreset {
  return DRAWN_PRESETS.find((p) => p.id === id) ?? DRAWN_PRESETS[0]!
}

function slugSource(name: string, drawnType: DrawnDataType): string {
  const base = name
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\w\u4e00-\u9fff-]+/g, "")
    .slice(0, 40)
  const stamp = Date.now().toString(36).slice(-4)
  return `drawn_${drawnType}_${base || "layer"}_${stamp}`
}

function buildRecords(
  codes: string[],
  level: number,
  source: string,
  label: string,
  preset: DrawnPreset,
  fieldValue: number | undefined
): GridCellRecord[] {
  const unique = [...new Set(codes)]
  return unique.map((code) => {
    const lv = geosot.getLevel(code)
    const attrs: Record<string, string | number | boolean> = {
      drawn_type: preset.id,
      hard_block: preset.hardBlock,
    }
    if (preset.isField && typeof fieldValue === "number") {
      attrs.field_value = fieldValue
      if (preset.fieldKind) attrs.field_kind = preset.fieldKind
      if (preset.unit) attrs.unit = preset.unit
    }
    return {
      gridId: code,
      level: lv || level,
      source,
      featureId: "drawn",
      label,
      attrs,
    }
  })
}

export type SaveDrawnOptions = {
  codes: string[]
  level: number
  drawnType: DrawnDataType
  name: string
  fieldValue?: number
  mode: "create" | "append"
}

export type SaveDrawnResult = {
  source: string
  label: string
  drawnType: DrawnDataType
  cellCount: number
  mode: "create" | "append"
}

/** 将当前选中格另存为数据图层 */
export async function saveSelectionAsData(
  opts: SaveDrawnOptions
): Promise<SaveDrawnResult> {
  if (opts.codes.length === 0) throw new Error("没有可保存的网格")
  const preset = getDrawnPreset(opts.drawnType)
  const label = opts.name.trim() || preset.defaultName
  const store = useAppStore.getState()
  const last = store.lastDrawnSave

  let source: string
  let mode = opts.mode

  if (mode === "append") {
    if (!last || last.drawnType !== opts.drawnType) {
      const lastLabel = last
        ? getDrawnPreset(last.drawnType as DrawnDataType).label
        : ""
      throw new Error(
        last
          ? `上次图层类型为「${lastLabel}」，与当前不一致，请新建`
          : "尚无上次图层，请先新建"
      )
    }
    source = last.source
  } else {
    source = slugSource(label, opts.drawnType)
  }

  const fieldValue = preset.isField
    ? (opts.fieldValue ?? preset.defaultValue ?? 0)
    : undefined

  const records = buildRecords(
    opts.codes,
    opts.level,
    source,
    label,
    preset,
    fieldValue
  )

  const wh = getWarehouse()
  if (mode === "append") {
    // 同格覆盖：先删旧再写入（upsert 依赖 featureId=drawn）
    const prior = (await wh.list({ source })) as GridCellRecord[]
    const hit = prior.filter((r) => opts.codes.includes(r.gridId))
    if (hit.length && wh.delete) await wh.delete(hit)
  }
  await wh.put(records)

  await syncLayersFromWarehouse()
  store.patchLayer(source, {
    name: label,
    visible: true,
  })

  if (preset.isField) {
    store.addFieldSource(source)
    if (preset.rampId) {
      store.setFieldStyle(source, { rampId: preset.rampId, opacity: 72 })
    }
    getMapRuntime()?.rebuildFieldView?.()
  }

  await refreshDataOverlay()

  const result: SaveDrawnResult = {
    source,
    label,
    drawnType: opts.drawnType,
    cellCount: records.length,
    mode,
  }
  store.setLastDrawnSave({
    source,
    label,
    drawnType: opts.drawnType,
  })
  store.setStatusText(
    mode === "append"
      ? `已追加 ${records.length} 格 →「${label}」`
      : `已新建图层「${label}」· ${records.length} 格`
  )
  return result
}

/** 仓库中带 hard_block 的格码 */
export async function loadHardBlockCodes(): Promise<Set<string>> {
  const wh = getWarehouse()
  const rows = (await wh.list()) as GridCellRecord[]
  const set = new Set<string>()
  for (const r of rows) {
    if (r.attrs?.hard_block === true) set.add(r.gridId)
  }
  return set
}

/** 按 field_kind 收集手绘场 source（后写入覆盖） */
export async function listDrawnFieldSources(
  kind: "em" | "radar" | "wind" | "elevation" | "scalar"
): Promise<string[]> {
  const wh = getWarehouse()
  const rows = (await wh.list()) as GridCellRecord[]
  const set = new Set<string>()
  for (const r of rows) {
    if (r.attrs?.field_kind === kind && typeof r.attrs?.field_value === "number") {
      set.add(r.source)
    }
  }
  return [...set]
}

import type { GridCellRecord, Attrs, CellFragment } from "./types"

/** 场数据点的输入格式 */
export type FieldDataPoint = {
  code: string
  value: number
}

/** 场数据记录的元信息 */
export type FieldIngestMeta = {
  source: string
  level: number
  /** 场数据名称（人类可读） */
  label?: string
  /** 单位 */
  unit?: string
  /** 时间戳 */
  time?: string
}

/**
 * 将场数据点数组转换为 GridCellRecord[]
 *
 * 每条记录的 attrs 中包含：
 * - field_value: 标量场值
 * - field_type: 场数据类型标识
 * - field_unit: 单位（如有）
 */
export function ingestFieldRecords(
  points: FieldDataPoint[],
  meta: FieldIngestMeta
): GridCellRecord[] {
  const attrs: Attrs = {
    field_value: 0,
    field_type: meta.source,
  }
  if (meta.unit) {
    attrs.field_unit = meta.unit
  }

  return points.map((p, i) => {
    const cellAttrs: Attrs = { ...attrs, field_value: p.value }
    const fragment: CellFragment = {
      kind: "vector",
      geometryType: "Point",
      coordinates: [p.code],
    }
    return {
      gridId: p.code,
      level: meta.level,
      time: meta.time,
      source: meta.source,
      featureId: `field_${i}`,
      label: meta.label ?? meta.source,
      attrs: cellAttrs,
      fragment,
    }
  })
}

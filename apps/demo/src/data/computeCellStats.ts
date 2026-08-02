/**
 * 网格数据集统计计算
 *
 * 从 GridCellRecord 数组中按 source 分组计算数值属性的 min/max/mean/variance。
 * 用于右侧面板展示"剖分立方格内全部数据的数理统计值"。
 */

import type { GridCellRecord } from "@dggs/grid-ingest"

export interface NumericStat {
  /** 最小值 */
  min: number
  /** 最大值 */
  max: number
  /** 均值 */
  mean: number
  /** 标准差 */
  std: number
  /** 样本数 */
  count: number
}

export interface SourceStats {
  source: string
  label: string
  /** 属性名 → 统计值 */
  stats: Record<string, NumericStat>
  recordCount: number
  cellCount: number
}

/** 从 GridCellRecord[] 计算统计。按 source 分组，提取数值属性。 */
export function computeCellStats(records: GridCellRecord[]): SourceStats[] {
  // 按 source 分组
  const groups = new Map<string, GridCellRecord[]>()
  for (const r of records) {
    const existing = groups.get(r.source) ?? []
    existing.push(r)
    groups.set(r.source, existing)
  }

  const results: SourceStats[] = []

  for (const [source, recs] of groups) {
    const stats: Record<string, NumericStat> = {}
    const uniqueCells = new Set(recs.map((r) => r.gridId)).size

    // 收集所有属性键
    const attrKeys = new Set<string>()
    for (const r of recs) {
      for (const [k, v] of Object.entries(r.attrs)) {
        if (typeof v === "number" && isFinite(v)) {
          attrKeys.add(k)
        }
      }
    }

    for (const key of attrKeys) {
      const values = recs
        .map((r) => r.attrs[key])
        .filter((v): v is number => typeof v === "number" && isFinite(v))

      if (values.length < 2) {
        stats[key] = {
          min: values[0] ?? 0,
          max: values[0] ?? 0,
          mean: values[0] ?? 0,
          std: 0,
          count: values.length,
        }
        continue
      }

      const min = Math.min(...values)
      const max = Math.max(...values)
      const mean = values.reduce((a, b) => a + b, 0) / values.length
      const variance =
        values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length
      const std = Math.sqrt(variance)

      stats[key] = { min, max, mean, std, count: values.length }
    }

    results.push({
      source,
      label: recs[0]?.label ?? source,
      stats,
      recordCount: recs.length,
      cellCount: uniqueCells,
    })
  }

  return results
}

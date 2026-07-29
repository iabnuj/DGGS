import { algebra, geosot } from "@dggs/grid-core"
import type { GridCellRecord } from "@dggs/grid-ingest"
import type { GridSet } from "@/state/store"

export type AnalysisKind = "intersect" | "aggregate" | "buffer"

export type AnalysisResult =
  | {
      kind: "intersect"
      conflicts: { gridId: string; label?: string }[]
    }
  | {
      kind: "aggregate"
      cellCount: number
      metrics: { key: string; value: number | string }[]
      buckets: { name: string; count: number }[]
    }
  | {
      kind: "buffer"
      centerCode: string
      radiusM: number
      codes: string[]
    }

export type AnalysisContext = {
  gridSet: GridSet | null
  records: GridCellRecord[]
  obstacleSource?: string
  bufferRadiusM: number
}

/** Approx cell width in meters at given level (equator heuristic). */
export function cellSizeMeters(level: number): number {
  const deg = 180 / 2 ** level
  return deg * 110_574
}

export function intersectGrids(
  queryCodes: string[],
  obstacleRecords: GridCellRecord[]
): AnalysisResult {
  const obstacles = new Set(obstacleRecords.map((r) => r.gridId))
  const conflicts: { gridId: string; label?: string }[] = []
  const seen = new Set<string>()
  for (const code of queryCodes) {
    if (!obstacles.has(code) || seen.has(code)) continue
    seen.add(code)
    const rec = obstacleRecords.find((r) => r.gridId === code)
    conflicts.push({ gridId: code, label: rec?.label })
  }
  return { kind: "intersect", conflicts }
}

export function aggregateGrids(
  codes: string[],
  records: GridCellRecord[]
): AnalysisResult {
  const codeSet = new Set(codes)
  const hits = records.filter((r) => codeSet.has(r.gridId))
  const bySource = new Map<string, number>()
  let windSum = 0
  let windN = 0
  let heightSum = 0
  let heightN = 0

  for (const r of hits) {
    bySource.set(r.source, (bySource.get(r.source) ?? 0) + 1)
    const wind = r.attrs?.wind
    if (typeof wind === "string") {
      const m = wind.match(/([\d.]+)\s*m\/s/i)
      if (m) {
        windSum += Number(m[1])
        windN++
      }
    }
    const h = r.attrs?.height ?? r.attrs?.building_h ?? r.attrs?.confidence
    if (typeof h === "number") {
      heightSum += h
      heightN++
    }
  }

  const metrics: { key: string; value: number | string }[] = [
    { key: "覆盖网格", value: codes.length },
    { key: "命中记录", value: hits.length },
  ]
  if (windN > 0) metrics.push({ key: "平均风速", value: `${(windSum / windN).toFixed(1)} m/s` })
  if (heightN > 0) metrics.push({ key: "属性均值", value: (heightSum / heightN).toFixed(2) })

  const buckets = [...bySource.entries()].map(([name, count]) => ({ name, count }))

  return { kind: "aggregate", cellCount: codes.length, metrics, buckets }
}

export function bufferGrid(centerCode: string, radiusM: number): AnalysisResult {
  const level = geosot.getLevel(centerCode)
  const size = cellSizeMeters(level)
  const rings = Math.max(0, Math.ceil(radiusM / size))
  const codes = new Set<string>([centerCode])
  let frontier = [centerCode]
  for (let r = 0; r < rings; r++) {
    const next: string[] = []
    for (const c of frontier) {
      for (const n of algebra.neighbors(c, { diagonal: true })) {
        if (!codes.has(n)) {
          codes.add(n)
          next.push(n)
        }
      }
    }
    frontier = next
    if (frontier.length === 0) break
  }
  return {
    kind: "buffer",
    centerCode,
    radiusM,
    codes: [...codes],
  }
}

export function runAnalysis(
  kind: AnalysisKind,
  ctx: AnalysisContext
): AnalysisResult | null {
  const gs = ctx.gridSet
  if (!gs || gs.codes.length === 0) return null

  if (kind === "intersect") {
    const src = ctx.obstacleSource ?? "alert"
    const obstacles = ctx.records.filter((r) => r.source === src)
    return intersectGrids(gs.codes, obstacles)
  }
  if (kind === "aggregate") {
    return aggregateGrids(gs.codes, ctx.records)
  }
  if (kind === "buffer") {
    if (gs.from !== "pick" || gs.codes.length !== 1) return null
    return bufferGrid(gs.codes[0]!, ctx.bufferRadiusM)
  }
  return null
}

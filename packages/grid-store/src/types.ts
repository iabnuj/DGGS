import type { GridCellRecord } from "@dggs/grid-ingest"

export type { GridCellRecord }

/** Optional filters applied by list / get* implementations. */
export type QueryOpts = {
  source?: string
  level?: number
  /** Inclusive ISO lower bound on record.time (records without time are skipped when set). */
  timeFrom?: string
  /** Inclusive ISO upper bound on record.time. */
  timeTo?: string
}

/**
 * Logical primary key for upsert identity:
 * (gridId, level, time?, source, featureId?)
 */
export function recordKey(r: GridCellRecord): string {
  return `${r.gridId}\0${r.level}\0${r.time ?? ""}\0${r.source}\0${r.featureId ?? ""}`
}

export function matchesQuery(r: GridCellRecord, opts?: QueryOpts): boolean {
  if (!opts) return true
  if (opts.source !== undefined && r.source !== opts.source) return false
  if (opts.level !== undefined && r.level !== opts.level) return false
  if (opts.timeFrom !== undefined || opts.timeTo !== undefined) {
    if (r.time === undefined) return false
    if (opts.timeFrom !== undefined && r.time < opts.timeFrom) return false
    if (opts.timeTo !== undefined && r.time > opts.timeTo) return false
  }
  return true
}

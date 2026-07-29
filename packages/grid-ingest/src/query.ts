import { algebra, geosot } from "@dggs/grid-core"
import type { GridCellRecord } from "./types"

/** Group records by exact gridId (same-cell multi-source overlay). */
export function groupByGrid(
  records: Iterable<GridCellRecord>
): Map<string, GridCellRecord[]> {
  const map = new Map<string, GridCellRecord[]>()
  for (const r of records) {
    const list = map.get(r.gridId)
    if (list) list.push(r)
    else map.set(r.gridId, [r])
  }
  return map
}

/**
 * Records that land on `code`, including parent/child roll-up matches
 * so a coarse pick still sees finer ingest rows (and vice versa).
 */
export function recordsForCell(
  records: GridCellRecord[],
  code: string
): GridCellRecord[] {
  const level = geosot.getLevel(code)
  return records.filter((r) => {
    if (r.gridId === code) return true
    if (r.level > level) {
      try {
        return algebra.aggregate([r.gridId], level)[0] === code
      } catch {
        return false
      }
    }
    if (r.level < level) {
      try {
        return algebra.aggregate([code], r.level)[0] === r.gridId
      } catch {
        return false
      }
    }
    return false
  })
}

import { recordsForCell } from "@dggs/grid-ingest"
import type { GridCellRecord } from "@dggs/grid-ingest"
import { matchesQuery, recordKey, type QueryOpts } from "./types"
import type { GridWarehouse } from "./warehouse"

/** In-process Map warehouse — Demo / unit tests default. */
export class MemoryWarehouse implements GridWarehouse {
  private readonly rows = new Map<string, GridCellRecord>()

  async put(records: GridCellRecord[]): Promise<void> {
    for (const r of records) {
      this.rows.set(recordKey(r), { ...r, attrs: { ...r.attrs } })
    }
  }

  async getByCell(gridId: string, opts?: QueryOpts): Promise<GridCellRecord[]> {
    const all = [...this.rows.values()]
    return recordsForCell(all, gridId).filter((r) => matchesQuery(r, opts))
  }

  async getByPrefix(prefix: string, opts?: QueryOpts): Promise<GridCellRecord[]> {
    const out: GridCellRecord[] = []
    for (const r of this.rows.values()) {
      if (!r.gridId.startsWith(prefix)) continue
      if (!matchesQuery(r, opts)) continue
      out.push(r)
    }
    return out
  }

  async list(opts?: QueryOpts): Promise<GridCellRecord[]> {
    const out: GridCellRecord[] = []
    for (const r of this.rows.values()) {
      if (matchesQuery(r, opts)) out.push(r)
    }
    return out
  }

  async delete(records: GridCellRecord[]): Promise<void> {
    for (const r of records) this.rows.delete(recordKey(r))
  }

  async clear(): Promise<void> {
    this.rows.clear()
  }

  get size(): number {
    return this.rows.size
  }
}

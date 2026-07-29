import type { GridCellRecord } from "@dggs/grid-ingest"
import type { QueryOpts } from "./types"

/**
 * Pluggable grid warehouse. Engines (memory / file / Postgres…) all implement this.
 * Geometry is not stored — recover via @dggs/grid-core from gridId when needed.
 */
export interface GridWarehouse {
  /** Upsert by (gridId, level, time?, source). */
  put(records: GridCellRecord[]): Promise<void>

  /** Rows on this cell, including parent/child roll-up matches. */
  getByCell(gridId: string, opts?: QueryOpts): Promise<GridCellRecord[]>

  /** Rows whose gridId starts with prefix (coarse→fine drill aid). */
  getByPrefix(prefix: string, opts?: QueryOpts): Promise<GridCellRecord[]>

  /** Full scan with optional filters. */
  list(opts?: QueryOpts): Promise<GridCellRecord[]>

  /** Remove by primary key identity of each record. */
  delete?(records: GridCellRecord[]): Promise<void>

  /** Drop all rows (mainly for Memory / test). */
  clear?(): Promise<void>
}

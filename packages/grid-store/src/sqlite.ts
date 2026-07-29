import Database from "better-sqlite3"
import { recordsForCell } from "@dggs/grid-ingest"
import type { GridCellRecord } from "@dggs/grid-ingest"
import { matchesQuery, type QueryOpts } from "./types"
import type { GridWarehouse } from "./warehouse"

type Row = {
  grid_id: string
  level: number
  time: string
  source: string
  label: string | null
  attrs: string
}

/**
 * SQLite-backed warehouse (Node / Electron main). Import from `@dggs/grid-store/node`.
 */
export class SqliteWarehouse implements GridWarehouse {
  private readonly db: Database.Database

  constructor(dbPath: string) {
    this.db = new Database(dbPath)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS grid_records (
        grid_id TEXT NOT NULL,
        level INTEGER NOT NULL,
        time TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL,
        label TEXT,
        attrs TEXT NOT NULL,
        PRIMARY KEY (grid_id, level, time, source)
      );
      CREATE INDEX IF NOT EXISTS idx_grid_records_grid_id
        ON grid_records(grid_id);
    `)
  }

  close(): void {
    this.db.close()
  }

  private toRecord(row: Row): GridCellRecord {
    return {
      gridId: row.grid_id,
      level: row.level,
      time: row.time === "" ? undefined : row.time,
      source: row.source,
      label: row.label ?? undefined,
      attrs: JSON.parse(row.attrs) as GridCellRecord["attrs"],
    }
  }

  async put(records: GridCellRecord[]): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO grid_records (grid_id, level, time, source, label, attrs)
      VALUES (@grid_id, @level, @time, @source, @label, @attrs)
      ON CONFLICT(grid_id, level, time, source) DO UPDATE SET
        label = excluded.label,
        attrs = excluded.attrs
    `)
    const tx = this.db.transaction((rows: GridCellRecord[]) => {
      for (const r of rows) {
        stmt.run({
          grid_id: r.gridId,
          level: r.level,
          time: r.time ?? "",
          source: r.source,
          label: r.label ?? null,
          attrs: JSON.stringify(r.attrs ?? {}),
        })
      }
    })
    tx(records)
  }

  async getByCell(gridId: string, opts?: QueryOpts): Promise<GridCellRecord[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM grid_records
         WHERE grid_id = ?
            OR grid_id LIKE ? || '%'
            OR ? LIKE grid_id || '%'`
      )
      .all(gridId, gridId, gridId) as Row[]
    const all = rows.map((r) => this.toRecord(r))
    return recordsForCell(all, gridId).filter((r) => matchesQuery(r, opts))
  }

  async getByPrefix(prefix: string, opts?: QueryOpts): Promise<GridCellRecord[]> {
    const rows = this.db
      .prepare(`SELECT * FROM grid_records WHERE grid_id LIKE ? || '%'`)
      .all(prefix) as Row[]
    return rows.map((r) => this.toRecord(r)).filter((r) => matchesQuery(r, opts))
  }

  async list(opts?: QueryOpts): Promise<GridCellRecord[]> {
    const rows = this.db.prepare(`SELECT * FROM grid_records`).all() as Row[]
    return rows.map((r) => this.toRecord(r)).filter((r) => matchesQuery(r, opts))
  }

  async delete(records: GridCellRecord[]): Promise<void> {
    const stmt = this.db.prepare(
      `DELETE FROM grid_records WHERE grid_id = ? AND level = ? AND time = ? AND source = ?`
    )
    const tx = this.db.transaction((rows: GridCellRecord[]) => {
      for (const r of rows) {
        stmt.run(r.gridId, r.level, r.time ?? "", r.source)
      }
    })
    tx(records)
  }

  async clear(): Promise<void> {
    this.db.exec(`DELETE FROM grid_records`)
  }
}

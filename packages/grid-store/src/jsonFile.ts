import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import type { GridCellRecord } from "@dggs/grid-ingest"
import { MemoryWarehouse } from "./memory"
import type { QueryOpts } from "./types"
import type { GridWarehouse } from "./warehouse"

/**
 * JSON-file backed warehouse (Node only). Loads into memory, persists on put/delete/clear.
 * Import from `@dggs/grid-store/node` — not bundled into browser demos.
 */
export class JsonFileWarehouse implements GridWarehouse {
  private readonly mem = new MemoryWarehouse()
  private loaded = false

  constructor(private readonly filePath: string) {}

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return
    this.loaded = true
    try {
      const raw = await readFile(this.filePath, "utf8")
      const parsed = JSON.parse(raw) as GridCellRecord[]
      if (Array.isArray(parsed)) await this.mem.put(parsed)
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code !== "ENOENT") throw err
    }
  }

  private async persist(): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true })
    const rows = await this.mem.list()
    await writeFile(this.filePath, JSON.stringify(rows, null, 2), "utf8")
  }

  async put(records: GridCellRecord[]): Promise<void> {
    await this.ensureLoaded()
    await this.mem.put(records)
    await this.persist()
  }

  async getByCell(gridId: string, opts?: QueryOpts): Promise<GridCellRecord[]> {
    await this.ensureLoaded()
    return this.mem.getByCell(gridId, opts)
  }

  async getByPrefix(prefix: string, opts?: QueryOpts): Promise<GridCellRecord[]> {
    await this.ensureLoaded()
    return this.mem.getByPrefix(prefix, opts)
  }

  async list(opts?: QueryOpts): Promise<GridCellRecord[]> {
    await this.ensureLoaded()
    return this.mem.list(opts)
  }

  async delete(records: GridCellRecord[]): Promise<void> {
    await this.ensureLoaded()
    await this.mem.delete(records)
    await this.persist()
  }

  async clear(): Promise<void> {
    await this.ensureLoaded()
    await this.mem.clear()
    await this.persist()
  }
}

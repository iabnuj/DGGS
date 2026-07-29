import type { GridCellRecord } from "@dggs/grid-ingest"
import type { GridWarehouse, QueryOpts } from "@dggs/grid-store"

type DesktopApi = {
  isDesktop: true
  warehouse: {
    put(records: GridCellRecord[]): Promise<void>
    getByCell(gridId: string, opts?: QueryOpts): Promise<GridCellRecord[]>
    getByPrefix(prefix: string, opts?: QueryOpts): Promise<GridCellRecord[]>
    list(opts?: QueryOpts): Promise<GridCellRecord[]>
    delete(records: GridCellRecord[]): Promise<void>
    clear(): Promise<void>
  }
  openJson(): Promise<void>
  saveJson(): Promise<void>
  pickImportFile(): Promise<{ name: string; text: string } | null>
  onDataChanged(handler: (payload: { reason: string }) => void): () => void
}

declare global {
  interface Window {
    dggsDesktop?: DesktopApi
  }
}

export function isDesktopApp(): boolean {
  return Boolean(window.dggsDesktop?.isDesktop)
}

export function getDesktopApi(): DesktopApi | undefined {
  return window.dggsDesktop
}

/** Renderer-side GridWarehouse that proxies to Electron main SQLite. */
export class IpcWarehouse implements GridWarehouse {
  private api(): DesktopApi {
    const api = window.dggsDesktop
    if (!api) throw new Error("dggsDesktop API unavailable")
    return api
  }

  async put(records: GridCellRecord[]): Promise<void> {
    await this.api().warehouse.put(records)
  }

  async getByCell(gridId: string, opts?: QueryOpts): Promise<GridCellRecord[]> {
    return this.api().warehouse.getByCell(gridId, opts)
  }

  async getByPrefix(prefix: string, opts?: QueryOpts): Promise<GridCellRecord[]> {
    return this.api().warehouse.getByPrefix(prefix, opts)
  }

  async list(opts?: QueryOpts): Promise<GridCellRecord[]> {
    return this.api().warehouse.list(opts)
  }

  async delete(records: GridCellRecord[]): Promise<void> {
    await this.api().warehouse.delete(records)
  }

  async clear(): Promise<void> {
    await this.api().warehouse.clear()
  }
}

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
  pickImportFile(): Promise<{
    kind?: "geojson" | "raster" | "csv"
    name: string
    text?: string
    filePath?: string
    fromShapefile?: boolean
    convertVia?: "ogr2ogr" | "shpjs"
  } | null>
  probeRaster?(filePath: string): Promise<{
    filePath: string
    name: string
    bbox: { west: number; south: number; east: number; north: number }
    width: number
    height: number
    bands: number
    pixelSizeM: number
    suggestedLevel: number
    estimatedCells: number | null
    modality: "dem" | "ortho"
    reason: string
  }>
  ingestRaster?(payload: {
    filePath: string
    level: number
    source: string
    label?: string
  }): Promise<{
    count: number
    source: string
    level: number
    modality: string
    firstGridId: string | null
  }>
  readChipDataUrl?(chipUri: string): Promise<string>
  confirm?(opts: {
    title?: string
    message: string
    detail?: string
    type?: "none" | "info" | "error" | "question" | "warning"
  }): Promise<boolean>
  onDataChanged(handler: (payload: { reason: string }) => void): () => void
  onImportProgress?(
    handler: (payload: { progress: number }) => void
  ): () => void
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

/** Desktop native confirm (with app icon); falls back to window.confirm. */
export async function confirmAction(opts: {
  title?: string
  message: string
  detail?: string
}): Promise<boolean> {
  const api = getDesktopApi()
  if (api?.confirm) {
    return api.confirm({
      title: opts.title ?? "确认",
      message: opts.message,
      detail: opts.detail,
      type: "warning",
    })
  }
  const text = opts.detail
    ? `${opts.message}\n${opts.detail}`
    : opts.message
  return window.confirm(text)
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

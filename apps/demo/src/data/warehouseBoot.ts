import { MemoryWarehouse, type GridWarehouse } from "@dggs/grid-store"
import type { GridCellRecord } from "@dggs/grid-ingest"
import { getDesktopApi, IpcWarehouse, isDesktopApp } from "@/ipcWarehouse"
import { buildSampleRecords } from "@/sampleData"
import { layersFromRecords } from "@/data/ingestGeoJson"
import { useAppStore } from "@/state/store"

let warehouse: GridWarehouse | null = null

export function getWarehouse(): GridWarehouse {
  if (!warehouse) {
    warehouse = isDesktopApp() ? new IpcWarehouse() : new MemoryWarehouse()
  }
  return warehouse
}

export async function syncLayersFromWarehouse() {
  const rows = (await getWarehouse().list()) as GridCellRecord[]
  useAppStore.getState().setLayers(layersFromRecords(rows))
  return rows
}

export async function ensureSampleData(level = 12) {
  const wh = getWarehouse()
  const existing = await wh.list()
  if (existing.length === 0) {
    await wh.put(buildSampleRecords(level))
  }
  return syncLayersFromWarehouse()
}

export async function importRecords(
  records: GridCellRecord[],
  opts?: { replace?: boolean }
) {
  const wh = getWarehouse()
  useAppStore.getState().setImportProgress(10)
  if (opts?.replace) await wh.clear?.()
  useAppStore.getState().setImportProgress(40)
  await wh.put(records)
  useAppStore.getState().setImportProgress(90)
  await syncLayersFromWarehouse()
  useAppStore.getState().setImportProgress(100)
  window.setTimeout(() => useAppStore.getState().setImportProgress(null), 600)
}

export function watchDesktopDataChanged(onChange: () => void) {
  const api = getDesktopApi()
  if (!api) return () => {}
  return api.onDataChanged(() => onChange())
}

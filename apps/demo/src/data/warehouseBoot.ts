import { MemoryWarehouse, type GridWarehouse } from "@dggs/grid-store"
import type { GridCellRecord } from "@dggs/grid-ingest"
import { getDesktopApi, IpcWarehouse, isDesktopApp } from "@/ipcWarehouse"
import { layersFromRecords } from "@/data/ingestGeoJson"
import {
  loadFeatureStoreFromLocalStorage,
  removeSourceFeatures,
} from "@/data/featureGeometryStore"
import { useAppStore } from "@/state/store"

/** Built-in demo sources we no longer seed; purge if still in the local DB. */
const LEGACY_SAMPLE_SOURCES = ["recon", "weather", "alert"] as const

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

/** Collect grid codes for currently visible data layers and paint them on the map. */
export async function refreshDataOverlay() {
  const layers = useAppStore.getState().layers.filter((l) => l.visible)
  const codes = new Set<string>()
  const wh = getWarehouse()
  for (const layer of layers) {
    const rows = (await wh.list({ source: layer.source })) as GridCellRecord[]
    for (const r of rows) codes.add(r.gridId)
  }
  const list = [...codes]
  useAppStore.getState().setDataOverlayCodes(list)

  // Prefer gridLayer directly — HMR can leave runtime without newer helper methods.
  const { getMapRuntime } = await import("@/map/useCesiumMap")
  const rt = getMapRuntime()
  const layerApi = rt?.gridLayer as
    | { applyDataOverlay?: (c: Iterable<string>, force?: boolean) => void }
    | undefined
  if (layerApi?.applyDataOverlay) {
    layerApi.applyDataOverlay(list, true)
  } else if (rt?.applyDataOverlay) {
    rt.applyDataOverlay(true)
  } else {
    useAppStore
      .getState()
      .setStatusText("地图未就绪：请重启桌面端后再点眼睛显示图层")
  }
  return list
}

/** Load warehouse layers (no built-in sample seed). */
export async function bootWarehouse() {
  loadFeatureStoreFromLocalStorage()
  const wh = getWarehouse()

  // One-shot cleanup of retired Beijing demo layers.
  for (const source of LEGACY_SAMPLE_SOURCES) {
    const rows = (await wh.list({ source })) as GridCellRecord[]
    if (rows.length && wh.delete) await wh.delete(rows)
    removeSourceFeatures(source)
  }

  await syncLayersFromWarehouse()
  await refreshDataOverlay()
  const { getMapRuntime } = await import("@/map/useCesiumMap")
  getMapRuntime()?.applyGisFeatures()
}

/** @deprecated use bootWarehouse */
export const ensureSampleData = bootWarehouse

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
  await refreshDataOverlay()
  const { getMapRuntime } = await import("@/map/useCesiumMap")
  getMapRuntime()?.applyGisFeatures()
  useAppStore.getState().setImportProgress(100)
  window.setTimeout(() => useAppStore.getState().setImportProgress(null), 600)
}

export async function deleteSourceLayer(source: string) {
  const wh = getWarehouse()
  const rows = (await wh.list({ source })) as GridCellRecord[]
  if (wh.delete) await wh.delete(rows)
  removeSourceFeatures(source)
  await syncLayersFromWarehouse()
  await refreshDataOverlay()
  const { getMapRuntime } = await import("@/map/useCesiumMap")
  getMapRuntime()?.applyGisFeatures()
}

export function watchDesktopDataChanged(onChange: () => void) {
  const api = getDesktopApi()
  if (!api) return () => {}
  return api.onDataChanged(() => onChange())
}

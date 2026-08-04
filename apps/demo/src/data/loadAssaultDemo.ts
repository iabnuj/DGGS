/**
 * 合静演训 · 空中突击通道一键态势包加载
 */
import { ingestFieldCsv } from "@dggs/grid-ingest"
import type { GridCellRecord } from "@dggs/grid-ingest"
import { algebra } from "@dggs/grid-core"
import {
  getWarehouse,
  syncLayersFromWarehouse,
  refreshDataOverlay,
} from "@/data/warehouseBoot"
import { ingestGeoJsonText } from "@/data/ingestGeoJson"
import {
  registerFromGeoJsonText as registerGis,
} from "@/data/featureGeometryStore"
import { flyToCode, getMapRuntime } from "@/map/useCesiumMap"
import { useAppStore } from "@/state/store"
import type {
  ConstraintToggles,
  CorridorConstraints,
} from "@/analysis/assaultCorridor"

export type AssaultManifest = {
  id: string
  title: string
  description: string
  level: number
  bbox: { west: number; south: number; east: number; north: number }
  startCode: string
  goalCode: string
  startLabel: string
  goalLabel: string
  unitsSource: string
  defaultTaskLevel: number
  constraints: CorridorConstraints
  toggles: ConstraintToggles
  fields: {
    file: string
    source: string
    displayName: string
    rampId: string
  }[]
  unitsDisplayName: string
  cameraHeight: number
}

const ASSAULT_UNITS = "assault_units"
const SITUATION_LABEL = "态势目标"

let cachedUnitsText: string | null = null
let cachedManifest: AssaultManifest | null = null

function demoBase(): string {
  const base = import.meta.env.BASE_URL || "/"
  return `${base}demo/assault/`
}

async function fetchText(file: string): Promise<string> {
  const res = await fetch(`${demoBase()}${file}`)
  if (!res.ok) throw new Error(`无法加载演示数据 ${file}（${res.status}）`)
  return res.text()
}

async function fetchJson<T>(file: string): Promise<T> {
  return JSON.parse(await fetchText(file)) as T
}

/** 按任务层级过滤部队格，写入态势叠加 + GIS 点 */
export async function applySituationTaskLevel(taskLevel: number) {
  useAppStore.getState().setSituationTaskLevel(taskLevel)
  const wh = getWarehouse()
  const rows = (await wh.list({ source: ASSAULT_UNITS })) as GridCellRecord[]
  if (rows.length === 0) {
    await refreshDataOverlay()
    return
  }

  const visible = rows.filter((r) => {
    const tl = r.attrs?.taskLevel
    return typeof tl === "number" ? tl <= taskLevel : true
  })
  const codes = [...new Set(visible.map((r) => r.gridId))]

  const next = useAppStore
    .getState()
    .analysisResults.filter((r) => r.label !== SITUATION_LABEL)
  if (codes.length > 0) {
    next.push({ codes, label: SITUATION_LABEL, color: "#38bdf8" })
  }
  useAppStore.getState().setAnalysisResults(next)
  getMapRuntime()?.applyAnalysisOverlays()

  if (cachedUnitsText) {
    try {
      const fc = JSON.parse(cachedUnitsText) as {
        type: string
        features: {
          properties?: { taskLevel?: number }
        }[]
      }
      const filtered = {
        ...fc,
        features: (fc.features ?? []).filter((f) => {
          const tl = f.properties?.taskLevel
          return typeof tl === "number" ? tl <= taskLevel : true
        }),
      }
      registerGis(ASSAULT_UNITS, JSON.stringify(filtered))
      useAppStore.getState().patchLayer(ASSAULT_UNITS, {
        featuresVisible: true,
        count: filtered.features.length,
      })
      getMapRuntime()?.applyGisFeatures()
    } catch {
      /* ignore */
    }
  }

  await refreshDataOverlay()
  useAppStore
    .getState()
    .setStatusText(
      `任务层级 ≤ L${taskLevel} · 可见态势 ${codes.length} 点（共 ${rows.length}）`
    )
}

/** 将当前选中格卷粗到任务层级（一次到位） */
export function coarsenSelectionToTaskLevel() {
  const s = useAppStore.getState()
  const gs = s.gridSet
  if (!gs?.codes.length) {
    s.setStatusText("请先选中网格再卷粗到任务层级")
    return
  }
  const toLevel = s.situationTaskLevel
  if (gs.level <= toLevel) {
    s.setStatusText(`选中已在 L${gs.level}，不粗于任务层级 L${toLevel}`)
    return
  }
  const codes = algebra.aggregate(gs.codes, toLevel)
  s.setGridSet({ codes, level: toLevel, from: gs.from })
  getMapRuntime()?.applyHighlights()
  s.setStatusText(`已卷粗到任务层级 L${toLevel} · ${codes.length} 格`)
}

export async function loadAssaultDemoPackage(): Promise<{
  manifest: AssaultManifest
}> {
  const manifest = await fetchJson<AssaultManifest>("manifest.json")
  cachedManifest = manifest
  const store = useAppStore.getState()
  store.setStatusText(`正在加载「${manifest.title}」…`)
  store.setImportProgress(5)

  const wh = getWarehouse()

  for (let i = 0; i < manifest.fields.length; i++) {
    const field = manifest.fields[i]!
    const text = await fetchText(field.file)
    const parsed = ingestFieldCsv(text, {
      source: field.source,
      level: manifest.level,
      label: field.displayName,
    })
    const prior = (await wh.list({ source: field.source })) as GridCellRecord[]
    if (prior.length && wh.delete) await wh.delete(prior)
    await wh.put(parsed.records)
    store.setImportProgress(
      10 + Math.round(((i + 1) / manifest.fields.length) * 50)
    )
  }

  const unitsText = await fetchText("units.geojson")
  cachedUnitsText = unitsText
  const unitRecords = ingestGeoJsonText(unitsText, {
    level: manifest.level,
    source: ASSAULT_UNITS,
    label: manifest.unitsDisplayName,
  })
  const priorU = (await wh.list({ source: ASSAULT_UNITS })) as GridCellRecord[]
  if (priorU.length && wh.delete) await wh.delete(priorU)
  await wh.put(unitRecords)
  registerGis(ASSAULT_UNITS, unitsText)

  await syncLayersFromWarehouse()

  for (const field of manifest.fields) {
    store.patchLayer(field.source, {
      name: field.displayName,
      visible: true,
    })
    store.addFieldSource(field.source)
    store.setFieldStyle(field.source, { rampId: field.rampId, opacity: 72 })
  }
  store.patchLayer(ASSAULT_UNITS, {
    name: manifest.unitsDisplayName,
    visible: true,
    featuresVisible: true,
  })

  store.setRouteStart(manifest.startCode)
  store.setRouteGoal(manifest.goalCode)
  store.setRoutePickMode(null)
  store.setSituationTaskLevel(manifest.defaultTaskLevel)
  // 保持自动调级：否则大视窗下仍按数据 L12 铺网会密成白纱
  store.setAutoLevel(true)

  getMapRuntime()?.rebuildFieldView?.()
  await applySituationTaskLevel(manifest.defaultTaskLevel)

  flyToCode(manifest.startCode, manifest.cameraHeight)
  store.setImportProgress(100)
  window.setTimeout(() => store.setImportProgress(null), 500)

  store.setStatusText(
    `已加载 ${manifest.title} · 起点「${manifest.startLabel}」→ 终点「${manifest.goalLabel}」· 可计算突击通道`
  )

  return { manifest }
}

export function getCachedAssaultManifest(): AssaultManifest | null {
  return cachedManifest
}

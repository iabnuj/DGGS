import { create } from "zustand"
import type { GridCellRecord } from "@dggs/grid-ingest"

export type ToolMode = "pan" | "pick" | "drawLine" | "drawPolygon"

/** 航线通路规划：地图点选写入起/终点 */
export type RoutePickMode = "start" | "goal" | null

export type GridSet = {
  codes: string[]
  level: number
  from: "pick" | "line" | "polygon"
}

export type DrawOptionsState = {
  showOutline: boolean
  showFaces: boolean
  showCode: boolean
  heightCount: number
  outlineColor: string
  fillColor: string
  highlightColor: string
  opacity: number
  codeColor: string
  codeOutlineColor: string
  codeFontSize: number
  codeBackground: boolean
  codeBgOpacity: number
  codeShort: boolean
}

export type CursorState = {
  lng: number | null
  lat: number | null
  gridCode: string | null
}

export type LayerInfo = {
  id: string
  name: string
  type: string
  count: number
  levelMin: number
  levelMax: number
  visible: boolean
  featuresVisible: boolean
  source: string
}

export type BasemapId = "osm" | "sat" | "dark"

export type AnalysisResult = {
  codes: string[]
  label: string
  color: string
}

/** 标量场按类型（source）的渲染样式 */
export type FieldStyleConfig = {
  /** RAMP_PRESETS 中的 id */
  rampId: string
  /** 0–100 */
  opacity: number
}

export function fragmentPreviewKey(r: GridCellRecord): string {
  return `${r.source}::${r.featureId ?? ""}::${r.gridId}`
}

type AppState = {
  gridVisible: boolean
  level: number
  autoLevel: boolean
  extrudeByAttr: boolean
  drawOptions: DrawOptionsState
  toolMode: ToolMode
  gridSet: GridSet | null
  cursor: CursorState
  statusText: string
  gridCount: number
  fps: number
  /** 底图 XYZ / WebMercator 瓦片显示层级 */
  tileZoom: number
  layers: LayerInfo[]
  dataOverlayCodes: string[]
  cellFragmentPreviews: GridCellRecord[]
  basemap: BasemapId
  terrain: boolean
  lighting: boolean
  importProgress: number | null
  leftPanelOpen: boolean
  rightPanelOpen: boolean
  adminOverlay: boolean

  // ---- 场数据源（自动渲染） ----
  fieldSources: string[]
  /** fieldData: 各场数据源的 colorMap，由渲染管线填充 */
  fieldColorMaps: Record<string, Map<string, string>>
  /** 按类型（source）的色带/透明度 */
  fieldStyles: Record<string, FieldStyleConfig>
  addFieldSource: (source: string) => void
  removeFieldSource: (source: string) => void
  clearFieldSources: () => void
  setFieldColorMaps: (maps: Record<string, Map<string, string>>) => void
  setFieldStyle: (source: string, patch: Partial<FieldStyleConfig>) => void

  // ---- 分析结果叠加 ----
  analysisResults: AnalysisResult[]
  setAnalysisResults: (v: AnalysisResult[]) => void
  clearAnalysisResults: () => void

  /** 布尔运算集合 A / B（编码列表） */
  analysisSetA: string[] | null
  analysisSetB: string[] | null
  setAnalysisSetA: (codes: string[] | null) => void
  setAnalysisSetB: (codes: string[] | null) => void

  /** 航线通路规划起终点与拾取模式 */
  routeStart: string | null
  routeGoal: string | null
  routePickMode: RoutePickMode
  setRouteStart: (code: string | null) => void
  setRouteGoal: (code: string | null) => void
  setRoutePickMode: (m: RoutePickMode) => void

  setGridVisible: (v: boolean) => void
  setLevel: (v: number) => void
  setAutoLevel: (v: boolean) => void
  setExtrudeByAttr: (v: boolean) => void
  setDrawOptions: (patch: Partial<DrawOptionsState>) => void
  setToolMode: (m: ToolMode) => void
  setGridSet: (g: GridSet | null) => void
  setCursor: (c: CursorState) => void
  setStatusText: (s: string) => void
  setGridCount: (n: number) => void
  setFps: (n: number) => void
  setTileZoom: (n: number) => void
  setLayers: (layers: LayerInfo[]) => void
  patchLayer: (id: string, patch: Partial<LayerInfo>) => void
  setDataOverlayCodes: (codes: string[]) => void
  toggleCellFragmentPreview: (r: GridCellRecord) => void
  /** Drop previews whose keys are in `keys`, then append `records`. */
  setCellFragmentPreviewsForKeys: (
    keys: Set<string>,
    records: GridCellRecord[]
  ) => void
  clearCellFragmentPreviews: () => void
  setBasemap: (b: BasemapId) => void
  setTerrain: (v: boolean) => void
  setLighting: (v: boolean) => void
  setImportProgress: (n: number | null) => void
  setLeftPanelOpen: (v: boolean) => void
  setRightPanelOpen: (v: boolean) => void
  toggleLeftPanel: () => void
  toggleRightPanel: () => void
  setAdminOverlay: (v: boolean) => void
}

export const useAppStore = create<AppState>((set) => ({
  gridVisible: true,
  level: 12,
  autoLevel: true,
  extrudeByAttr: false,
  drawOptions: {
    showOutline: true,
    showFaces: false,
    showCode: false,
    heightCount: 1,
    outlineColor: "#ffffff",
    fillColor: "#22c55e",
    highlightColor: "#ef4444",
    opacity: 100,
    codeColor: "#ffffff",
    codeOutlineColor: "#000000",
    codeFontSize: 13,
    codeBackground: true,
    codeBgOpacity: 45,
    codeShort: true,
  },
  toolMode: "pick",
  gridSet: null,
  cursor: { lng: null, lat: null, gridCode: null },
  statusText: "就绪",
  gridCount: 0,
  fps: 0,
  tileZoom: 0,
  layers: [],
  dataOverlayCodes: [],
  cellFragmentPreviews: [],
  basemap: "sat",
  terrain: false,
  lighting: false,
  importProgress: null,
  leftPanelOpen: true,
  rightPanelOpen: true,
  adminOverlay: true,

  // ---- 场数据源 ----
  fieldSources: [],
  fieldColorMaps: {},
  fieldStyles: {},
  addFieldSource: (source) =>
    set((s) => {
      if (s.fieldSources.includes(source)) {
        // 保持引用变化，便于订阅方在重导入后重建色斑
        return { fieldSources: [...s.fieldSources] }
      }
      return { fieldSources: [...s.fieldSources, source] }
    }),
  removeFieldSource: (source) =>
    set((s) => ({
      fieldSources: s.fieldSources.filter((f) => f !== source),
    })),
  clearFieldSources: () => set({ fieldSources: [], fieldColorMaps: {} }),
  setFieldColorMaps: (fieldColorMaps) => set({ fieldColorMaps }),
  setFieldStyle: (source, patch) =>
    set((s) => {
      const prev = s.fieldStyles[source] ?? {
        rampId: source,
        opacity: 75,
      }
      return {
        fieldStyles: {
          ...s.fieldStyles,
          [source]: {
            rampId: patch.rampId ?? prev.rampId,
            opacity: Math.max(
              5,
              Math.min(100, Math.round(patch.opacity ?? prev.opacity))
            ),
          },
        },
      }
    }),

  // ---- 分析结果叠加 ----
  analysisResults: [],
  setAnalysisResults: (analysisResults) => set({ analysisResults }),
  clearAnalysisResults: () => set({ analysisResults: [] }),

  analysisSetA: null,
  analysisSetB: null,
  setAnalysisSetA: (analysisSetA) => set({ analysisSetA }),
  setAnalysisSetB: (analysisSetB) => set({ analysisSetB }),

  routeStart: null,
  routeGoal: null,
  routePickMode: null,
  setRouteStart: (routeStart) => set({ routeStart }),
  setRouteGoal: (routeGoal) => set({ routeGoal }),
  setRoutePickMode: (routePickMode) => set({ routePickMode }),

  setGridVisible: (gridVisible) => set({ gridVisible }),
  setLevel: (level) => set({ level }),
  setAutoLevel: (autoLevel) => set({ autoLevel }),
  setExtrudeByAttr: (extrudeByAttr) => set({ extrudeByAttr }),
  setDrawOptions: (patch) =>
    set((s) => ({ drawOptions: { ...s.drawOptions, ...patch } })),
  setToolMode: (toolMode) => set({ toolMode }),
  setGridSet: (gridSet) =>
    set({
      gridSet,
      cellFragmentPreviews: [],
    }),
  setCursor: (cursor) => set({ cursor }),
  setStatusText: (statusText) => set({ statusText }),
  setGridCount: (gridCount) => set({ gridCount }),
  setFps: (fps) => set({ fps }),
  setTileZoom: (tileZoom) => set({ tileZoom }),
  setLayers: (layers) => set({ layers }),
  patchLayer: (id, patch) =>
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    })),
  setDataOverlayCodes: (dataOverlayCodes) => set({ dataOverlayCodes }),
  toggleCellFragmentPreview: (r) =>
    set((s) => {
      const key = fragmentPreviewKey(r)
      const exists = s.cellFragmentPreviews.some(
        (x) => fragmentPreviewKey(x) === key
      )
      return {
        cellFragmentPreviews: exists
          ? s.cellFragmentPreviews.filter((x) => fragmentPreviewKey(x) !== key)
          : [...s.cellFragmentPreviews, r],
      }
    }),
  setCellFragmentPreviewsForKeys: (keys, records) =>
    set((s) => ({
      cellFragmentPreviews: [
        ...s.cellFragmentPreviews.filter(
          (x) => !keys.has(fragmentPreviewKey(x))
        ),
        ...records,
      ],
    })),
  clearCellFragmentPreviews: () => set({ cellFragmentPreviews: [] }),
  setBasemap: (basemap) => set({ basemap }),
  setTerrain: (terrain) => set({ terrain }),
  setLighting: (lighting) => set({ lighting }),
  setImportProgress: (importProgress) => set({ importProgress }),
  setLeftPanelOpen: (leftPanelOpen) => set({ leftPanelOpen }),
  setRightPanelOpen: (rightPanelOpen) => set({ rightPanelOpen }),
  toggleLeftPanel: () => set((s) => ({ leftPanelOpen: !s.leftPanelOpen })),
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
  setAdminOverlay: (adminOverlay) => set({ adminOverlay }),
}))

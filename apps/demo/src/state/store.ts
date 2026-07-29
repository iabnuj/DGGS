import { create } from "zustand"
import type { AnalysisResult } from "@/analysis"

export type ToolMode = "pan" | "pick" | "drawLine" | "drawPolygon"

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
  /** Cyan grid-cell overlay for ingested codes. */
  visible: boolean
  /** Original GIS geometries (points/lines/polygons) on the map. */
  featuresVisible: boolean
  source: string
}

export type BasemapId = "osm" | "sat" | "dark"

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
  layers: LayerInfo[]
  /** 可见数据图层对应的入格编码（地图数据高亮） */
  dataOverlayCodes: string[]
  analysisResult: AnalysisResult | null
  bufferRadiusM: number
  basemap: BasemapId
  terrain: boolean
  lighting: boolean
  importProgress: number | null
  leftPanelOpen: boolean
  rightPanelOpen: boolean
  /** 是否在地图上高亮缓冲邻域（点选默认否，调半径/手动生成时为是） */
  bufferPreview: boolean
  /** 中文地名/路网注记叠加层 */
  adminOverlay: boolean
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
  setLayers: (layers: LayerInfo[]) => void
  patchLayer: (id: string, patch: Partial<LayerInfo>) => void
  setDataOverlayCodes: (codes: string[]) => void
  setAnalysisResult: (r: AnalysisResult | null) => void
  setBufferRadiusM: (n: number) => void
  setBasemap: (b: BasemapId) => void
  setTerrain: (v: boolean) => void
  setLighting: (v: boolean) => void
  setImportProgress: (n: number | null) => void
  setLeftPanelOpen: (v: boolean) => void
  setRightPanelOpen: (v: boolean) => void
  toggleLeftPanel: () => void
  toggleRightPanel: () => void
  setBufferPreview: (v: boolean) => void
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
  layers: [],
  dataOverlayCodes: [],
  analysisResult: null,
  bufferRadiusM: 500,
  basemap: "sat",
  terrain: false,
  lighting: false,
  importProgress: null,
  leftPanelOpen: true,
  rightPanelOpen: true,
  bufferPreview: false,
  adminOverlay: true,
  setGridVisible: (gridVisible) => set({ gridVisible }),
  setLevel: (level) => set({ level }),
  setAutoLevel: (autoLevel) => set({ autoLevel }),
  setExtrudeByAttr: (extrudeByAttr) => set({ extrudeByAttr }),
  setDrawOptions: (patch) =>
    set((s) => ({ drawOptions: { ...s.drawOptions, ...patch } })),
  setToolMode: (toolMode) => set({ toolMode }),
  setGridSet: (gridSet) => set({ gridSet, analysisResult: null, bufferPreview: false }),
  setCursor: (cursor) => set({ cursor }),
  setStatusText: (statusText) => set({ statusText }),
  setGridCount: (gridCount) => set({ gridCount }),
  setFps: (fps) => set({ fps }),
  setLayers: (layers) => set({ layers }),
  patchLayer: (id, patch) =>
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    })),
  setDataOverlayCodes: (dataOverlayCodes) => set({ dataOverlayCodes }),
  setAnalysisResult: (analysisResult) => set({ analysisResult }),
  setBufferRadiusM: (bufferRadiusM) => set({ bufferRadiusM }),
  setBasemap: (basemap) => set({ basemap }),
  setTerrain: (terrain) => set({ terrain }),
  setLighting: (lighting) => set({ lighting }),
  setImportProgress: (importProgress) => set({ importProgress }),
  setLeftPanelOpen: (leftPanelOpen) => set({ leftPanelOpen }),
  setRightPanelOpen: (rightPanelOpen) => set({ rightPanelOpen }),
  toggleLeftPanel: () => set((s) => ({ leftPanelOpen: !s.leftPanelOpen })),
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
  setBufferPreview: (bufferPreview) => set({ bufferPreview }),
  setAdminOverlay: (adminOverlay) => set({ adminOverlay }),
}))

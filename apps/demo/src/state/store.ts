import { create } from "zustand"
import type { GridCellRecord } from "@dggs/grid-ingest"

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
  visible: boolean
  featuresVisible: boolean
  source: string
}

export type BasemapId = "osm" | "sat" | "dark"

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

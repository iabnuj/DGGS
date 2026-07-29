import { useEffect, useRef } from "react"
import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  Math as CesiumMath,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  type Viewer,
} from "cesium"
import { geosot } from "@dggs/grid-core"
import { GridLayer } from "@/grid/gridLayer"
import { GisFeatureLayer } from "@/map/gisFeatureLayer"
import { levelFromHeight } from "@/grid/levelFromHeight"
import { createViewer } from "@/map/createViewer"
import { applyBasemap, applyAdminOverlay, applyLighting, applyTerrain } from "@/map/basemap"
import { useAppStore } from "@/state/store"
import {
  bindFinishActions,
  startDrawSession,
  type DrawSession,
} from "@/tools/drawSession"
import { lineToGridCodes, polygonToGridCodes } from "@/tools/geometryToGrid"
import {
  bootWarehouse,
  getWarehouse,
  watchDesktopDataChanged,
} from "@/data/warehouseBoot"
import { loadFeatureStoreFromLocalStorage } from "@/data/featureGeometryStore"
import { runAnalysis } from "@/analysis"
import type { GridCellRecord } from "@dggs/grid-ingest"

export type MapRuntime = {
  viewer: Viewer
  gridLayer: GridLayer
  refresh: (force?: boolean) => void
  /** Update pick/buffer highlights without rebuilding the viewport mesh. */
  applyHighlights: () => void
  /** Update imported data-layer overlay (eye toggles). */
  applyDataOverlay: (force?: boolean) => void
  /** Draw/hide original GIS feature geometries. */
  applyGisFeatures: () => void
}

let runtime: MapRuntime | null = null

export function getMapRuntime(): MapRuntime | null {
  return runtime
}

export function flyToCode(code: string, height = 40_000) {
  const rt = runtime
  if (!rt || rt.viewer.isDestroyed()) return
  const b = geosot.bboxFromCode(code)
  rt.viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(
      (b.west + b.east) / 2,
      (b.south + b.north) / 2,
      height
    ),
    duration: 0.8,
  })
}

export function resetChinaView() {
  const viewer = runtime?.viewer
  if (!viewer || viewer.isDestroyed()) return
  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(104.0, 35.0, 4_500_000),
    duration: 1.2,
  })
}

async function maybeAutoRunAnalysis() {
  const s = useAppStore.getState()
  const gs = s.gridSet
  if (!gs) return
  const records = (await getWarehouse().list()) as GridCellRecord[]
  const ctx = {
    gridSet: gs,
    records,
    bufferRadiusM: s.bufferRadiusM,
    obstacleSource: "alert",
  }

  // aggregate autoRun on polygon
  if (gs.from === "polygon") {
    const result = runAnalysis("aggregate", ctx)
    if (result) {
      useAppStore.getState().setAnalysisResult(result)
    }
    return
  }

  // buffer 预览：仅在已开启 bufferPreview 时随半径重算（点选本身不高亮邻域）
  if (gs.from === "pick" && gs.codes.length === 1 && s.bufferPreview) {
    const result = runAnalysis("buffer", ctx)
    if (result && result.kind === "buffer") {
      useAppStore.getState().setAnalysisResult(result)
      const rt = runtime
      if (rt && !rt.viewer.isDestroyed()) rt.applyHighlights()
    }
  }
}

export function useCesiumMap(containerId = "cesiumContainer") {
  const readyRef = useRef(false)
  const drawRef = useRef<DrawSession | null>(null)
  const finishHandlerRef = useRef<ScreenSpaceEventHandler | null>(null)

  useEffect(() => {
    const el = document.getElementById(containerId)
    if (!el || readyRef.current) return
    readyRef.current = true
    el.innerHTML = ""

    let cancelled = false
    const viewer = createViewer(el)
    const gridLayer = new GridLayer(viewer)
    const gisLayer = new GisFeatureLayer(viewer)
    loadFeatureStoreFromLocalStorage()

    const syncHighlights = () => {
      const s = useAppStore.getState()
      const analysis = s.analysisResult
      if (analysis?.kind === "buffer" && s.bufferPreview) {
        return analysis.codes
      }
      if (analysis?.kind === "intersect" && analysis.conflicts.length > 0) {
        return analysis.conflicts.map((c) => c.gridId)
      }
      if (s.gridSet && s.gridSet.codes.length > 0) {
        return s.gridSet.codes
      }
      return [] as string[]
    }

    const applyHighlights = () => {
      if (cancelled || viewer.isDestroyed()) return
      gridLayer.applyHighlights(syncHighlights())
    }

    const applyDataOverlay = (force = false) => {
      if (cancelled || viewer.isDestroyed()) return
      gridLayer.applyDataOverlay(useAppStore.getState().dataOverlayCodes, force)
    }

    const applyGisFeatures = () => {
      if (cancelled || viewer.isDestroyed()) return
      gisLayer.sync(useAppStore.getState().layers)
    }

    const refresh = (force = false) => {
      if (cancelled || viewer.isDestroyed()) return
      const s = useAppStore.getState()

      // Keep GridLayer.dataCodes in sync with Zustand (eye toggles write store first).
      gridLayer.applyDataOverlay(s.dataOverlayCodes, false)

      if (!s.gridVisible) {
        gridLayer.draw([])
        gridLayer.setHighlights([])
        if (s.gridCount !== 0) useAppStore.getState().setGridCount(0)
        if (s.statusText !== "网格已隐藏") {
          useAppStore.getState().setStatusText("网格已隐藏")
        }
        return
      }

      let level = s.level
      if (s.autoLevel) {
        const carto = Cartographic.fromCartesian(viewer.camera.positionWC)
        const next = levelFromHeight(carto.height)
        if (next !== s.level) useAppStore.getState().setLevel(next)
        level = next
      }

      gridLayer.setOptions({
        ...s.drawOptions,
        heightCount: s.extrudeByAttr ? Math.max(s.drawOptions.heightCount, 3) : 1,
        clampToGround: s.terrain,
      })

      try {
        const { count, truncated, skipped } = gridLayer.refresh(level, {
          force,
          highlights: syncHighlights(),
        })
        if (skipped) {
          // Skipped mesh rebuild still needs data overlay if eye just toggled.
          gridLayer.applyDataOverlay(
            useAppStore.getState().dataOverlayCodes,
            false
          )
          return
        }
        if (s.gridCount !== count) useAppStore.getState().setGridCount(count)
        const text = truncated
          ? `视窗过大，已降级 · L${level} · ${count} 格`
          : `L${level} · ${count} 格`
        if (useAppStore.getState().statusText !== text) {
          useAppStore.getState().setStatusText(text)
        }
      } catch (err) {
        useAppStore.getState().setStatusText(
          `刷新失败: ${err instanceof Error ? err.message : String(err)}`
        )
      }
    }

    runtime = {
      viewer,
      gridLayer,
      refresh,
      applyHighlights,
      applyDataOverlay,
      applyGisFeatures,
    }

    let refreshTimer: number | undefined
    const scheduleRefresh = () => {
      window.clearTimeout(refreshTimer)
      // Settle after pan/zoom; skip rebuild if view signature unchanged.
      refreshTimer = window.setTimeout(() => refresh(false), 320)
    }

    viewer.camera.moveEnd.addEventListener(scheduleRefresh)

    const clearDraw = () => {
      drawRef.current?.destroy()
      drawRef.current = null
      finishHandlerRef.current?.destroy()
      finishHandlerRef.current = null
    }

    const completeDraw = () => {
      const session = drawRef.current
      if (!session) return
      const pts = session.finish()
      clearDraw()
      if (!pts) {
        useAppStore.getState().setStatusText("顶点不足，已取消绘制")
        useAppStore.getState().setToolMode("pick")
        return
      }
      const level = useAppStore.getState().level
      const codes =
        session.kind === "line"
          ? lineToGridCodes(pts, level)
          : polygonToGridCodes(pts, level)
      useAppStore.getState().setGridSet({
        codes,
        level,
        from: session.kind === "line" ? "line" : "polygon",
      })
      useAppStore.getState().setToolMode("pick")
      useAppStore
        .getState()
        .setStatusText(
          `${session.kind === "line" ? "线" : "面"}覆盖 ${codes.length} 格`
        )
      refresh()
      void maybeAutoRunAnalysis()
    }

    const startDraw = (kind: "line" | "polygon") => {
      clearDraw()
      drawRef.current = startDrawSession(viewer, kind)
      finishHandlerRef.current = bindFinishActions(viewer, completeDraw)
      useAppStore
        .getState()
        .setStatusText(
          kind === "line"
            ? "画线：左键加点，右键/双击结束"
            : "画面：左键加点，右键/双击结束"
        )
    }

    const unsubTool = useAppStore.subscribe((state, prev) => {
      if (state.toolMode === prev.toolMode) return
      if (state.toolMode === "drawLine") startDraw("line")
      else if (state.toolMode === "drawPolygon") startDraw("polygon")
      else clearDraw()
    })

    const unsubBasemap = useAppStore.subscribe((state, prev) => {
      if (state.basemap !== prev.basemap) applyBasemap(viewer, state.basemap)
      if (state.adminOverlay !== prev.adminOverlay) {
        applyAdminOverlay(viewer, state.adminOverlay)
      }
      if (state.terrain !== prev.terrain) {
        void applyTerrain(viewer, state.terrain).then(() => {
          if (!cancelled && !viewer.isDestroyed()) refresh()
        })
      }
      if (state.lighting !== prev.lighting) applyLighting(viewer, state.lighting)
    })

    let bufferTimer: number | undefined
    const unsubBuffer = useAppStore.subscribe((state, prev) => {
      if (state.bufferRadiusM === prev.bufferRadiusM) return
      const gs = state.gridSet
      if (!gs || gs.from !== "pick" || gs.codes.length !== 1) return
      useAppStore.getState().setBufferPreview(true)
      window.clearTimeout(bufferTimer)
      bufferTimer = window.setTimeout(() => void maybeAutoRunAnalysis(), 120)
    })

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
    handler.setInputAction((movement: { endPosition: Cartesian2 }) => {
      const cartesian = viewer.camera.pickEllipsoid(
        movement.endPosition,
        viewer.scene.globe.ellipsoid
      )
      if (!cartesian) {
        useAppStore.getState().setCursor({ lng: null, lat: null, gridCode: null })
        return
      }
      const carto = Cartographic.fromCartesian(cartesian)
      const lng = CesiumMath.toDegrees(carto.longitude)
      const lat = CesiumMath.toDegrees(carto.latitude)
      const level = useAppStore.getState().level
      const gridCode = geosot.locToQuaternary(lng, lat, level)
      useAppStore.getState().setCursor({ lng, lat, gridCode })
    }, ScreenSpaceEventType.MOUSE_MOVE)

    handler.setInputAction((movement: { position: Cartesian2 }) => {
      const mode = useAppStore.getState().toolMode
      if (mode !== "pick") return

      const picked = viewer.scene.pick(movement.position)
      let code: string | null = null
      if (picked) {
        const raw = picked.id
        if (typeof raw === "string") code = raw
        else if (
          raw &&
          typeof raw === "object" &&
          "id" in raw &&
          typeof (raw as { id: unknown }).id === "string"
        ) {
          code = (raw as { id: string }).id
        }
      }
      const cell = code ? gridLayer.pickFromId(code) : null
      let finalCode = cell?.code ?? null
      if (!finalCode) {
        const cartesian = viewer.camera.pickEllipsoid(
          movement.position,
          viewer.scene.globe.ellipsoid
        )
        if (!cartesian) return
        const carto = Cartographic.fromCartesian(cartesian)
        const lng = CesiumMath.toDegrees(carto.longitude)
        const lat = CesiumMath.toDegrees(carto.latitude)
        finalCode = geosot.locToQuaternary(lng, lat, useAppStore.getState().level)
      }
      const level = geosot.getLevel(finalCode)
      useAppStore.getState().setGridSet({
        codes: [finalCode],
        level,
        from: "pick",
      })
      useAppStore.getState().setStatusText(`选中 ${finalCode}`)
      applyHighlights()
      void maybeAutoRunAnalysis()
    }, ScreenSpaceEventType.LEFT_CLICK)

    let lastFrame = performance.now()
    let frames = 0
    const onTick = () => {
      frames++
      const now = performance.now()
      if (now - lastFrame >= 1000) {
        useAppStore.getState().setFps(frames)
        frames = 0
        lastFrame = now
      }
    }
    viewer.clock.onTick.addEventListener(onTick)

    void bootWarehouse().then(() => {
      if (cancelled || viewer.isDestroyed()) return
      refresh()
      applyGisFeatures()
    })

    const unwatch = watchDesktopDataChanged(() => {
      void bootWarehouse().then(() => {
        if (cancelled || viewer.isDestroyed()) return
        useAppStore.getState().setStatusText("数据已更新")
        refresh()
      })
    })

    return () => {
      cancelled = true
      window.clearTimeout(refreshTimer)
      window.clearTimeout(bufferTimer)
      unsubTool()
      unsubBasemap()
      unsubBuffer()
      unwatch()
      clearDraw()
      handler.destroy()
      viewer.clock.onTick.removeEventListener(onTick)
      gisLayer.clearAll()
      if (!viewer.isDestroyed()) viewer.destroy()
      if (runtime?.viewer === viewer) runtime = null
      readyRef.current = false
    }
  }, [containerId])
}

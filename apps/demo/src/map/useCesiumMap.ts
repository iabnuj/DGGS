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
import { CellFragmentLayer } from "@/map/cellFragmentLayer"
import { WhiteModelLayer } from "@/map/whiteModelLayer"
import { VolumeFieldLayer } from "@/map/volumeFieldLayer"
import { ExternalModelLayer } from "@/map/externalModelLayer"
import { levelFromCamera, tileZoomFromCamera } from "@/grid/levelFromHeight"
import { createViewer } from "@/map/createViewer"
import { applyBasemap, applyAdminOverlay, applyLighting, applyTerrain } from "@/map/basemap"
import { useAppStore } from "@/state/store"
import {
  bindFinishActions,
  isLineDrawKind,
  startDrawSession,
  startFreehandDrawSession,
  type DrawSession,
} from "@/tools/drawSession"
import { lineToGridCodes, polygonToGridCodes } from "@/tools/geometryToGrid"
import {
  bootWarehouse,
  watchDesktopDataChanged,
} from "@/data/warehouseBoot"
import { computeFieldColorMap, resolveFieldStyle } from "@/data/fieldRenderer"
import { loadFeatureStoreFromLocalStorage } from "@/data/featureGeometryStore"
export type MapRuntime = {
  viewer: Viewer
  gridLayer: GridLayer
  refresh: (force?: boolean) => void
  /** Update pick highlights without rebuilding the viewport mesh. */
  applyHighlights: () => void
  /** Update imported data-layer overlay (eye toggles). */
  applyDataOverlay: (force?: boolean) => void
  /** Draw/hide original GIS feature geometries. */
  applyGisFeatures: () => void
  /** Draw cell-local fragments from detail-panel 上图. */
  applyCellFragments: () => void
  /** Draw/refresh field data overlay from current color maps. */
  applyFieldView: () => void
  /** Re-query warehouse and rebuild field color patches. */
  rebuildFieldView: () => void
  /** Draw analysis overlays (envelope/buffer). */
  applyAnalysisOverlays: () => void
  /** 格网挤出白模（体对象） */
  drawWhiteModel: (codes: string[], heightM?: number) => void
  drawWhiteModelCells: (
    cells: { code: string; heightM: number }[]
  ) => void
  clearWhiteModel: () => void
  /** 三维球体场 */
  drawVolumeField: (
    cells: { code: string; color: string; t: number }[],
    opts?: { layers?: number; totalHeightM?: number }
  ) => void
  clearVolumeField: () => void
  /** 外部 glTF / 3D Tiles */
  loadExternalGltf: (url: string, lon: number, lat: number, height?: number) => void
  loadExternalTileset: (url: string) => Promise<void>
  clearExternalModel: () => void
}

let runtime: MapRuntime | null = null

export function getMapRuntime(): MapRuntime | null {
  return runtime
}

export function flyToCode(code: string, height = 40_000) {
  flyToCodes([code], height)
}

/** 飞到一组编码的包围盒中心；未指定高度时按跨度估算。 */
export function flyToCodes(codes: Iterable<string>, height?: number) {
  const rt = runtime
  if (!rt || rt.viewer.isDestroyed()) return

  let west = 180
  let south = 90
  let east = -180
  let north = -90
  let n = 0
  for (const code of codes) {
    try {
      const b = geosot.bboxFromCode(code)
      if (b.west < west) west = b.west
      if (b.south < south) south = b.south
      if (b.east > east) east = b.east
      if (b.north > north) north = b.north
      n++
    } catch {
      // 非法编码跳过
    }
  }
  if (n === 0 || !(west < east && south < north)) return

  const spanDeg = Math.max(east - west, north - south)
  const autoH = Math.min(
    2_500_000,
    Math.max(8_000, spanDeg * 110_574 * 2.2)
  )
  rt.viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(
      (west + east) / 2,
      (south + north) / 2,
      height ?? autoH
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

/** 体对象 / 立体场：打开地球光照与阴影，侧面才有明暗 */
function ensureSceneLighting(viewer: Viewer) {
  if (viewer.isDestroyed()) return
  if (!useAppStore.getState().lighting) {
    useAppStore.getState().setLighting(true)
  }
  applyLighting(viewer, true)
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
    const fragmentLayer = new CellFragmentLayer(viewer)
    const whiteModelLayer = new WhiteModelLayer(viewer)
    const volumeFieldLayer = new VolumeFieldLayer(viewer)
    const externalModelLayer = new ExternalModelLayer(viewer)
    loadFeatureStoreFromLocalStorage()

    const syncHighlights = () => {
      const s = useAppStore.getState()
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

    const applyCellFragments = () => {
      if (cancelled || viewer.isDestroyed()) return
      void fragmentLayer.sync(useAppStore.getState().cellFragmentPreviews).then(() => {
        if (!cancelled && !viewer.isDestroyed()) viewer.scene.requestRender()
      })
    }

    const applyFieldView = () => {
      if (cancelled || viewer.isDestroyed()) return
      const s = useAppStore.getState()
      const opacityBySource: Record<string, number> = {}
      // 只画当前 fieldSources，避免眼睛关掉后仍用旧 colorMap
      const maps: Record<string, Map<string, string>> = {}
      for (const source of s.fieldSources) {
        const m = s.fieldColorMaps[source]
        if (!m || m.size === 0) continue
        maps[source] = m
        opacityBySource[source] = resolveFieldStyle(source).opacity
      }
      if (Object.keys(maps).length === 0) {
        gridLayer.clearFieldView()
        viewer.scene.requestRender()
        return
      }
      gridLayer.drawFieldViewFromSources(maps, opacityBySource)
      viewer.scene.requestRender()
    }

    const rebuildFieldView = () => {
      if (cancelled || viewer.isDestroyed()) return
      const sources = useAppStore.getState().fieldSources
      if (sources.length === 0) {
        gridLayer.clearFieldView()
        useAppStore.getState().setFieldColorMaps({})
        viewer.scene.requestRender()
        return
      }
      void computeFieldColorMap(sources).then((maps) => {
        if (cancelled || viewer.isDestroyed()) return
        useAppStore.getState().setFieldColorMaps(maps)
        applyFieldView()
      })
    }

    const applyAnalysisOverlays = () => {
      if (cancelled || viewer.isDestroyed()) return
      const s = useAppStore.getState()
      gridLayer.clearAnalysisOverlays()
      for (const result of s.analysisResults) {
        if (result.codes.length > 0) {
          gridLayer.addAnalysisOverlay(result.codes, result.color, result.label)
        }
      }
      viewer.scene.requestRender()
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
        // 2D 缩放不改相机高度，必须用视窗跨度，否则会卡在 L6
        const next = levelFromCamera(viewer)
        if (next !== s.level) useAppStore.getState().setLevel(next)
        level = next
      }

      gridLayer.setOptions({
        ...s.drawOptions,
        // 仅「按属性拉伸高度」开启时立体；否则平面
        extrude: s.extrudeByAttr,
        heightCount: s.extrudeByAttr ? Math.max(s.drawOptions.heightCount, 3) : 1,
        clampToGround: s.terrain,
      })

      try {
        const requestedLevel = level
        const { count, truncated, skipped, level: drawnLevel } =
          gridLayer.refresh(level, {
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
        // 手动锁定层级时：画面降级则同步 store，避免点选仍按细层编码
        // 自动调级时勿回写，否则会与 levelFromCamera 来回抢层级
        if (drawnLevel !== requestedLevel && !s.autoLevel) {
          useAppStore.getState().setLevel(drawnLevel)
        }
        const text = truncated
          ? `视窗过大，已降级 · L${drawnLevel}（目标 L${requestedLevel}）· ${count} 格`
          : `L${drawnLevel} · ${count} 格`
        if (useAppStore.getState().statusText !== text) {
          useAppStore.getState().setStatusText(text)
        }

        // ---- 分析叠加 ----
        if (s.analysisResults.length > 0) {
          applyAnalysisOverlays()
        }
        // 网格样式（平面/立体）变化后重绘场色斑
        if (s.fieldSources.length > 0) {
          if (Object.keys(s.fieldColorMaps).length > 0) applyFieldView()
          else rebuildFieldView()
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
      applyCellFragments,
      applyFieldView,
      rebuildFieldView,
      applyAnalysisOverlays,
      drawWhiteModel: (codes, heightM) => whiteModelLayer.draw(codes, heightM),
      drawWhiteModelCells: (cells) => {
        ensureSceneLighting(viewer)
        whiteModelLayer.drawCells(cells)
      },
      clearWhiteModel: () => whiteModelLayer.clear(),
      drawVolumeField: (cells, opts) => {
        ensureSceneLighting(viewer)
        volumeFieldLayer.draw(cells, opts)
        // 斜视，避免俯视只看到「填色格子」
        window.setTimeout(() => volumeFieldLayer.tiltForVolume(), 200)
      },
      clearVolumeField: () => volumeFieldLayer.clear(),
      loadExternalGltf: (url, lon, lat, height) =>
        externalModelLayer.loadGltf(url, lon, lat, height),
      loadExternalTileset: (url) => externalModelLayer.loadTileset(url),
      clearExternalModel: () => externalModelLayer.clear(),
    }

    const syncTileZoom = () => {
      if (cancelled || viewer.isDestroyed()) return
      const z = tileZoomFromCamera(viewer)
      if (z !== useAppStore.getState().tileZoom) {
        useAppStore.getState().setTileZoom(z)
      }
    }

    let refreshTimer: number | undefined
    const scheduleRefresh = () => {
      window.clearTimeout(refreshTimer)
      // Settle after pan/zoom; skip rebuild if view signature unchanged.
      refreshTimer = window.setTimeout(() => refresh(false), 320)
      syncTileZoom()
    }

    viewer.camera.moveEnd.addEventListener(scheduleRefresh)
    const onMorphComplete = () => {
      syncTileZoom()
      if (!cancelled && !viewer.isDestroyed()) refresh(true)
    }
    viewer.scene.morphComplete.addEventListener(onMorphComplete)
    syncTileZoom()

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
      const kind = session.kind
      clearDraw()
      if (!pts) {
        useAppStore.getState().setStatusText("轨迹过短，已取消绘制")
        useAppStore.getState().setToolMode("pick")
        return
      }
      const level = useAppStore.getState().level
      const asLine = isLineDrawKind(kind)
      const codes = asLine
        ? lineToGridCodes(pts, level, kind === "freeLine" ? 4 : 24)
        : polygonToGridCodes(pts, level)
      useAppStore.getState().setGridSet({
        codes,
        level,
        from: asLine ? "line" : "polygon",
      })
      useAppStore.getState().setRightPanelOpen(true)
      useAppStore.getState().setToolMode("pick")
      useAppStore
        .getState()
        .setStatusText(
          `${asLine ? "线" : "面"}覆盖 ${codes.length} 格`
        )
      refresh()
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

    const startFreehand = (kind: "freeLine" | "freePolygon") => {
      clearDraw()
      drawRef.current = startFreehandDrawSession(viewer, kind, {
        onComplete: () => completeDraw(),
      })
      useAppStore
        .getState()
        .setStatusText(
          kind === "freeLine"
            ? "自由线：按住拖动绘制，松开结束"
            : "自由面：按住拖动勾勒，松开闭合选格"
        )
    }

    const unsubTool = useAppStore.subscribe((state, prev) => {
      if (state.toolMode === prev.toolMode) return
      if (state.toolMode === "drawLine") startDraw("line")
      else if (state.toolMode === "drawPolygon") startDraw("polygon")
      else if (state.toolMode === "drawFreeLine") startFreehand("freeLine")
      else if (state.toolMode === "drawFreePolygon") startFreehand("freePolygon")
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

    const unsubFragments = useAppStore.subscribe((state, prev) => {
      if (state.cellFragmentPreviews === prev.cellFragmentPreviews) return
      applyCellFragments()
    })
    // Apply any previews that were toggled before the viewer mounted.
    applyCellFragments()

    const unsubField = useAppStore.subscribe((state, prev) => {
      if (state.fieldSources === prev.fieldSources) return
      rebuildFieldView()
    })

    const unsubFieldStyle = useAppStore.subscribe((state, prev) => {
      if (state.fieldStyles === prev.fieldStyles) return
      // 色带变更需重算颜色；仅透明度可变 apply
      rebuildFieldView()
    })

    const unsubAnalysis = useAppStore.subscribe((state, prev) => {
      if (state.analysisResults === prev.analysisResults) return
      applyAnalysisOverlays()
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
      const level =
        gridLayer.getDisplayLevel?.() ?? useAppStore.getState().level
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
        const pickLevel =
          gridLayer.getDisplayLevel?.() ?? useAppStore.getState().level
        finalCode = geosot.locToQuaternary(lng, lat, pickLevel)
      }
      const level = geosot.getLevel(finalCode)
      const routePick = useAppStore.getState().routePickMode
      if (routePick === "start" || routePick === "goal") {
        if (routePick === "start") {
          useAppStore.getState().setRouteStart(finalCode)
          useAppStore.getState().setStatusText(`已设置起点 ${finalCode}`)
        } else {
          useAppStore.getState().setRouteGoal(finalCode)
          useAppStore.getState().setStatusText(`已设置终点 ${finalCode}`)
        }
        useAppStore.getState().setRoutePickMode(null)
        useAppStore.getState().setGridSet({
          codes: [finalCode],
          level,
          from: "pick",
        })
        applyHighlights()
        return
      }
      useAppStore.getState().setGridSet({
        codes: [finalCode],
        level,
        from: "pick",
      })
      useAppStore.getState().setRightPanelOpen(true)
      useAppStore.getState().setStatusText(`选中 ${finalCode}`)
      applyHighlights()
    }, ScreenSpaceEventType.LEFT_CLICK)

    let lastFrame = performance.now()
    let frames = 0
    const onTick = () => {
      frames++
      const now = performance.now()
      if (now - lastFrame >= 1000) {
        const store = useAppStore.getState()
        store.setFps(frames)
        const z = tileZoomFromCamera(viewer)
        if (z !== store.tileZoom) store.setTileZoom(z)
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
      unsubTool()
      unsubBasemap()
      unsubFragments()
      unsubField()
      unsubFieldStyle()
      unsubAnalysis()
      unwatch()
      clearDraw()
      handler.destroy()
      viewer.clock.onTick.removeEventListener(onTick)
      viewer.scene.morphComplete.removeEventListener(onMorphComplete)
      viewer.camera.moveEnd.removeEventListener(scheduleRefresh)
      gisLayer.clearAll()
      fragmentLayer.clearAll()
      whiteModelLayer.clear()
      externalModelLayer.clear()
      if (!viewer.isDestroyed()) viewer.destroy()
      if (runtime?.viewer === viewer) runtime = null
      readyRef.current = false
    }
  }, [containerId])
}

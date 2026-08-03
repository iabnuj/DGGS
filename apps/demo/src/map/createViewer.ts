import {
  Cartesian3,
  Color,
  EllipsoidTerrainProvider,
  Viewer,
} from "cesium"
import { applyBasemap } from "@/map/basemap"
import { useAppStore } from "@/state/store"

export function createViewer(container: HTMLElement): Viewer {
  const viewer = new Viewer(container, {
    animation: false,
    timeline: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
    baseLayer: false,
    terrainProvider: new EllipsoidTerrainProvider(),
  })

  applyBasemap(viewer, useAppStore.getState().basemap)

  // 轻量画质：不开 resolutionScale（Retina 全屏超采样最吃 FPS）
  viewer.scene.msaaSamples = 1
  viewer.scene.fog.enabled = false
  viewer.scene.globe.baseColor = Color.fromCssColorString("#1a222c")
  // 默认 1m 近距到不了 L30+；放到厘米级才能试到 L32
  viewer.scene.screenSpaceCameraController.minimumZoomDistance = 0.05

  viewer.camera.setView({
    destination: Cartesian3.fromDegrees(116.4, 39.9, 180_000),
  })

  return viewer
}

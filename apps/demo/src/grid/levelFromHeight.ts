import {
  Cartographic,
  Math as CesiumMath,
  SceneMode,
  type Viewer,
} from "cesium"
import { utils } from "@dggs/grid-core"

const GEO_SOT_MAX_LEVEL = 32
/** 视口短边大约铺这么多格，再据此选层级（无软上限，直到 L32）。 */
const TARGET_CELLS_ACROSS = 12

/**
 * 视窗跨度（度）→ GeoSOT 层级。
 * 选「格宽 ≤ 跨度/目标格数」的最粗层级，使视口内格数大致稳定；可到 L32。
 */
export function levelFromSpanDegrees(spanDeg: number): number {
  if (!(spanDeg > 0) || !Number.isFinite(spanDeg)) return 10
  const want = spanDeg / TARGET_CELLS_ACROSS
  const sizes = utils.gridSize
  for (let i = 0; i <= GEO_SOT_MAX_LEVEL; i++) {
    const size = sizes[i]
    if (size != null && size <= want) return i
  }
  return GEO_SOT_MAX_LEVEL
}

/** Map camera height (meters) → GeoSOT level for auto mode (3D ellipsoid). */
export function levelFromHeight(height: number): number {
  if (!(height > 0) || !Number.isFinite(height)) return 10
  // 近似把高度换成地面可视跨度（度），再走同一套选级。
  const spanDeg = (height / 111_320) * 1.2
  return levelFromSpanDegrees(spanDeg)
}

/** 优先用视窗矩形跨度；无矩形时回退相机高度。 */
export function levelFromCamera(viewer: Viewer): number {
  const rect = viewer.camera.computeViewRectangle()
  if (rect) {
    let dLon = CesiumMath.toDegrees(rect.east - rect.west)
    if (dLon < 0) dLon += 360
    const dLat = CesiumMath.toDegrees(rect.north - rect.south)
    const span = Math.max(dLon, dLat)
    if (span > 0 && Number.isFinite(span)) {
      return levelFromSpanDegrees(span)
    }
  }

  // 2D 下偶发无 rectangle：用正交 frustum 宽度（米）近似跨度
  if (viewer.scene.mode === SceneMode.SCENE2D) {
    const frust = viewer.camera.frustum as { width?: number }
    if (typeof frust.width === "number" && frust.width > 0) {
      const deg = frust.width / 111_320
      if (deg > 0 && Number.isFinite(deg)) return levelFromSpanDegrees(deg)
    }
  }

  const carto = Cartographic.fromCartesian(viewer.camera.positionWC)
  return levelFromHeight(carto.height)
}

const WEB_MERCATOR_TILE = 256
const EARTH_CIRCUMFERENCE_M = 2 * Math.PI * 6378137

function clampTileZoom(z: number): number {
  if (!Number.isFinite(z)) return 0
  return Math.max(0, Math.min(22, Math.round(z)))
}

/**
 * 当前视窗对应的 XYZ / WebMercator 底图瓦片层级（与 OSM/ArcGIS `{z}` 一致）。
 * 按经度跨度与画布宽度估算，使约 256px 瓦片铺满横向视口。
 */
export function tileZoomFromCamera(viewer: Viewer): number {
  const width = Math.max(1, viewer.scene.canvas.clientWidth)
  const rect = viewer.camera.computeViewRectangle()
  if (rect) {
    let dLon = CesiumMath.toDegrees(rect.east - rect.west)
    if (dLon < 0) dLon += 360
    if (dLon > 0 && Number.isFinite(dLon)) {
      // dLon ≈ (360 / 2^z) * (width / 256)
      return clampTileZoom(Math.log2((360 / dLon) * (width / WEB_MERCATOR_TILE)))
    }
  }

  if (viewer.scene.mode === SceneMode.SCENE2D) {
    const frust = viewer.camera.frustum as { width?: number }
    if (typeof frust.width === "number" && frust.width > 0) {
      const dLon = (frust.width / EARTH_CIRCUMFERENCE_M) * 360
      if (dLon > 0 && Number.isFinite(dLon)) {
        return clampTileZoom(Math.log2((360 / dLon) * (width / WEB_MERCATOR_TILE)))
      }
    }
  }

  const height = Cartographic.fromCartesian(viewer.camera.positionWC).height
  if (height > 0 && Number.isFinite(height)) {
    // 赤道处：分辨率 ≈ 周长 / (256 * 2^z)；相机高度近似可视宽度量级
    return clampTileZoom(Math.log2(EARTH_CIRCUMFERENCE_M / (height * Math.PI)))
  }
  return 0
}

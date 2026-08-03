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

const EARTH_CIRCUMFERENCE_M = 2 * Math.PI * 6378137

/** 2D/CV 正交视锥宽度（米）；Cesium 2D 常用 OffCenter，没有 width 字段。 */
function orthographicWidthMeters(viewer: Viewer): number | null {
  const frust = viewer.camera.frustum as {
    width?: number
    left?: number
    right?: number
  }
  if (typeof frust.width === "number" && frust.width > 0) return frust.width
  if (
    typeof frust.left === "number" &&
    typeof frust.right === "number" &&
    frust.right > frust.left
  ) {
    return frust.right - frust.left
  }
  return null
}

function spanDegreesFromOrthographic(viewer: Viewer): number | null {
  const meters = orthographicWidthMeters(viewer)
  if (meters == null || !(meters > 0)) return null
  const deg = (meters / EARTH_CIRCUMFERENCE_M) * 360
  return deg > 0 && Number.isFinite(deg) ? deg : null
}

/** 2D/CV 下由正交视锥估视口经纬度包围盒（度）。 */
export function viewBBoxFromOrthographic(viewer: Viewer): {
  west: number
  south: number
  east: number
  north: number
} | null {
  const meters = orthographicWidthMeters(viewer)
  if (meters == null || !(meters > 0)) return null
  const carto = viewer.camera.positionCartographic
  const lng = CesiumMath.toDegrees(carto.longitude)
  const lat = CesiumMath.toDegrees(carto.latitude)
  const cos = Math.max(0.2, Math.cos(carto.latitude))
  const halfLon = ((meters / EARTH_CIRCUMFERENCE_M) * 360) / (2 * cos)
  const halfLat = ((meters / EARTH_CIRCUMFERENCE_M) * 360) / 2
  if (!(halfLon > 0) || !(halfLat > 0)) return null
  return {
    west: lng - halfLon,
    east: lng + halfLon,
    south: lat - halfLat,
    north: lat + halfLat,
  }
}

function spanDegreesFromViewRectangle(viewer: Viewer): number | null {
  const rect = viewer.camera.computeViewRectangle()
  if (!rect) return null
  let dLon = CesiumMath.toDegrees(rect.east - rect.west)
  if (dLon < 0) dLon += 360
  const dLat = CesiumMath.toDegrees(rect.north - rect.south)
  const span = Math.max(dLon, dLat)
  return span > 0 && Number.isFinite(span) ? span : null
}

/**
 * 视口跨度（度）→ 自动网格层级。
 * 2D/CV：缩放改正交宽度，必须优先用 frustum，否则 computeViewRectangle 常卡在粗跨度（L6）。
 */
export function levelFromCamera(viewer: Viewer): number {
  const mode = viewer.scene.mode
  if (mode === SceneMode.SCENE2D || mode === SceneMode.COLUMBUS_VIEW) {
    const ortho = spanDegreesFromOrthographic(viewer)
    if (ortho != null) return levelFromSpanDegrees(ortho)
  }

  const fromRect = spanDegreesFromViewRectangle(viewer)
  if (fromRect != null) return levelFromSpanDegrees(fromRect)

  const ortho = spanDegreesFromOrthographic(viewer)
  if (ortho != null) return levelFromSpanDegrees(ortho)

  const carto = Cartographic.fromCartesian(viewer.camera.positionWC)
  return levelFromHeight(carto.height)
}

const WEB_MERCATOR_TILE = 256

function clampTileZoom(z: number): number {
  if (!Number.isFinite(z)) return -1
  return Math.max(0, Math.min(22, Math.round(z)))
}

function tileZoomFromLonSpan(dLon: number, canvasWidthPx: number): number {
  if (!(dLon > 0) || !Number.isFinite(dLon)) return -1
  return clampTileZoom(
    Math.log2((360 / dLon) * (canvasWidthPx / WEB_MERCATOR_TILE))
  )
}

/**
 * 当前视窗对应的 XYZ / WebMercator 底图瓦片层级（与 OSM/ArcGIS `{z}` 一致）。
 * 2D 优先用正交视锥宽度；失败再回退视窗矩形 / 相机高度。
 * @returns 0–22，无法估算时为 -1
 */
export function tileZoomFromCamera(viewer: Viewer): number {
  const width = Math.max(1, viewer.scene.canvas.clientWidth)
  const mode = viewer.scene.mode

  // 2D/哥伦布：缩放改的是正交宽度，不是相机高度
  if (mode === SceneMode.SCENE2D || mode === SceneMode.COLUMBUS_VIEW) {
    const ortho = spanDegreesFromOrthographic(viewer)
    if (ortho != null) {
      const z = tileZoomFromLonSpan(ortho, width)
      if (z >= 0) return z
    }
  }

  const rect = viewer.camera.computeViewRectangle()
  if (rect) {
    let dLon = CesiumMath.toDegrees(rect.east - rect.west)
    if (dLon < 0) dLon += 360
    const z = tileZoomFromLonSpan(dLon, width)
    if (z >= 0) return z
  }

  // 矩形不可用时，2D 再试一次正交宽度（mode 可能仍是 MORPHING）
  const ortho = spanDegreesFromOrthographic(viewer)
  if (ortho != null) {
    const z = tileZoomFromLonSpan(ortho, width)
    if (z >= 0) return z
  }

  if (mode !== SceneMode.SCENE2D) {
    const height = Cartographic.fromCartesian(viewer.camera.positionWC).height
    if (height > 0 && Number.isFinite(height)) {
      return clampTileZoom(
        Math.log2(EARTH_CIRCUMFERENCE_M / (height * Math.PI))
      )
    }
  }
  return -1
}

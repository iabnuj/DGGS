import {
  CesiumTerrainProvider,
  Color,
  EllipsoidTerrainProvider,
  ImageryLayer,
  UrlTemplateImageryProvider,
  WebMercatorTilingScheme,
  type Viewer,
} from "cesium"
import type { BasemapId } from "@/state/store"
import { useAppStore } from "@/state/store"

const BASEMAPS: Record<
  BasemapId,
  { url: string; subdomains?: string[]; maximumLevel?: number }
> = {
  osm: {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    maximumLevel: 19,
  },
  sat: {
    // 底图保持 256，避免和注记叠两层高清导致掉帧
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    maximumLevel: 19,
  },
  dark: {
    url: "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
    maximumLevel: 19,
  },
}

/**
 * 高德中文路网/地名注记（256）。
 * 注意：scl=2 + tileWidth:512 在部分环境下瓦片对不齐会整层空白，故不用高清参数。
 */
const ADMIN_OVERLAY = {
  url: "https://webst0{s}.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}",
  subdomains: ["1", "2", "3", "4"] as string[],
  maximumLevel: 18,
}

/** Free quantized-mesh terrain (no Cesium ion token). */
const TERRAIN_URL = "https://terrain.reearth.land/cesium-mesh/ellipsoid"

let worldTerrainPromise: Promise<CesiumTerrainProvider> | null = null
let terrainRequestSeq = 0
let adminOverlayLayer: ImageryLayer | null = null

function tiling() {
  return new WebMercatorTilingScheme()
}

function loadWorldTerrain() {
  if (!worldTerrainPromise) {
    worldTerrainPromise = CesiumTerrainProvider.fromUrl(TERRAIN_URL, {
      requestVertexNormals: true,
    }).catch((err) => {
      worldTerrainPromise = null
      throw err
    })
  }
  return worldTerrainPromise
}

function addAdminOverlay(viewer: Viewer) {
  adminOverlayLayer = viewer.imageryLayers.addImageryProvider(
    new UrlTemplateImageryProvider({
      url: ADMIN_OVERLAY.url,
      subdomains: ADMIN_OVERLAY.subdomains,
      tilingScheme: tiling(),
      maximumLevel: ADMIN_OVERLAY.maximumLevel,
    })
  )
  adminOverlayLayer.alpha = 1
}

export function applyBasemap(viewer: Viewer, id: BasemapId) {
  if (viewer.isDestroyed()) return
  viewer.imageryLayers.removeAll()
  adminOverlayLayer = null

  const cfg = BASEMAPS[id]
  viewer.imageryLayers.addImageryProvider(
    new UrlTemplateImageryProvider({
      url: cfg.url,
      subdomains: cfg.subdomains,
      tilingScheme: tiling(),
      maximumLevel: cfg.maximumLevel ?? 19,
    })
  )

  if (useAppStore.getState().adminOverlay) {
    addAdminOverlay(viewer)
  }

  if (id === "dark") {
    viewer.scene.globe.baseColor = Color.fromCssColorString("#0b1017")
  } else {
    viewer.scene.globe.baseColor = Color.fromCssColorString("#1a222c")
  }
}

/** Toggle 中文地名注记叠加层（不换底图） */
export function applyAdminOverlay(viewer: Viewer, enabled: boolean) {
  if (viewer.isDestroyed()) return
  if (!enabled) {
    if (adminOverlayLayer) {
      viewer.imageryLayers.remove(adminOverlayLayer, false)
      adminOverlayLayer = null
    }
    return
  }
  if (adminOverlayLayer && viewer.imageryLayers.contains(adminOverlayLayer)) {
    return
  }
  addAdminOverlay(viewer)
}

/** Enable real DEM terrain, or fall back to smooth ellipsoid. */
export async function applyTerrain(viewer: Viewer, enabled: boolean) {
  if (viewer.isDestroyed()) return
  const seq = ++terrainRequestSeq
  if (!enabled) {
    viewer.terrainProvider = new EllipsoidTerrainProvider()
    viewer.scene.globe.depthTestAgainstTerrain = false
    return
  }

  useAppStore.getState().setStatusText("正在加载地形高程…")
  try {
    const provider = await loadWorldTerrain()
    if (seq !== terrainRequestSeq || viewer.isDestroyed()) return
    if (!useAppStore.getState().terrain) return
    viewer.terrainProvider = provider
    viewer.scene.globe.depthTestAgainstTerrain = true
    useAppStore.getState().setStatusText("地形高程已开启")
  } catch (err) {
    if (seq !== terrainRequestSeq || viewer.isDestroyed()) return
    viewer.terrainProvider = new EllipsoidTerrainProvider()
    viewer.scene.globe.depthTestAgainstTerrain = false
    useAppStore.getState().setTerrain(false)
    useAppStore.getState().setStatusText(
      `地形加载失败: ${err instanceof Error ? err.message : String(err)}`
    )
  }
}

export function applyLighting(viewer: Viewer, enabled: boolean) {
  viewer.scene.globe.enableLighting = enabled
  viewer.shadows = enabled
}

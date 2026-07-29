import {
  ArcType,
  Cartesian3,
  Color,
  HeightReference,
  type Entity,
  type Viewer,
} from "cesium"
import {
  getSourceFeatures,
  type GisFeature,
} from "@/data/featureGeometryStore"

const SOURCE_COLORS = [
  "#38bdf8",
  "#f472b6",
  "#a3e635",
  "#fbbf24",
  "#c084fc",
  "#2dd4bf",
]

function colorForSource(source: string): Color {
  let h = 0
  for (let i = 0; i < source.length; i++) h = (h * 31 + source.charCodeAt(i)) >>> 0
  const hex = SOURCE_COLORS[h % SOURCE_COLORS.length]!
  return Color.fromCssColorString(hex)
}

function asLonLatPairs(coords: unknown): number[][] {
  if (!Array.isArray(coords)) return []
  return coords.filter(
    (c): c is number[] =>
      Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number"
  )
}

function flatDegrees(pairs: number[][]): number[] {
  const out: number[] = []
  for (const [lon, lat] of pairs) {
    out.push(lon!, lat!)
  }
  return out
}

/**
 * Draws original GIS features (not grid cells) as Cesium entities, grouped by source.
 */
export class GisFeatureLayer {
  private groups = new Map<string, Entity[]>()

  constructor(private viewer: Viewer) {}

  /** Show/hide each source according to layer.featuresVisible. */
  sync(layers: { source: string; featuresVisible: boolean }[]) {
    if (this.viewer.isDestroyed()) return
    const wanted = new Set(
      layers.filter((l) => l.featuresVisible).map((l) => l.source)
    )

    for (const source of [...this.groups.keys()]) {
      if (!wanted.has(source)) this.clearSource(source)
    }

    for (const source of wanted) {
      this.redrawSource(source, getSourceFeatures(source))
    }
  }

  clearSource(source: string) {
    const list = this.groups.get(source)
    if (!list) return
    for (const e of list) this.viewer.entities.remove(e)
    this.groups.delete(source)
  }

  clearAll() {
    for (const source of [...this.groups.keys()]) this.clearSource(source)
  }

  private redrawSource(source: string, features: GisFeature[]) {
    this.clearSource(source)
    if (features.length === 0 || this.viewer.isDestroyed()) return

    const color = colorForSource(source)
    const entities: Entity[] = []
    const maxDraw = 8_000
    let n = 0

    for (const f of features) {
      if (n >= maxDraw) break
      const entity = this.makeEntity(source, f, color)
      if (!entity) continue
      entities.push(entity)
      n++
    }
    this.groups.set(source, entities)
  }

  private makeEntity(
    source: string,
    f: GisFeature,
    color: Color
  ): Entity | null {
    const id = `gis:${source}:${f.id}`
    if (f.geometryType === "Point") {
      const c = f.coordinates
      if (!Array.isArray(c) || typeof c[0] !== "number" || typeof c[1] !== "number") {
        return null
      }
      return this.viewer.entities.add({
        id,
        position: Cartesian3.fromDegrees(c[0], c[1] as number),
        point: {
          pixelSize: 10,
          color,
          outlineColor: Color.WHITE,
          outlineWidth: 1,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      })
    }

    if (f.geometryType === "LineString") {
      const pairs = asLonLatPairs(f.coordinates)
      if (pairs.length < 2) return null
      // Ellipsoid path: clampToGround Entity polylines often fail to show
      // without real terrain / ground-polyline support.
      return this.viewer.entities.add({
        id,
        polyline: {
          positions: Cartesian3.fromDegreesArray(flatDegrees(pairs)),
          width: 4,
          material: color,
          clampToGround: false,
          arcType: ArcType.GEODESIC,
        },
      })
    }

    if (f.geometryType === "Polygon") {
      const rings = f.coordinates
      if (!Array.isArray(rings) || rings.length === 0) return null
      const outer = asLonLatPairs(rings[0])
      if (outer.length < 3) return null
      return this.viewer.entities.add({
        id,
        polygon: {
          hierarchy: Cartesian3.fromDegreesArray(flatDegrees(outer)),
          material: color.withAlpha(0.28),
          outline: true,
          outlineColor: color,
          height: 0,
          heightReference: HeightReference.NONE,
        },
      })
    }

    return null
  }
}

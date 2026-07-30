import {
  ArcType,
  Cartesian3,
  Color,
  HeightReference,
  type Entity,
  type Viewer,
} from "cesium"
import type { CellFragment, GridCellRecord } from "@dggs/grid-ingest"

function asLonLatPairs(coords: unknown): number[][] {
  if (!Array.isArray(coords)) return []
  return coords.filter(
    (c): c is number[] =>
      Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number"
  )
}

function flatDegrees(pairs: number[][]): number[] {
  const out: number[] = []
  for (const [lon, lat] of pairs) out.push(lon!, lat!)
  return out
}

function previewKey(r: GridCellRecord): string {
  return `${r.source}::${r.featureId ?? ""}::${r.gridId}`
}

/**
 * Draws cell-local fragments from the warehouse (already clipped at ingest).
 * Used by detail-panel「上图」— no live geometry intersection.
 */
export class CellFragmentLayer {
  private entities = new Map<string, Entity[]>()

  constructor(private viewer: Viewer) {}

  sync(records: GridCellRecord[]) {
    if (this.viewer.isDestroyed()) return
    const wanted = new Set(records.map(previewKey))

    for (const key of [...this.entities.keys()]) {
      if (!wanted.has(key)) this.clearKey(key)
    }

    for (const r of records) {
      const key = previewKey(r)
      if (this.entities.has(key)) continue
      if (!r.fragment) continue
      try {
        const drawn = this.drawFragment(key, r.fragment)
        if (drawn.length) this.entities.set(key, drawn)
      } catch (err) {
        console.error("[CellFragmentLayer] draw failed", key, err)
      }
    }
  }

  clearKey(key: string) {
    const list = this.entities.get(key)
    if (!list) return
    for (const e of list) this.viewer.entities.remove(e)
    this.entities.delete(key)
  }

  clearAll() {
    for (const key of [...this.entities.keys()]) this.clearKey(key)
  }

  private drawFragment(key: string, frag: CellFragment): Entity[] {
    const color = Color.fromCssColorString("#fbbf24")
    const out: Entity[] = []

    if (frag.kind === "raster") {
      // Placeholder outline until chip imagery is wired.
      const b = frag.bbox
      out.push(
        this.viewer.entities.add({
          id: `frag:${key}:raster`,
          polyline: {
            positions: Cartesian3.fromDegreesArray([
              b.west,
              b.south,
              b.east,
              b.south,
              b.east,
              b.north,
              b.west,
              b.north,
              b.west,
              b.south,
            ]),
            width: 2,
            material: color.withAlpha(0.7),
            clampToGround: false,
            arcType: ArcType.GEODESIC,
          },
        })
      )
      return out
    }

    if (frag.kind !== "vector") return out

    if (frag.geometryType === "Point") {
      const c = frag.coordinates
      if (!Array.isArray(c) || typeof c[0] !== "number" || typeof c[1] !== "number") {
        return out
      }
      out.push(
        this.viewer.entities.add({
          id: `frag:${key}`,
          position: Cartesian3.fromDegrees(c[0], c[1] as number),
          point: {
            pixelSize: 12,
            color,
            outlineColor: Color.WHITE,
            outlineWidth: 2,
            heightReference: HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        })
      )
      return out
    }

    if (frag.geometryType === "LineString") {
      const pairs = asLonLatPairs(frag.coordinates)
      if (pairs.length < 2) return out
      out.push(
        this.viewer.entities.add({
          id: `frag:${key}`,
          polyline: {
            positions: Cartesian3.fromDegreesArray(flatDegrees(pairs)),
            width: 5,
            material: color,
            clampToGround: false,
            arcType: ArcType.GEODESIC,
          },
        })
      )
      return out
    }

    if (frag.geometryType === "MultiLineString") {
      if (!Array.isArray(frag.coordinates)) return out
      ;(frag.coordinates as unknown[]).forEach((line, i) => {
        const pairs = asLonLatPairs(line)
        if (pairs.length < 2) return
        out.push(
          this.viewer.entities.add({
            id: `frag:${key}:${i}`,
            polyline: {
              positions: Cartesian3.fromDegreesArray(flatDegrees(pairs)),
              width: 5,
              material: color,
              clampToGround: false,
              arcType: ArcType.GEODESIC,
            },
          })
        )
      })
      return out
    }

    if (frag.geometryType === "Polygon") {
      const rings = frag.coordinates
      if (!Array.isArray(rings) || !rings[0]) return out
      const outer = asLonLatPairs(rings[0])
      if (outer.length < 3) return out
      out.push(
        this.viewer.entities.add({
          id: `frag:${key}`,
          polygon: {
            hierarchy: Cartesian3.fromDegreesArray(flatDegrees(outer)),
            material: color.withAlpha(0.35),
            outline: true,
            outlineColor: color,
            height: 0,
            heightReference: HeightReference.NONE,
          },
        })
      )
    }

    return out
  }
}

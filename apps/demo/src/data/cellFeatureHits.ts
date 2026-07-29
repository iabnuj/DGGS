import { geosot } from "@dggs/grid-core"
import {
  getSourceFeatures,
  type GisFeature,
} from "@/data/featureGeometryStore"
import { useAppStore } from "@/state/store"
import type { GridCellRecord } from "@dggs/grid-ingest"

export type CellFeatureHit = {
  source: string
  featureId: string
  label?: string
  attrs: Record<string, string | number | boolean>
  /** warehouse row if present */
  record?: GridCellRecord
  fromGeometry: boolean
}

type BBox = { west: number; south: number; east: number; north: number }

function pointInBBox(lon: number, lat: number, b: BBox): boolean {
  return lon >= b.west && lon <= b.east && lat >= b.south && lat <= b.north
}

function segIntersectsBBox(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  b: BBox
): boolean {
  if (pointInBBox(x0, y0, b) || pointInBBox(x1, y1, b)) return true
  // Reject if segment AABB misses cell
  if (
    Math.max(x0, x1) < b.west ||
    Math.min(x0, x1) > b.east ||
    Math.max(y0, y1) < b.south ||
    Math.min(y0, y1) > b.north
  ) {
    return false
  }
  // Liang–Barsky style: check intersection with four edges via param
  const edges: [number, number, number, number][] = [
    [b.west, b.south, b.east, b.south],
    [b.east, b.south, b.east, b.north],
    [b.east, b.north, b.west, b.north],
    [b.west, b.north, b.west, b.south],
  ]
  for (const [ex0, ey0, ex1, ey1] of edges) {
    if (segmentsCross(x0, y0, x1, y1, ex0, ey0, ex1, ey1)) return true
  }
  return false
}

function segmentsCross(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number
): boolean {
  const cross = (ox: number, oy: number, px: number, py: number, qx: number, qy: number) =>
    (px - ox) * (qy - oy) - (py - oy) * (qx - ox)
  const d1 = cross(cx, cy, dx, dy, ax, ay)
  const d2 = cross(cx, cy, dx, dy, bx, by)
  const d3 = cross(ax, ay, bx, by, cx, cy)
  const d4 = cross(ax, ay, bx, by, dx, dy)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true
  }
  return false
}

function asPairs(coords: unknown): number[][] {
  if (!Array.isArray(coords)) return []
  return coords.filter(
    (c): c is number[] =>
      Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number"
  )
}

export function gisFeatureIntersectsBBox(f: GisFeature, b: BBox): boolean {
  if (f.geometryType === "Point") {
    const c = f.coordinates
    if (!Array.isArray(c) || typeof c[0] !== "number" || typeof c[1] !== "number") {
      return false
    }
    return pointInBBox(c[0], c[1] as number, b)
  }
  if (f.geometryType === "LineString") {
    const pairs = asPairs(f.coordinates)
    for (let i = 0; i < pairs.length - 1; i++) {
      const a = pairs[i]!
      const c = pairs[i + 1]!
      if (segIntersectsBBox(a[0]!, a[1]!, c[0]!, c[1]!, b)) return true
    }
    return false
  }
  if (f.geometryType === "Polygon") {
    const rings = f.coordinates
    if (!Array.isArray(rings) || !rings[0]) return false
    const outer = asPairs(rings[0])
    for (const [lon, lat] of outer) {
      if (pointInBBox(lon!, lat!, b)) return true
    }
    for (let i = 0; i < outer.length - 1; i++) {
      const a = outer[i]!
      const c = outer[i + 1]!
      if (segIntersectsBBox(a[0]!, a[1]!, c[0]!, c[1]!, b)) return true
    }
    // cell center inside polygon (ray cast)
    const cx = (b.west + b.east) / 2
    const cy = (b.south + b.north) / 2
    let inside = false
    for (let i = 0, j = outer.length - 1; i < outer.length; j = i++) {
      const xi = outer[i]![0]!
      const yi = outer[i]![1]!
      const xj = outer[j]![0]!
      const yj = outer[j]![1]!
      const hit =
        yi > cy !== yj > cy &&
        cx < ((xj - xi) * (cy - yi)) / (yj - yi + 1e-15) + xi
      if (hit) inside = !inside
    }
    return inside
  }
  return false
}

/**
 * Merge warehouse occupancy with original GIS geometries that cross the cell.
 * Fixes “yellow lines in cell but only one osm_id in panel” when sampling/PK missed peers.
 */
export function mergeCellFeatureHits(
  code: string,
  warehouseRows: GridCellRecord[]
): CellFeatureHit[] {
  const bbox = geosot.bboxFromCode(code)
  const byKey = new Map<string, CellFeatureHit>()

  for (const r of warehouseRows) {
    const featureId = r.featureId ?? String(r.attrs.osm_id ?? r.gridId)
    const key = `${r.source}\0${featureId}`
    byKey.set(key, {
      source: r.source,
      featureId,
      label: r.label,
      attrs: Object.fromEntries(
        Object.entries(r.attrs).filter(
          (e): e is [string, string | number | boolean] => e[1] != null
        )
      ),
      record: r,
      fromGeometry: false,
    })
  }

  const layers = useAppStore.getState().layers
  const sources = new Set<string>([
    ...warehouseRows.map((r) => r.source),
    ...layers.map((l) => l.source),
  ])

  for (const source of sources) {
    const feats = getSourceFeatures(source)
    const layerLabel = layers.find((l) => l.source === source)?.name
    for (const f of feats) {
      if (!gisFeatureIntersectsBBox(f, bbox)) continue
      const featureId = f.id
      const key = `${source}\0${featureId}`
      const existing = byKey.get(key)
      if (existing) {
        existing.fromGeometry = true
        continue
      }
      byKey.set(key, {
        source,
        featureId,
        label: layerLabel ?? source,
        attrs: { osm_id: /^\d+$/.test(featureId) ? Number(featureId) : featureId },
        fromGeometry: true,
      })
    }
  }

  return [...byKey.values()].sort((a, b) =>
    a.source === b.source
      ? a.featureId.localeCompare(b.featureId)
      : a.source.localeCompare(b.source)
  )
}

import * as geosot from "./geosot"
import { idFromXY } from "./xy"

export type BBox = { west: number; south: number; east: number; north: number }

/** Longitude/latitude vertex for polygon rings (degrees). */
export type LngLat = { lng: number; lat: number }

const MAX_CELLS = 20000

/**
 * True if (x,y) is a real GeoSOT cell at level (not a DMS bit-gap ghost).
 * Ghost indices can still produce a plausible bboxFromCode that false-intersects.
 */
function isLiveCell(code: string, level: number): boolean {
  const b = geosot.bboxFromCode(code)
  const cx = (b.west + b.east) / 2
  const cy = (b.south + b.north) / 2
  return geosot.locToQuaternary(cx, cy, level) === code
}

/**
 * GeoSOT packs a sign bit into lng/lat indexes, so x/y are discontinuous at 0°.
 * Split the query into at most 4 same-sign orthants before xy iteration.
 */
function splitByHemisphere(bbox: BBox): BBox[] {
  const { west, south, east, north } = bbox
  const lngRanges: Array<[number, number]> =
    west < 0 && east > 0 ? [[west, 0], [0, east]] : [[west, east]]
  const latRanges: Array<[number, number]> =
    south < 0 && north > 0 ? [[south, 0], [0, north]] : [[south, north]]

  const parts: BBox[] = []
  for (const [w, e] of lngRanges) {
    for (const [s, n] of latRanges) {
      if (w < e && s < n) parts.push({ west: w, south: s, east: e, north: n })
    }
  }
  return parts
}

function coverBBoxOrthant(bbox: BBox, level: number): string[] {
  const { west, south, east, north } = bbox
  const sw = geosot.xyFromLngLat(west, south, level)
  const ne = geosot.xyFromLngLat(east, north, level)
  // ±1: grid-line corners belong to E/N cells; pad then filter.
  const minX = Math.min(sw.x, ne.x) - 1
  const maxX = Math.max(sw.x, ne.x) + 1
  const minY = Math.min(sw.y, ne.y) - 1
  const maxY = Math.max(sw.y, ne.y) + 1
  const est = (maxX - minX + 1) * (maxY - minY + 1)
  if (est > MAX_CELLS) {
    throw new Error(`coverBBox: too many cells (${est} > ${MAX_CELLS}) at level ${level}`)
  }
  const out: string[] = []
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      const code = geosot.toCode(idFromXY(x, y, level), level)
      const b = geosot.bboxFromCode(code)
      if (!(b.west <= east && b.east >= west && b.south <= north && b.north >= south)) {
        continue
      }
      if (!isLiveCell(code, level)) continue
      out.push(code)
    }
  }
  return out
}

export function coverBBox(bbox: BBox, level: number): string[] {
  if (level < 0 || level > 32) throw new Error(`invalid level: ${level}`)
  const { west, south, east, north } = bbox
  if (!(west < east && south < north)) {
    throw new Error("invalid bbox: require west < east and south < north")
  }

  const set = new Set<string>()
  for (const part of splitByHemisphere(bbox)) {
    for (const code of coverBBoxOrthant(part, level)) {
      set.add(code)
    }
  }
  return [...set]
}

/** Ray-casting; ring may be open or closed. */
function pointInRing(lng: number, lat: number, ring: LngLat[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const pi = ring[i]!
    const pj = ring[j]!
    const intersect =
      pi.lat > lat !== pj.lat > lat &&
      lng <
        ((pj.lng - pi.lng) * (lat - pi.lat)) / (pj.lat - pi.lat + Number.EPSILON) +
          pi.lng
    if (intersect) inside = !inside
  }
  return inside
}

function orient(ax: number, ay: number, bx: number, by: number, cx: number, cy: number) {
  return (by - ay) * (cx - bx) - (bx - ax) * (cy - by)
}

function onSegment(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number
) {
  return (
    Math.min(ax, bx) - 1e-12 <= cx &&
    cx <= Math.max(ax, bx) + 1e-12 &&
    Math.min(ay, by) - 1e-12 <= cy &&
    cy <= Math.max(ay, by) + 1e-12
  )
}

function segmentsIntersect(a: LngLat, b: LngLat, c: LngLat, d: LngLat): boolean {
  const o1 = orient(a.lng, a.lat, b.lng, b.lat, c.lng, c.lat)
  const o2 = orient(a.lng, a.lat, b.lng, b.lat, d.lng, d.lat)
  const o3 = orient(c.lng, c.lat, d.lng, d.lat, a.lng, a.lat)
  const o4 = orient(c.lng, c.lat, d.lng, d.lat, b.lng, b.lat)

  if (o1 * o2 < 0 && o3 * o4 < 0) return true
  if (Math.abs(o1) < 1e-12 && onSegment(a.lng, a.lat, b.lng, b.lat, c.lng, c.lat)) {
    return true
  }
  if (Math.abs(o2) < 1e-12 && onSegment(a.lng, a.lat, b.lng, b.lat, d.lng, d.lat)) {
    return true
  }
  if (Math.abs(o3) < 1e-12 && onSegment(c.lng, c.lat, d.lng, d.lat, a.lng, a.lat)) {
    return true
  }
  if (Math.abs(o4) < 1e-12 && onSegment(c.lng, c.lat, d.lng, d.lat, b.lng, b.lat)) {
    return true
  }
  return false
}

function pointInBBox(p: LngLat, b: BBox): boolean {
  return p.lng >= b.west && p.lng <= b.east && p.lat >= b.south && p.lat <= b.north
}

/** True if GeoSOT cell rectangle intersects the polygon (incl. edge touch). */
function cellIntersectsPolygon(cell: BBox, ring: LngLat[]): boolean {
  const cx = (cell.west + cell.east) / 2
  const cy = (cell.south + cell.north) / 2
  if (pointInRing(cx, cy, ring)) return true

  const corners: LngLat[] = [
    { lng: cell.west, lat: cell.south },
    { lng: cell.east, lat: cell.south },
    { lng: cell.east, lat: cell.north },
    { lng: cell.west, lat: cell.north },
  ]
  for (const c of corners) {
    if (pointInRing(c.lng, c.lat, ring)) return true
  }

  for (const p of ring) {
    if (pointInBBox(p, cell)) return true
  }

  const cellEdges: Array<[LngLat, LngLat]> = [
    [corners[0]!, corners[1]!],
    [corners[1]!, corners[2]!],
    [corners[2]!, corners[3]!],
    [corners[3]!, corners[0]!],
  ]
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i]!
    const b = ring[i + 1]!
    for (const [c, d] of cellEdges) {
      if (segmentsIntersect(a, b, c, d)) return true
    }
  }
  return false
}

function ringBBox(ring: LngLat[]): BBox | null {
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  for (const p of ring) {
    west = Math.min(west, p.lng)
    east = Math.max(east, p.lng)
    south = Math.min(south, p.lat)
    north = Math.max(north, p.lat)
  }
  if (!(west < east && south < north)) return null
  return { west, south, east, north }
}

/**
 * Cover a polygon exterior ring with GeoSOT cells that intersect the polygon
 * (not merely its axis-aligned bounding box).
 *
 * Ring may be open or closed; needs ≥ 3 distinct vertices.
 */
export function coverPolygon(ring: LngLat[], level: number): string[] {
  if (level < 0 || level > 32) throw new Error(`invalid level: ${level}`)
  if (ring.length < 3) {
    throw new Error("invalid polygon: require at least 3 vertices")
  }

  const bbox = ringBBox(ring)
  if (!bbox) {
    throw new Error("invalid polygon: degenerate ring bbox")
  }

  const candidates = coverBBox(bbox, level)
  return candidates.filter((code) =>
    cellIntersectsPolygon(geosot.bboxFromCode(code), ring)
  )
}

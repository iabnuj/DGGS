import * as geosot from "./geosot"
import { idFromXY } from "./xy"

export type BBox = { west: number; south: number; east: number; north: number }

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

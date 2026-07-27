import * as geosot from "./geosot"
import { idFromXY } from "./xy"

export type BBox = { west: number; south: number; east: number; north: number }

const MAX_CELLS = 20000

export function coverBBox(bbox: BBox, level: number): string[] {
  if (level < 0 || level > 32) throw new Error(`invalid level: ${level}`)
  const { west, south, east, north } = bbox
  if (!(west < east && south < north)) {
    throw new Error("invalid bbox: require west < east and south < north")
  }
  const sw = geosot.xyFromLngLat(west, south, level)
  const ne = geosot.xyFromLngLat(east, north, level)
  const minX = Math.min(sw.x, ne.x)
  const maxX = Math.max(sw.x, ne.x)
  const minY = Math.min(sw.y, ne.y)
  const maxY = Math.max(sw.y, ne.y)
  const est = (maxX - minX + 1) * (maxY - minY + 1)
  if (est > MAX_CELLS) {
    throw new Error(`coverBBox: too many cells (${est} > ${MAX_CELLS}) at level ${level}`)
  }
  const out: string[] = []
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      const code = geosot.toCode(idFromXY(x, y, level), level)
      const b = geosot.bboxFromCode(code)
      if (b.west < east && b.east > west && b.south < north && b.north > south) {
        out.push(code)
      }
    }
  }
  return out
}

import { cover, geosot } from "@dggs/grid-core"

export type LngLat = { lng: number; lat: number }

/** Sample a polyline into unique GeoSOT codes at `level`. */
export function lineToGridCodes(
  points: LngLat[],
  level: number,
  samplesPerSegment = 24
): string[] {
  if (points.length === 0) return []
  const set = new Set<string>()
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!
    const b = points[i + 1]!
    const n = Math.max(2, samplesPerSegment)
    for (let s = 0; s <= n; s++) {
      const t = s / n
      const lng = a.lng + (b.lng - a.lng) * t
      const lat = a.lat + (b.lat - a.lat) * t
      set.add(geosot.locToQuaternary(lng, lat, level))
    }
  }
  if (points.length === 1) {
    set.add(geosot.locToQuaternary(points[0]!.lng, points[0]!.lat, level))
  }
  return [...set]
}

/** Cover polygon exterior ring via bbox (demo-grade approximation). */
export function polygonToGridCodes(ring: LngLat[], level: number): string[] {
  if (ring.length < 3) return lineToGridCodes(ring, level)
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
  if (!(west < east && south < north)) return []
  try {
    return cover.coverBBox({ west, south, east, north }, level)
  } catch {
    // Cap density: step down level until cover succeeds
    for (let lv = level - 1; lv >= 4; lv--) {
      try {
        return cover.coverBBox({ west, south, east, north }, lv)
      } catch {
        /* continue */
      }
    }
    return []
  }
}

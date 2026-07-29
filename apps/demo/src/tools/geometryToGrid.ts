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

/**
 * Cover polygon exterior ring via `@dggs/grid-core` `coverPolygon`.
 * On oversized requests, steps level down until cover succeeds.
 */
export function polygonToGridCodes(ring: LngLat[], level: number): string[] {
  if (ring.length < 3) return lineToGridCodes(ring, level)
  try {
    return cover.coverPolygon(ring, level)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!/too many cells/.test(msg)) throw err
    for (let lv = level - 1; lv >= 4; lv--) {
      try {
        return cover.coverPolygon(ring, lv)
      } catch (e2) {
        const m2 = e2 instanceof Error ? e2.message : String(e2)
        if (!/too many cells/.test(m2)) throw e2
      }
    }
    return []
  }
}

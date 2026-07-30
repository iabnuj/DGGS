/**
 * 方里网 ↔ GeoSOT mapping.
 *
 * A 方里格 is a 1 km × 1 km cell on the Gauss–Krüger plane, identified by the
 * SW-corner kilometer indices plus projection zone. Mapping to GeoSOT is
 * coverage-based (one 方里格 → many GeoSOT cells at a chosen level).
 *
 * Id string form: `FL6-20-4421-20450`
 *   FL{3|6}-{zone}-{northingKm}-{eastingKm}
 * where eastingKm = floor(ChineseY / 1000) and ChineseY = zone*1e6 + localY.
 */

import * as cover from "./cover"
import type { BBox } from "./cover"
import * as geosot from "./geosot"
import {
  fromChineseY,
  project,
  toChineseY,
  unproject,
  type ZoneWidth,
} from "./gaussKruger"

export type FangliId = {
  zoneWidth: ZoneWidth
  zone: number
  /** SW corner northing in km (floor(X/1000)). */
  northingKm: number
  /** SW corner easting in km of Chinese Y (floor(Y/1000), includes zone prefix). */
  eastingKm: number
  /** Cell edge in meters; default 1000. */
  cellM?: number
}

export function fangliCellSize(id: FangliId): number {
  return id.cellM ?? 1000
}

export function formatFangliId(id: FangliId): string {
  return `FL${id.zoneWidth}-${id.zone}-${id.northingKm}-${id.eastingKm}`
}

export function parseFangliId(text: string): FangliId {
  const m = text.trim().match(/^FL(3|6)-(\d+)-(-?\d+)-(\d+)$/i)
  if (!m) {
    throw new Error(`invalid fangli id "${text}", expect FL6-20-4421-20450`)
  }
  return {
    zoneWidth: Number(m[1]) as ZoneWidth,
    zone: Number(m[2]),
    northingKm: Number(m[3]),
    eastingKm: Number(m[4]),
  }
}

/** Lon/lat bbox of the 方里格 (four corners unprojected). */
export function fangliIdToBBox(id: FangliId): BBox {
  const s = fangliCellSize(id)
  const x0 = id.northingKm * 1000
  const Y0 = id.eastingKm * 1000
  const parsed = fromChineseY(Y0)
  const zone = parsed.zone > 0 ? parsed.zone : id.zone
  const y0 = parsed.zone > 0 ? parsed.yLocal : Y0 - id.zone * 1_000_000

  const pts = [
    unproject(x0, y0, zone, { zoneWidth: id.zoneWidth }),
    unproject(x0, y0 + s, zone, { zoneWidth: id.zoneWidth }),
    unproject(x0 + s, y0, zone, { zoneWidth: id.zoneWidth }),
    unproject(x0 + s, y0 + s, zone, { zoneWidth: id.zoneWidth }),
  ]
  return {
    west: Math.min(...pts.map((p) => p.lon)),
    east: Math.max(...pts.map((p) => p.lon)),
    south: Math.min(...pts.map((p) => p.lat)),
    north: Math.max(...pts.map((p) => p.lat)),
  }
}

/** 方里格 containing this lon/lat (SW-corner indexing). */
export function fangliFromLonLat(
  lon: number,
  lat: number,
  opts?: { zoneWidth?: ZoneWidth; cellM?: number }
): FangliId {
  const zoneWidth = opts?.zoneWidth ?? 6
  const cellM = opts?.cellM ?? 1000
  const p = project(lon, lat, { zoneWidth })
  const Y = toChineseY(p.zone, p.y)
  return {
    zoneWidth,
    zone: p.zone,
    northingKm: Math.floor(p.x / cellM),
    eastingKm: Math.floor(Y / cellM),
    cellM,
  }
}

/** 方里格 → GeoSOT codes covering its footprint at `level`. */
export function fangliToGeosot(id: FangliId, level: number): string[] {
  return cover.coverBBox(fangliIdToBBox(id), level)
}

/**
 * GeoSOT code → 方里格 set intersecting the cell bbox.
 * Samples corners + center (+ a few edge points).
 */
export function geosotToFangli(
  code: string,
  opts?: { zoneWidth?: ZoneWidth; cellM?: number }
): FangliId[] {
  const zoneWidth = opts?.zoneWidth ?? 6
  const cellM = opts?.cellM ?? 1000
  const b = geosot.bboxFromCode(code)
  const samples: Array<[number, number]> = [
    [b.west, b.south],
    [b.west, b.north],
    [b.east, b.south],
    [b.east, b.north],
    [(b.west + b.east) / 2, (b.south + b.north) / 2],
  ]
  for (let i = 1; i < 4; i++) {
    const t = i / 4
    samples.push([
      b.west + (b.east - b.west) * t,
      b.south + (b.north - b.south) * t,
    ])
  }
  const map = new Map<string, FangliId>()
  for (const [lon, lat] of samples) {
    const id = fangliFromLonLat(lon, lat, { zoneWidth, cellM })
    map.set(formatFangliId(id), id)
  }
  return [...map.values()]
}

/** GeoSOT level whose equatorial cell edge ≈ `cellM` meters. */
export function suggestFangliLevel(cellM = 1000): number {
  const L = Math.log2((180 * 110_574) / cellM)
  return Math.max(0, Math.min(32, Math.round(L)))
}

/**
 * Gauss–Krüger (Transverse Mercator) on CGCS2000 / WGS84 ellipsoid.
 * Used as the bridge between Chinese 方里网 (projected km grid) and lon/lat.
 */

export type Ellipsoid = {
  a: number
  f: number
}

/** CGCS2000 ≈ WGS84 for this purpose. */
export const CGCS2000: Ellipsoid = {
  a: 6378137,
  f: 1 / 298.257222101,
}

export type ZoneWidth = 3 | 6

export type Projected = {
  /** Northing X (meters). */
  x: number
  /** Easting from central meridian + 500 km false easting (meters), no zone prefix. */
  y: number
  zone: number
  zoneWidth: ZoneWidth
  /** Central meridian (degrees). */
  lon0: number
}

function ellipsoidDerived(ell: Ellipsoid) {
  const { a, f } = ell
  const b = a * (1 - f)
  const e2 = f * (2 - f)
  const ep2 = (a * a - b * b) / (b * b)
  return { a, b, e2, ep2 }
}

/** 6° band: zone = floor(lon/6)+1, lon0 = zone*6-3 (lon in [-180,180]). */
export function zoneOfLongitude(lon: number, zoneWidth: ZoneWidth): number {
  const L = ((lon + 180) % 360) - 180
  if (zoneWidth === 6) {
    return Math.floor(L / 6) + 1
  }
  // 3° bands: 1.5, 4.5, … → zone 1,2,…
  return Math.floor((L - 1.5) / 3) + 1
}

export function centralMeridian(zone: number, zoneWidth: ZoneWidth): number {
  if (zoneWidth === 6) return zone * 6 - 3
  return zone * 3
}

/** Full Chinese Y = zone*1e6 + (easting + 500000). */
export function toChineseY(zone: number, yLocal: number): number {
  return zone * 1_000_000 + yLocal
}

export function fromChineseY(Y: number): { zone: number; yLocal: number } {
  const zone = Math.floor(Y / 1_000_000)
  return { zone, yLocal: Y - zone * 1_000_000 }
}

/**
 * Forward: geodetic lon/lat (degrees) → Gauss–Krüger X/Y (meters).
 * Y is false-easting local (≈ 500000 ± Δ), not zone-prefixed.
 */
export function project(
  lon: number,
  lat: number,
  opts?: { zoneWidth?: ZoneWidth; zone?: number; ellipsoid?: Ellipsoid }
): Projected {
  const zoneWidth = opts?.zoneWidth ?? 6
  const ell = opts?.ellipsoid ?? CGCS2000
  const { a, e2, ep2 } = ellipsoidDerived(ell)
  const zone = opts?.zone ?? zoneOfLongitude(lon, zoneWidth)
  const lon0 = centralMeridian(zone, zoneWidth)

  const B = (lat * Math.PI) / 180
  const L = ((lon - lon0) * Math.PI) / 180
  const sinB = Math.sin(B)
  const cosB = Math.cos(B)
  const tanB = Math.tan(B)
  const N = a / Math.sqrt(1 - e2 * sinB * sinB)
  const T = tanB * tanB
  const C = ep2 * cosB * cosB
  const A = cosB * L
  const M =
    a *
    ((1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256) * B -
      ((3 * e2) / 8 + (3 * e2 * e2) / 32 + (45 * e2 * e2 * e2) / 1024) *
        Math.sin(2 * B) +
      ((15 * e2 * e2) / 256 + (45 * e2 * e2 * e2) / 1024) * Math.sin(4 * B) -
      ((35 * e2 * e2 * e2) / 3072) * Math.sin(6 * B))

  const x =
    M +
    (N * tanB) *
      ((A * A) / 2 +
        ((5 - T + 9 * C + 4 * C * C) * A * A * A * A) / 24 +
        ((61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6) / 720)
  const y =
    500_000 +
    N *
      (A +
        ((1 - T + C) * A * A * A) / 6 +
        ((5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5) / 120)

  return { x, y, zone, zoneWidth, lon0 }
}

/**
 * Inverse: Gauss–Krüger X / local Y → lon/lat (degrees).
 */
export function unproject(
  x: number,
  yLocal: number,
  zone: number,
  opts?: { zoneWidth?: ZoneWidth; ellipsoid?: Ellipsoid }
): { lon: number; lat: number } {
  const zoneWidth = opts?.zoneWidth ?? 6
  const ell = opts?.ellipsoid ?? CGCS2000
  const { a, e2, ep2 } = ellipsoidDerived(ell)
  const lon0 = centralMeridian(zone, zoneWidth)

  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2))
  const M = x
  const mu =
    M /
    (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256))
  const B1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 * e1) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu)

  const sinB1 = Math.sin(B1)
  const cosB1 = Math.cos(B1)
  const tanB1 = Math.tan(B1)
  const N1 = a / Math.sqrt(1 - e2 * sinB1 * sinB1)
  const R1 = (a * (1 - e2)) / Math.pow(1 - e2 * sinB1 * sinB1, 1.5)
  const T1 = tanB1 * tanB1
  const C1 = ep2 * cosB1 * cosB1
  const D = (yLocal - 500_000) / N1

  const lat =
    ((B1 -
      ((N1 * tanB1) / R1) *
        ((D * D) / 2 -
          ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4) / 24 +
          ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) *
            D ** 6) /
            720)) *
      180) /
    Math.PI

  const lon =
    lon0 +
    (((D -
      ((1 + 2 * T1 + C1) * D ** 3) / 6 +
      ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5) /
        120) /
      cosB1) *
      180) /
      Math.PI

  return { lon, lat }
}

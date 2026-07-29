/** Approx meters per degree latitude (same heuristic as analysis / gridLayer). */
const METERS_PER_DEG = 110_574

const MIN_LEVEL = 8
const MAX_LEVEL = 16
const MAX_SAMPLES = 2_000

export type SuggestIngestLevelResult = {
  level: number
  /** Characteristic length in meters used for mapping (null if fallback). */
  featureMeters: number | null
  reason: string
  fromFallback: boolean
}

export type SuggestIngestLevelOptions = {
  fallbackLevel: number
  minLevel?: number
  maxLevel?: number
}

type Feature = {
  type: "Feature"
  geometry: {
    type: string
    coordinates?: unknown
  } | null
}

type FeatureCollection = {
  type: "FeatureCollection"
  features: Feature[]
}

function clampLevel(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(n)))
}

/** Equator-ish GeoSOT cell edge length in meters. */
export function cellSizeMeters(level: number): number {
  return (180 / 2 ** level) * METERS_PER_DEG
}

/**
 * Coarsest level in [min,max] whose cell edge is ≤ feature length `d`.
 * Larger `d` → coarser (smaller) level.
 */
export function levelForFeatureMeters(
  d: number,
  minLevel = MIN_LEVEL,
  maxLevel = MAX_LEVEL
): number {
  if (!(d > 0) || !Number.isFinite(d)) return maxLevel
  for (let L = minLevel; L <= maxLevel; L++) {
    if (cellSizeMeters(L) <= d) return L
  }
  return maxLevel
}

function asPairs(coords: unknown): number[][] {
  if (!Array.isArray(coords)) return []
  return coords.filter(
    (c): c is number[] =>
      Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number"
  )
}

function distMeters(a: number[], b: number[]): number {
  const dLon = (b[0]! - a[0]!) * Math.cos((((a[1]! + b[1]!) / 2) * Math.PI) / 180)
  const dLat = b[1]! - a[1]!
  return Math.hypot(dLon, dLat) * METERS_PER_DEG
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

function ringAreaMeters2(ring: number[][]): number {
  if (ring.length < 3) return 0
  let sum = 0
  const n = ring.length
  const lat0 = ring[0]![1]!
  const cos = Math.cos((lat0 * Math.PI) / 180)
  for (let i = 0; i < n; i++) {
    const [x0, y0] = ring[i]!
    const [x1, y1] = ring[(i + 1) % n]!
    sum += x0! * y1! * cos - x1! * y0! * cos
  }
  const deg2 = Math.abs(sum) / 2
  return deg2 * METERS_PER_DEG * METERS_PER_DEG
}

function pushLineLengths(coords: number[][], out: number[]) {
  for (let i = 0; i < coords.length - 1 && out.length < MAX_SAMPLES; i++) {
    const d = distMeters(coords[i]!, coords[i + 1]!)
    if (d > 0) out.push(d)
  }
}

function collectPointCoords(features: Feature[]): number[][] {
  const pts: number[][] = []
  for (const f of features) {
    const g = f.geometry
    if (!g) continue
    if (g.type === "Point") {
      const c = g.coordinates
      if (Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number") {
        pts.push([c[0], c[1]])
      }
    } else if (g.type === "MultiPoint") {
      for (const p of asPairs(g.coordinates)) pts.push(p)
    }
    if (pts.length >= MAX_SAMPLES) break
  }
  return pts
}

function nearestNeighborDistances(pts: number[][]): number[] {
  if (pts.length < 2) return []
  const sample = pts.length > 400 ? pts.filter((_, i) => i % Math.ceil(pts.length / 400) === 0) : pts
  const out: number[] = []
  for (let i = 0; i < sample.length && out.length < MAX_SAMPLES; i++) {
    let best = Infinity
    for (let j = 0; j < sample.length; j++) {
      if (i === j) continue
      const d = distMeters(sample[i]!, sample[j]!)
      if (d > 0 && d < best) best = d
    }
    if (Number.isFinite(best)) out.push(best)
  }
  return out
}

function bboxDiagonalMeters(pts: number[][]): number | null {
  if (pts.length === 0) return null
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  for (const [lon, lat] of pts) {
    west = Math.min(west, lon!)
    east = Math.max(east, lon!)
    south = Math.min(south, lat!)
    north = Math.max(north, lat!)
  }
  if (!(west < east || south < north)) return null
  return distMeters([west, south], [east, north])
}

function collectLineLengths(features: Feature[]): number[] {
  const out: number[] = []
  for (const f of features) {
    const g = f.geometry
    if (!g) continue
    if (g.type === "LineString") {
      pushLineLengths(asPairs(g.coordinates), out)
    } else if (g.type === "MultiLineString" && Array.isArray(g.coordinates)) {
      for (const line of g.coordinates) pushLineLengths(asPairs(line), out)
    }
    if (out.length >= MAX_SAMPLES) break
  }
  return out
}

function collectPolygonScales(features: Feature[]): number[] {
  const out: number[] = []
  const pushRing = (ring: number[][]) => {
    const area = ringAreaMeters2(ring)
    if (area > 0) out.push(Math.sqrt(area))
  }
  for (const f of features) {
    const g = f.geometry
    if (!g) continue
    if (g.type === "Polygon" && Array.isArray(g.coordinates)) {
      pushRing(asPairs(g.coordinates[0]))
    } else if (g.type === "MultiPolygon" && Array.isArray(g.coordinates)) {
      for (const poly of g.coordinates) {
        if (Array.isArray(poly)) pushRing(asPairs(poly[0]))
      }
    }
    if (out.length >= MAX_SAMPLES) break
  }
  return out
}

function parseFeatures(text: string): Feature[] {
  const parsed = JSON.parse(text) as unknown
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    (parsed as FeatureCollection).type === "FeatureCollection" &&
    Array.isArray((parsed as FeatureCollection).features)
  ) {
    return (parsed as FeatureCollection).features
  }
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    (parsed as Feature).type === "Feature"
  ) {
    return [parsed as Feature]
  }
  return []
}

function formatMeters(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(m >= 10_000 ? 0 : 1)} km`
  return `${Math.round(m)} m`
}

/**
 * Suggest GeoSOT ingest level from GeoJSON geometry scale (not camera height).
 */
export function suggestIngestLevel(
  text: string,
  options: SuggestIngestLevelOptions
): SuggestIngestLevelResult {
  const minLevel = options.minLevel ?? MIN_LEVEL
  const maxLevel = options.maxLevel ?? MAX_LEVEL
  const fallback = clampLevel(options.fallbackLevel, minLevel, maxLevel)

  let features: Feature[]
  try {
    features = parseFeatures(text)
  } catch {
    return {
      level: fallback,
      featureMeters: null,
      reason: "无法解析 GeoJSON，已回退到当前显示级",
      fromFallback: true,
    }
  }

  if (features.length === 0) {
    return {
      level: fallback,
      featureMeters: null,
      reason: "无要素，已回退到当前显示级",
      fromFallback: true,
    }
  }

  const lineLens = collectLineLengths(features)
  const polyScales = collectPolygonScales(features)
  const pts = collectPointCoords(features)
  let pointLens = nearestNeighborDistances(pts)
  if (pointLens.length === 0 && pts.length > 0) {
    const diag = bboxDiagonalMeters(pts)
    if (diag != null && diag > 0) {
      pointLens = [diag / Math.max(1, Math.sqrt(pts.length))]
    }
  }

  const parts: { kind: string; values: number[] }[] = []
  if (lineLens.length) parts.push({ kind: "线", values: lineLens })
  if (polyScales.length) parts.push({ kind: "面", values: polyScales })
  if (pointLens.length) parts.push({ kind: "点", values: pointLens })

  if (parts.length === 0) {
    return {
      level: fallback,
      featureMeters: null,
      reason: "无法估计几何尺度，已回退到当前显示级",
      fromFallback: true,
    }
  }

  const all = parts.flatMap((p) => p.values)
  const d = median(all)
  if (d == null || !(d > 0)) {
    return {
      level: fallback,
      featureMeters: null,
      reason: "无法估计几何尺度，已回退到当前显示级",
      fromFallback: true,
    }
  }

  const level = levelForFeatureMeters(d, minLevel, maxLevel)
  const kinds = parts.map((p) => p.kind).join("/")
  const label =
    parts.length === 1 && parts[0]!.kind === "线"
      ? "线要素中位段长"
      : parts.length === 1 && parts[0]!.kind === "面"
        ? "面要素特征边长"
        : parts.length === 1 && parts[0]!.kind === "点"
          ? "点间距中位数"
          : `${kinds}特征长度`

  return {
    level,
    featureMeters: d,
    reason: `${label} ≈ ${formatMeters(d)} → 建议 L${level}（格边 ≈ ${formatMeters(cellSizeMeters(level))}）`,
    fromFallback: false,
  }
}

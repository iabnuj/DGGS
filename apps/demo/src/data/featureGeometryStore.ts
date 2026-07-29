/** In-memory (+ localStorage) cache of original GIS geometries keyed by warehouse source. */

export type GisFeature = {
  id: string
  geometryType: string
  coordinates: unknown
}

const bySource = new Map<string, GisFeature[]>()
const LS_KEY = "dggs-demo-gis-features-v2"

type FeatureLike = {
  type?: string
  properties?: Record<string, unknown> | null
  geometry?: {
    type: string
    coordinates?: unknown
  } | null
}

type FcLike = {
  type?: string
  features?: FeatureLike[]
}

function featureId(f: FeatureLike, index: number): string {
  const p = f.properties
  if (p) {
    for (const key of ["osm_id", "id", "ID", "fid", "name"]) {
      const v = p[key]
      if (typeof v === "string" || typeof v === "number") return String(v)
    }
  }
  return `f${index}`
}

function flattenFeature(f: FeatureLike, index: number): GisFeature[] {
  const g = f.geometry
  if (!g?.type || g.coordinates == null) return []
  const id = featureId(f, index)
  const t = g.type
  if (t === "Point" || t === "LineString" || t === "Polygon") {
    return [{ id, geometryType: t, coordinates: g.coordinates }]
  }
  if (t === "MultiPoint" && Array.isArray(g.coordinates)) {
    return (g.coordinates as unknown[]).map((c, i) => ({
      id: `${id}:${i}`,
      geometryType: "Point",
      coordinates: c,
    }))
  }
  if (t === "MultiLineString" && Array.isArray(g.coordinates)) {
    return (g.coordinates as unknown[]).map((c, i) => ({
      id: `${id}:${i}`,
      geometryType: "LineString",
      coordinates: c,
    }))
  }
  if (t === "MultiPolygon" && Array.isArray(g.coordinates)) {
    return (g.coordinates as unknown[]).map((c, i) => ({
      id: `${id}:${i}`,
      geometryType: "Polygon",
      coordinates: c,
    }))
  }
  return []
}

export function parseGisFeaturesFromGeoJson(text: string): GisFeature[] {
  const parsed = JSON.parse(text) as unknown
  const features: FeatureLike[] =
    typeof parsed === "object" &&
    parsed !== null &&
    (parsed as FcLike).type === "FeatureCollection" &&
    Array.isArray((parsed as FcLike).features)
      ? (parsed as FcLike).features!
      : typeof parsed === "object" &&
          parsed !== null &&
          (parsed as FeatureLike).type === "Feature"
        ? [parsed as FeatureLike]
        : []

  const out: GisFeature[] = []
  features.forEach((f, i) => out.push(...flattenFeature(f, i)))
  return out
}

export function setSourceFeatures(source: string, features: GisFeature[]) {
  bySource.set(source, features)
  persistFeatureStore()
}

export function getSourceFeatures(source: string): GisFeature[] {
  return bySource.get(source) ?? []
}

export function hasSourceFeatures(source: string): boolean {
  return (bySource.get(source)?.length ?? 0) > 0
}

export function removeSourceFeatures(source: string) {
  bySource.delete(source)
  persistFeatureStore()
}

export function registerFromGeoJsonText(source: string, text: string): number {
  const features = parseGisFeaturesFromGeoJson(text)
  setSourceFeatures(source, features)
  return features.length
}

export function persistFeatureStore() {
  try {
    const obj: Record<string, GisFeature[]> = {}
    for (const [k, v] of bySource) obj[k] = v
    localStorage.setItem(LS_KEY, JSON.stringify(obj))
  } catch {
    // quota / private mode — keep memory only
  }
}

export function loadFeatureStoreFromLocalStorage() {
  try {
    let raw = localStorage.getItem(LS_KEY)
    // One-time migrate from v1; drop bogus cell-center point caches for line layers.
    if (!raw) {
      const legacy = localStorage.getItem("dggs-demo-gis-features-v1")
      if (legacy) {
        raw = legacy
        localStorage.removeItem("dggs-demo-gis-features-v1")
      }
    }
    if (!raw) return
    const obj = JSON.parse(raw) as Record<string, GisFeature[]>
    bySource.clear()
    for (const [k, v] of Object.entries(obj)) {
      if (!Array.isArray(v) || v.length === 0) continue
      if (isLikelySyntheticRoadPoints(k, v)) continue
      bySource.set(k, v)
    }
    persistFeatureStore()
  } catch {
    // ignore corrupt cache
  }
}

/** Old bug: missing GeoJSON → cell centers stored as Points for roads/buildings. */
function isLikelySyntheticRoadPoints(source: string, feats: GisFeature[]): boolean {
  const s = source.toLowerCase()
  const lineLike =
    s.includes("road") ||
    s.includes("street") ||
    s.includes("highway") ||
    s.includes("building")
  if (!lineLike) return false
  return feats.every((f) => f.geometryType === "Point")
}

/** Point markers at cell centers when a sample layer has no GeoJSON. */
export function registerPointsFromCodes(
  source: string,
  codes: string[],
  bboxFromCode: (code: string) => {
    west: number
    south: number
    east: number
    north: number
  }
) {
  const features: GisFeature[] = []
  const seen = new Set<string>()
  for (const code of codes) {
    if (seen.has(code)) continue
    seen.add(code)
    const b = bboxFromCode(code)
    features.push({
      id: code,
      geometryType: "Point",
      coordinates: [(b.west + b.east) / 2, (b.south + b.north) / 2],
    })
  }
  setSourceFeatures(source, features)
}

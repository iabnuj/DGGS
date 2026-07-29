import {
  ingestBBox,
  ingestPoint,
  type GridCellRecord,
} from "@dggs/grid-ingest"

type Feature = {
  type: "Feature"
  properties?: Record<string, unknown> | null
  geometry: {
    type: string
    coordinates?: unknown
  } | null
}

type FeatureCollection = {
  type: "FeatureCollection"
  features: Feature[]
}

function isFc(v: unknown): v is FeatureCollection {
  return (
    typeof v === "object" &&
    v !== null &&
    (v as FeatureCollection).type === "FeatureCollection" &&
    Array.isArray((v as FeatureCollection).features)
  )
}

function attrsFromProps(props: Record<string, unknown> | null | undefined) {
  const attrs: Record<string, string | number | boolean> = {}
  if (!props) return attrs
  for (const [k, v] of Object.entries(props)) {
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      attrs[k] = v
    }
  }
  return attrs
}

function asPairs(coords: unknown): number[][] {
  if (!Array.isArray(coords)) return []
  return coords.filter(
    (c): c is number[] =>
      Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number"
  )
}

function lineSamples(
  coords: number[][],
  level: number,
  source: string,
  label?: string,
  attrs: Record<string, string | number | boolean> = {}
) {
  const out: GridCellRecord[] = []
  const seen = new Set<string>()
  for (let i = 0; i < coords.length - 1; i++) {
    const [lon0, lat0] = coords[i]!
    const [lon1, lat1] = coords[i + 1]!
    for (let s = 0; s <= 16; s++) {
      const t = s / 16
      const lon = lon0! + (lon1! - lon0!) * t
      const lat = lat0! + (lat1! - lat0!) * t
      const rec = ingestPoint({ lon, lat, level, source, label, attrs })
      if (!seen.has(rec.gridId)) {
        seen.add(rec.gridId)
        out.push(rec)
      }
    }
  }
  return out
}

function coverRing(
  ring: number[][],
  level: number,
  source: string,
  label: string,
  attrs: Record<string, string | number | boolean>
): GridCellRecord[] {
  if (ring.length < 3) return []
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  for (const [lon, lat] of ring) {
    west = Math.min(west, lon!)
    east = Math.max(east, lon!)
    south = Math.min(south, lat!)
    north = Math.max(north, lat!)
  }
  if (!(west < east && south < north)) return []
  return ingestBBox({
    bbox: { west, south, east, north },
    level,
    source,
    label,
    attrs,
  })
}

/** Convert GeoJSON text into GridCellRecords (demo ingest). */
export function ingestGeoJsonText(
  text: string,
  options: { level: number; source: string; label?: string }
): GridCellRecord[] {
  const parsed = JSON.parse(text) as unknown
  const { level, source, label } = options
  const features: Feature[] = isFc(parsed)
    ? parsed.features
    : typeof parsed === "object" &&
        parsed !== null &&
        (parsed as Feature).type === "Feature"
      ? [parsed as Feature]
      : []

  const records: GridCellRecord[] = []
  for (const f of features) {
    const g = f.geometry
    if (!g) continue
    const attrs = attrsFromProps(f.properties)
    const name =
      label ??
      (typeof f.properties?.name === "string" ? f.properties.name : source)

    if (g.type === "Point") {
      const coords = g.coordinates
      if (!Array.isArray(coords) || typeof coords[0] !== "number") continue
      records.push(
        ingestPoint({
          lon: coords[0],
          lat: coords[1] as number,
          level,
          source,
          label: name,
          attrs,
        })
      )
    } else if (g.type === "MultiPoint") {
      for (const c of asPairs(g.coordinates)) {
        records.push(
          ingestPoint({
            lon: c[0]!,
            lat: c[1]!,
            level,
            source,
            label: name,
            attrs,
          })
        )
      }
    } else if (g.type === "LineString") {
      records.push(...lineSamples(asPairs(g.coordinates), level, source, name, attrs))
    } else if (g.type === "MultiLineString") {
      if (!Array.isArray(g.coordinates)) continue
      for (const line of g.coordinates) {
        records.push(...lineSamples(asPairs(line), level, source, name, attrs))
      }
    } else if (g.type === "Polygon") {
      if (!Array.isArray(g.coordinates)) continue
      records.push(...coverRing(asPairs(g.coordinates[0]), level, source, name, attrs))
    } else if (g.type === "MultiPolygon") {
      if (!Array.isArray(g.coordinates)) continue
      for (const poly of g.coordinates) {
        if (!Array.isArray(poly)) continue
        records.push(...coverRing(asPairs(poly[0]), level, source, name, attrs))
      }
    }
  }
  return records
}

export function layersFromRecords(records: GridCellRecord[]) {
  const bySource = new Map<string, GridCellRecord[]>()
  for (const r of records) {
    const list = bySource.get(r.source) ?? []
    list.push(r)
    bySource.set(r.source, list)
  }
  return [...bySource.entries()].map(([source, rows]) => {
    const levels = rows.map((r) => r.level)
    return {
      id: source,
      name: rows[0]?.label ?? source,
      type: source,
      count: new Set(rows.map((r) => r.gridId)).size,
      levelMin: Math.min(...levels),
      levelMax: Math.max(...levels),
      visible: true,
      source,
    }
  })
}

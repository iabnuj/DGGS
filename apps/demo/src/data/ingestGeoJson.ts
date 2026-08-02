import {
  clipLineStringToBBox,
  clipRingToBBox,
  ingestBBox,
  ingestPoint,
  pointInBBox,
  type CellRef,
  type GridCellRecord,
} from "@dggs/grid-ingest"
import { geosot } from "@dggs/grid-core"
import { useAppStore } from "@/state/store"

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

function featureIdFromProps(
  props: Record<string, unknown> | null | undefined,
  index: number
): string {
  if (props) {
    for (const key of ["osm_id", "id", "ID", "fid"]) {
      const v = props[key]
      if (typeof v === "string" || typeof v === "number") return String(v)
    }
  }
  return `f${index}`
}

function asPairs(coords: unknown): number[][] {
  if (!Array.isArray(coords)) return []
  return coords.filter(
    (c): c is number[] =>
      Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number"
  )
}

function makeRef(
  source: string,
  featureId: string,
  label?: string
): CellRef {
  return {
    objectId: featureId,
    uri: `source://${source}/${featureId}`,
    kind: "vector",
  }
}

/** Dense sample → unique cell codes crossed by a polyline. */
function cellsAlongLine(coords: number[][], level: number): string[] {
  const seen = new Set<string>()
  const cellDeg = 180 / 2 ** Math.max(1, level)
  const stepDeg = Math.max(cellDeg * 0.35, 1e-7)
  const push = (lon: number, lat: number) => {
    seen.add(geosot.locToQuaternary(lon, lat, level))
  }
  for (let i = 0; i < coords.length - 1; i++) {
    const [lon0, lat0] = coords[i]!
    const [lon1, lat1] = coords[i + 1]!
    const dLon = lon1! - lon0!
    const dLat = lat1! - lat0!
    const midLat = ((lat0! + lat1!) / 2) * (Math.PI / 180)
    const lenDeg = Math.hypot(dLon * Math.cos(midLat), dLat)
    const n = Math.max(1, Math.ceil(lenDeg / stepDeg))
    for (let s = 0; s <= n; s++) {
      const t = s / n
      push(lon0! + dLon * t, lat0! + dLat * t)
    }
  }
  if (coords.length === 1) push(coords[0]![0]!, coords[0]![1]!)
  return [...seen]
}

/**
 * Ingest a line: occupancy per crossed cell + clipped fragment + original ref.
 */
function ingestLineClipped(
  coords: number[][],
  level: number,
  source: string,
  label: string | undefined,
  featureId: string,
  attrs: Record<string, string | number | boolean>
): GridCellRecord[] {
  const ref = makeRef(source, featureId, label)
  const out: GridCellRecord[] = []
  for (const gridId of cellsAlongLine(coords, level)) {
    const cell = geosot.bboxFromCode(gridId)
    const parts = clipLineStringToBBox(coords, cell)
    if (parts.length === 0) continue
    const fragment =
      parts.length === 1
        ? {
            kind: "vector" as const,
            geometryType: "LineString" as const,
            coordinates: parts[0],
          }
        : {
            kind: "vector" as const,
            geometryType: "MultiLineString" as const,
            coordinates: parts,
          }
    out.push({
      gridId,
      level,
      source,
      featureId,
      label,
      attrs,
      ref,
      fragment,
    })
  }
  return out
}

function ingestPolygonClipped(
  ring: number[][],
  level: number,
  source: string,
  label: string,
  featureId: string,
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

  const ref = makeRef(source, featureId, label)
  // Cover by bbox then clip ring to each cell (approximation of true polygon cover).
  const base = ingestBBox({
    bbox: { west, south, east, north },
    level,
    source,
    label,
    featureId,
    attrs,
    ref,
  })
  const out: GridCellRecord[] = []
  for (const r of base) {
    const cell = geosot.bboxFromCode(r.gridId)
    const clipped = clipRingToBBox(ring, cell)
    if (clipped.length < 4) continue
    out.push({
      ...r,
      ref,
      fragment: {
        kind: "vector",
        geometryType: "Polygon",
        coordinates: [clipped],
      },
    })
  }
  return out
}

/** Convert GeoJSON text into GridCellRecords with ref + clipped fragment. */
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
  features.forEach((f, index) => {
    const g = f.geometry
    if (!g) return
    const attrs = attrsFromProps(f.properties)
    const featureId = featureIdFromProps(f.properties, index)
    const name =
      label ??
      (typeof f.properties?.name === "string" ? f.properties.name : source)
    const ref = makeRef(source, featureId, name)

    if (g.type === "Point") {
      const coords = g.coordinates
      if (!Array.isArray(coords) || typeof coords[0] !== "number") return
      const lon = coords[0]
      const lat = coords[1] as number
      records.push(
        ingestPoint({
          lon,
          lat,
          level,
          source,
          label: name,
          featureId,
          attrs,
          ref,
          fragment: {
            kind: "vector",
            geometryType: "Point",
            coordinates: [lon, lat],
          },
        })
      )
    } else if (g.type === "MultiPoint") {
      for (const c of asPairs(g.coordinates)) {
        if (!pointInBBox(c[0]!, c[1]!, { west: -180, south: -90, east: 180, north: 90 })) {
          // always true; keep for symmetry
        }
        records.push(
          ingestPoint({
            lon: c[0]!,
            lat: c[1]!,
            level,
            source,
            label: name,
            featureId,
            attrs,
            ref,
          })
        )
      }
    } else if (g.type === "LineString") {
      records.push(
        ...ingestLineClipped(asPairs(g.coordinates), level, source, name, featureId, attrs)
      )
    } else if (g.type === "MultiLineString") {
      if (!Array.isArray(g.coordinates)) return
      for (const line of g.coordinates) {
        records.push(
          ...ingestLineClipped(asPairs(line), level, source, name, featureId, attrs)
        )
      }
    } else if (g.type === "Polygon") {
      if (!Array.isArray(g.coordinates)) return
      records.push(
        ...ingestPolygonClipped(
          asPairs(g.coordinates[0]),
          level,
          source,
          name,
          featureId,
          attrs
        )
      )
    } else if (g.type === "MultiPolygon") {
      if (!Array.isArray(g.coordinates)) return
      for (const poly of g.coordinates) {
        if (!Array.isArray(poly)) continue
        records.push(
          ...ingestPolygonClipped(asPairs(poly[0]), level, source, name, featureId, attrs)
        )
      }
    }
  })
  return records
}

export function layersFromRecords(records: GridCellRecord[]) {
  const prev = new Map(
    useAppStore.getState().layers.map((l) => [l.id, l] as const)
  )
  const bySource = new Map<string, GridCellRecord[]>()
  for (const r of records) {
    const list = bySource.get(r.source) ?? []
    list.push(r)
    bySource.set(r.source, list)
  }
  return [...bySource.entries()].map(([source, rows]) => {
    const levels = rows.map((r) => r.level)
    const old = prev.get(source)
    const first = rows[0]
    return {
      id: source,
      name: first?.label ?? source,
      type:
        typeof first?.attrs?.field_value === "number"
          ? "field"
          : first?.ref?.kind === "raster"
            ? first.attrs?.modality === "dem"
              ? "dem"
              : "raster"
            : "vector",
      count: new Set(rows.map((r) => r.gridId)).size,
      levelMin: Math.min(...levels),
      levelMax: Math.max(...levels),
      visible: old?.visible ?? true,
      featuresVisible: old?.featuresVisible ?? false,
      source,
    }
  })
}

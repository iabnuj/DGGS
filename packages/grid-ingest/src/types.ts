/** Attribute bag hung on a grid cell after ingest. */
export type AttrValue = string | number | boolean | null
export type Attrs = Record<string, AttrValue>

/**
 * One row in the “grid warehouse”: geometry resolved to a cell id,
 * plus business source / time / attrs. Primary key conceptually:
 * (gridId, level, time?, source).
 */
export type GridCellRecord = {
  gridId: string
  level: number
  /** ISO-8601 timestamp; optional for static Demo layers. */
  time?: string
  /** Source id, e.g. "recon" | "weather" | "alert". */
  source: string
  label?: string
  attrs: Attrs
}

export type BBox = {
  west: number
  south: number
  east: number
  north: number
}

export type IngestMeta = {
  level: number
  source: string
  time?: string
  label?: string
  attrs?: Attrs
}

export type PointInput = IngestMeta & {
  lon: number
  lat: number
}

export type BBoxInput = IngestMeta & {
  bbox: BBox
}

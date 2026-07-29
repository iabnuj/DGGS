/** Attribute bag hung on a grid cell after ingest. */
export type AttrValue = string | number | boolean | null
export type Attrs = Record<string, AttrValue>

/**
 * One row in the “grid warehouse”: geometry resolved to a cell id,
 * plus business source / time / attrs. Primary key conceptually:
 * (gridId, level, time?, source, featureId?)
 *
 * `featureId` lets multiple features of the same source share one cell
 * (e.g. several OSM ways through the same grid).
 */
export type GridCellRecord = {
  gridId: string
  level: number
  /** ISO-8601 timestamp; optional for static Demo layers. */
  time?: string
  /** Source id, e.g. "recon" | "weather" | "alert". */
  source: string
  /**
   * Stable id within `source` (e.g. osm_id). Empty/undefined = single
   * occupancy per cell+source (legacy behavior).
   */
  featureId?: string
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
  featureId?: string
  attrs?: Attrs
}

export type PointInput = IngestMeta & {
  lon: number
  lat: number
}

export type BBoxInput = IngestMeta & {
  bbox: BBox
}

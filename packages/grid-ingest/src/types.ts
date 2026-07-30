/** Attribute bag hung on a grid cell after ingest. */
export type AttrValue = string | number | boolean | null
export type Attrs = Record<string, AttrValue>

export type BBox = {
  west: number
  south: number
  east: number
  north: number
}

/**
 * Pointer back to the original object (any modality: vector feature,
 * raster dataset, etc.). Query/display of full object uses this, not
 * re-intersection.
 */
export type CellRef = {
  /** Stable id within `source` (osm_id, raster id, …). */
  objectId: string
  /** Optional locator: path, URI, layer key, band, … */
  uri?: string
  /** Free-form modality hint. */
  kind?: "vector" | "raster" | "table" | "other"
}

/**
 * Content clipped (or summarized) to this cell — ready for map/analysis
 * without touching the original geometry/raster again.
 */
export type CellFragment =
  | {
      kind: "vector"
      geometryType: "Point" | "LineString" | "MultiLineString" | "Polygon"
      coordinates: unknown
    }
  | {
      kind: "raster"
      /** Cell-aligned chip extent (usually = cell bbox). */
      bbox: BBox
      /** Optional pointer to stored chip bytes / pyramid tile. */
      chipUri?: string
      width?: number
      height?: number
    }

/**
 * One row in the grid warehouse. Primary key conceptually:
 * (gridId, level, time?, source, featureId?)
 *
 * General ingest contract:
 * - `ref`     → original object reference
 * - `fragment`→ cell-local clipped / derived content for display & analysis
 */
export type GridCellRecord = {
  gridId: string
  level: number
  time?: string
  source: string
  featureId?: string
  label?: string
  attrs: Attrs
  ref?: CellRef
  fragment?: CellFragment
}

export type IngestMeta = {
  level: number
  source: string
  time?: string
  label?: string
  featureId?: string
  attrs?: Attrs
  ref?: CellRef
}

export type PointInput = IngestMeta & {
  lon: number
  lat: number
  fragment?: CellFragment
}

export type BBoxInput = IngestMeta & {
  bbox: BBox
}

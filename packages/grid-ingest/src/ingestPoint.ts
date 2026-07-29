import { geosot } from "@dggs/grid-core"
import type { GridCellRecord, PointInput } from "./types"

/** Encode a WGS84 point into one GridCellRecord. */
export function ingestPoint(input: PointInput): GridCellRecord {
  const { lon, lat, level, source, time, label, featureId, attrs } = input
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    throw new Error(`ingestPoint: invalid lon/lat (${lon}, ${lat})`)
  }
  if (!Number.isInteger(level) || level < 0 || level > 32) {
    throw new Error(`ingestPoint: level must be integer 0..32, got ${level}`)
  }
  if (!source) {
    throw new Error("ingestPoint: source is required")
  }

  return {
    gridId: geosot.locToQuaternary(lon, lat, level),
    level,
    time,
    source,
    featureId,
    label,
    attrs: attrs ?? {},
  }
}

/** Batch helper for point features. */
export function ingestPoints(inputs: PointInput[]): GridCellRecord[] {
  return inputs.map(ingestPoint)
}

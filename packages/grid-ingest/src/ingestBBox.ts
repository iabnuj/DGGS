import { cover, geosot } from "@dggs/grid-core"
import type { BBoxInput, GridCellRecord } from "./types"

/**
 * Cover a WGS84 bbox at `level` and emit one record per cell.
 * Each cell gets a polygon fragment = the cell rectangle (coverage chip)
 * plus optional ref from meta.
 */
export function ingestBBox(input: BBoxInput): GridCellRecord[] {
  const { bbox, level, source, time, label, featureId, attrs, ref } = input
  if (!source) {
    throw new Error("ingestBBox: source is required")
  }
  if (!Number.isInteger(level) || level < 0 || level > 32) {
    throw new Error(`ingestBBox: level must be integer 0..32, got ${level}`)
  }
  const { west, south, east, north } = bbox
  if (!(west < east && south < north)) {
    throw new Error(
      `ingestBBox: invalid bbox west<east && south<north (got ${west},${south},${east},${north})`
    )
  }

  const codes = cover.coverBBox(bbox, level)
  const shared = attrs ?? {}
  return codes.map((gridId) => {
    const cell = geosot.bboxFromCode(gridId)
    return {
      gridId,
      level,
      time,
      source,
      featureId,
      label,
      attrs: { ...shared },
      ref,
      fragment: {
        kind: "vector" as const,
        geometryType: "Polygon" as const,
        coordinates: [
          [
            [cell.west, cell.south],
            [cell.east, cell.south],
            [cell.east, cell.north],
            [cell.west, cell.north],
            [cell.west, cell.south],
          ],
        ],
      },
    }
  })
}

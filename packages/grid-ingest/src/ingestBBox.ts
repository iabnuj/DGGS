import { cover } from "@dggs/grid-core"
import type { BBoxInput, GridCellRecord } from "./types"

/**
 * Cover a WGS84 bbox at `level` and emit one record per cell
 * (same attrs/source/time hung on every covered cell).
 */
export function ingestBBox(input: BBoxInput): GridCellRecord[] {
  const { bbox, level, source, time, label, featureId, attrs } = input
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
  return codes.map((gridId) => ({
    gridId,
    level,
    time,
    source,
    featureId,
    label,
    attrs: { ...shared },
  }))
}

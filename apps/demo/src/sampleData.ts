import { geosot, cover, algebra } from "@dggs/grid-core"

export type SourceKind = "recon" | "weather" | "alert"

export type GridRecord = {
  gridId: string
  level: number
  source: SourceKind
  label: string
  attrs: Record<string, string | number>
}

/** Beijing-area sample sources for the multi-source overlay story. */
export function buildSampleRecords(level = 12): GridRecord[] {
  const reconPoints = [
    { lng: 116.391, lat: 39.907, label: "侦察点 A", attrs: { type: "UAV", confidence: 0.86 } },
    { lng: 116.407, lat: 39.918, label: "侦察点 B", attrs: { type: "HUMINT", confidence: 0.72 } },
    { lng: 116.368, lat: 39.889, label: "侦察点 C", attrs: { type: "SAR", confidence: 0.91 } },
  ]

  const weatherPoints = [
    { lng: 116.385, lat: 39.912, label: "气象格点", attrs: { wind: "NE 6m/s", temp: "18°C" } },
    { lng: 116.42, lat: 39.9, label: "气象格点", attrs: { wind: "E 4m/s", temp: "17°C" } },
  ]

  const alertBBox = { west: 116.37, south: 39.89, east: 116.41, north: 39.92 }
  const alertCells = cover.coverBBox(alertBBox, level)

  const out: GridRecord[] = []

  for (const p of reconPoints) {
    out.push({
      gridId: geosot.locToQuaternary(p.lng, p.lat, level),
      level,
      source: "recon",
      label: p.label,
      attrs: p.attrs,
    })
  }
  for (const p of weatherPoints) {
    out.push({
      gridId: geosot.locToQuaternary(p.lng, p.lat, level),
      level,
      source: "weather",
      label: p.label,
      attrs: p.attrs,
    })
  }
  for (const gridId of alertCells) {
    out.push({
      gridId,
      level,
      source: "alert",
      label: "告警覆盖区",
      attrs: { level: "橙", areaId: "ALERT-BJ-01" },
    })
  }
  return out
}

export function recordsForCell(
  records: GridRecord[],
  code: string
): GridRecord[] {
  const level = geosot.getLevel(code)
  return records.filter((r) => {
    if (r.gridId === code) return true
    // match if sample is finer and rolls up into selected cell
    if (r.level > level) {
      try {
        return algebra.aggregate([r.gridId], level)[0] === code
      } catch {
        return false
      }
    }
    // or selected is finer under the sample cell
    if (r.level < level) {
      try {
        return algebra.aggregate([code], r.level)[0] === r.gridId
      } catch {
        return false
      }
    }
    return false
  })
}

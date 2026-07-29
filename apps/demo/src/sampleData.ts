import {
  ingestBBox,
  ingestPoints,
  type GridCellRecord,
} from "@dggs/grid-ingest"

export type SourceKind = "recon" | "weather" | "alert"

/** Demo-facing alias; same shape as GridCellRecord with typed source. */
export type GridRecord = Omit<GridCellRecord, "source"> & { source: SourceKind }

/** Beijing-area sample sources for the multi-source overlay story. */
export function buildSampleRecords(level = 12): GridRecord[] {
  const recon = ingestPoints([
    {
      lon: 116.391,
      lat: 39.907,
      level,
      source: "recon",
      label: "侦察点 A",
      attrs: { type: "UAV", confidence: 0.86 },
    },
    {
      lon: 116.407,
      lat: 39.918,
      level,
      source: "recon",
      label: "侦察点 B",
      attrs: { type: "HUMINT", confidence: 0.72 },
    },
    {
      lon: 116.368,
      lat: 39.889,
      level,
      source: "recon",
      label: "侦察点 C",
      attrs: { type: "SAR", confidence: 0.91 },
    },
  ]) as GridRecord[]

  const weather = ingestPoints([
    {
      lon: 116.385,
      lat: 39.912,
      level,
      source: "weather",
      label: "气象格点",
      attrs: { wind: "NE 6m/s", temp: "18°C" },
    },
    {
      lon: 116.42,
      lat: 39.9,
      level,
      source: "weather",
      label: "气象格点",
      attrs: { wind: "E 4m/s", temp: "17°C" },
    },
  ]) as GridRecord[]

  const alert = ingestBBox({
    bbox: { west: 116.37, south: 39.89, east: 116.41, north: 39.92 },
    level,
    source: "alert",
    label: "告警覆盖区",
    attrs: { level: "橙", areaId: "ALERT-BJ-01" },
  }) as GridRecord[]

  return [...recon, ...weather, ...alert]
}

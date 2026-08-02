import { geosot } from "@dggs/grid-core"
import { ingestFieldRecords, type FieldIngestMeta } from "./ingestField"
import type { GridCellRecord } from "./types"

const LON_KEYS = ["lon", "longitude", "lng", "x"]
const LAT_KEYS = ["lat", "latitude", "y"]
const VALUE_KEYS = ["value", "val", "temperature", "temp", "pressure", "wind", "elevation", "z"]

export type FieldCsvParseResult = {
  records: GridCellRecord[]
  valueColumn: string
  pointCount: number
  cellCount: number
  unit?: string
}

function normHeader(h: string): string {
  return h.trim().toLowerCase().replace(/^\ufeff/, "")
}

/** 简易 CSV 行解析（支持双引号字段） */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let inQuotes = false
  const s = text.replace(/^\ufeff/, "")
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cell += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === ",") {
      row.push(cell)
      cell = ""
      continue
    }
    if (ch === "\n") {
      row.push(cell)
      cell = ""
      if (row.some((c) => c.trim() !== "")) rows.push(row)
      row = []
      continue
    }
    if (ch === "\r") continue
    cell += ch
  }
  row.push(cell)
  if (row.some((c) => c.trim() !== "")) rows.push(row)
  return rows
}

function findCol(headers: string[], keys: string[]): number {
  for (const key of keys) {
    const i = headers.indexOf(key)
    if (i >= 0) return i
  }
  return -1
}

/**
 * 将 CSV 文本解析为标量场 GridCellRecord[]。
 * 同格多点取均值。
 */
export function ingestFieldCsv(
  text: string,
  meta: Omit<FieldIngestMeta, "unit"> & { unit?: string }
): FieldCsvParseResult {
  const rows = parseCsvRows(text)
  if (rows.length < 2) {
    throw new Error("CSV 为空或缺少表头")
  }
  const headers = rows[0].map(normHeader)
  const lonIdx = findCol(headers, LON_KEYS)
  const latIdx = findCol(headers, LAT_KEYS)
  if (lonIdx < 0 || latIdx < 0) {
    throw new Error(
      `CSV 需包含经纬度列（lon/lat 或 longitude/latitude），当前列: ${headers.join(", ")}`
    )
  }

  let valueIdx = findCol(headers, VALUE_KEYS)
  if (valueIdx < 0) {
    valueIdx = headers.findIndex((h, i) => {
      if (i === lonIdx || i === latIdx) return false
      if (["unit", "time", "name", "id", "source"].includes(h)) return false
      const sample = rows[1]?.[i]
      return sample != null && sample !== "" && Number.isFinite(Number(sample))
    })
  }
  if (valueIdx < 0) {
    throw new Error("CSV 未找到数值列（value 或其它数值字段）")
  }

  const unitIdx = findCol(headers, ["unit"])
  const timeIdx = findCol(headers, ["time"])
  const nameIdx = findCol(headers, ["name", "label"])

  const sums = new Map<string, { sum: number; n: number }>()
  let unit = meta.unit
  let time = meta.time
  let label = meta.label
  let pointCount = 0

  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r]
    const lon = Number(cols[lonIdx])
    const lat = Number(cols[latIdx])
    const value = Number(cols[valueIdx])
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || !Number.isFinite(value)) {
      continue
    }
    pointCount++
    const code = geosot.locToQuaternary(lon, lat, meta.level)
    const cur = sums.get(code) ?? { sum: 0, n: 0 }
    cur.sum += value
    cur.n += 1
    sums.set(code, cur)
    if (!unit && unitIdx >= 0 && cols[unitIdx]) unit = cols[unitIdx]
    if (!time && timeIdx >= 0 && cols[timeIdx]) time = cols[timeIdx]
    if (!label && nameIdx >= 0 && cols[nameIdx]) label = cols[nameIdx]
  }

  if (pointCount === 0) {
    throw new Error("CSV 中没有有效的 lon/lat/value 行")
  }

  const points = [...sums.entries()].map(([code, { sum, n }]) => ({
    code,
    value: sum / n,
  }))

  const records = ingestFieldRecords(points, {
    ...meta,
    unit,
    time,
    label: label ?? meta.label,
  })

  return {
    records,
    valueColumn: headers[valueIdx],
    pointCount,
    cellCount: records.length,
    unit,
  }
}

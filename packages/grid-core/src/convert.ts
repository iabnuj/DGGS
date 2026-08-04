/**
 * 一键换算枢纽：北斗格码 ↔ GeoSOT ↔ 经纬度 ↔ 方里网
 * 统一经格心经纬度对齐（Demo 实用转换，非正式国标认证）。
 */

import * as beidou from "./beidou"
import * as fangli from "./fangli"
import * as geosot from "./geosot"
import type { FangliId } from "./fangli"

export type ConvertSource =
  | { kind: "lonlat"; lon: number; lat: number }
  | { kind: "geosot"; code: string }
  | { kind: "beidou"; code: string }
  | { kind: "fangli"; id: string }

export type ConvertResult = {
  lon: number
  lat: number
  geosot: string
  geosotLevel: number
  beidou: string
  beidouLevel: number
  fangli: string
  fangliIds: FangliId[]
}

export type ConvertOptions = {
  /** GeoSOT 目标层级（默认由源推断或 12） */
  geosotLevel?: number
  /** 北斗目标层级 1–10（默认由源推断或 6） */
  beidouLevel?: number
}

function centerOfGeosot(code: string): { lon: number; lat: number; level: number } {
  const b = geosot.bboxFromCode(code)
  return {
    lon: (b.west + b.east) / 2,
    lat: (b.south + b.north) / 2,
    level: geosot.getLevel(code),
  }
}

function resolveLonLat(
  source: ConvertSource
): { lon: number; lat: number; geosotLevelHint?: number; beidouLevelHint?: number } {
  switch (source.kind) {
    case "lonlat":
      return { lon: source.lon, lat: source.lat }
    case "geosot": {
      const c = centerOfGeosot(source.code.trim())
      return { lon: c.lon, lat: c.lat, geosotLevelHint: c.level }
    }
    case "beidou": {
      const c = beidou.centerFromCode(source.code.trim())
      return {
        lon: c.lon,
        lat: c.lat,
        beidouLevelHint: c.level,
        geosotLevelHint: beidou.suggestGeosotLevel(c.level),
      }
    }
    case "fangli": {
      const id = fangli.parseFangliId(source.id.trim())
      const b = fangli.fangliIdToBBox(id)
      return {
        lon: (b.west + b.east) / 2,
        lat: (b.south + b.north) / 2,
        geosotLevelHint: fangli.suggestFangliLevel(id.cellM ?? 1000),
      }
    }
  }
}

/** 任一侧输入 → 四侧结果 */
export function convertAll(
  source: ConvertSource,
  opts: ConvertOptions = {}
): ConvertResult {
  const { lon, lat, geosotLevelHint, beidouLevelHint } = resolveLonLat(source)

  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    throw new Error("无法解析有效经纬度")
  }
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    throw new Error("经纬度超出范围")
  }

  const geosotLevel = Math.max(
    0,
    Math.min(32, opts.geosotLevel ?? geosotLevelHint ?? 12)
  )
  const beidouLevel = Math.max(
    1,
    Math.min(10, opts.beidouLevel ?? beidouLevelHint ?? 6)
  )

  const geosotCode = geosot.locToQuaternary(lon, lat, geosotLevel)
  const beidouCode = beidou.encode2D(lon, lat, beidouLevel)
  const fl = fangli.fangliFromLonLat(lon, lat, { zoneWidth: 6 })
  const fangliIds =
    source.kind === "geosot"
      ? fangli.geosotToFangli(source.code.trim())
      : [fl]

  return {
    lon,
    lat,
    geosot: geosotCode,
    geosotLevel,
    beidou: beidouCode,
    beidouLevel,
    fangli: fangli.formatFangliId(fl),
    fangliIds,
  }
}

/** 解析「经度,纬度」或「经度 纬度」文本 */
export function parseLonLatText(text: string): { lon: number; lat: number } {
  const m = text
    .trim()
    .replace(/[，]/g, ",")
    .match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/)
  if (!m) throw new Error('经纬度格式应为 "经度,纬度"，如 116.4,39.9')
  return { lon: Number(m[1]), lat: Number(m[2]) }
}

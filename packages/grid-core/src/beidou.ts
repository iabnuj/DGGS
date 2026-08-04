/**
 * 北斗二维网格位置码（GB/T 39409-2020 一脉）编解码。
 *
 * 算法移植自 MIT 开源库 ywx001/BeidouGridCodec（非官方认证实现）。
 * 仅覆盖二维 1–10 级；极区（|lat|≥88°）暂不支持。
 */

import { gridSize } from "./utils"

/** 各级网格尺寸（度）[经度, 纬度] */
const GRID_SIZES_DEG: Array<[number, number] | null> = [
  null,
  [6, 4],
  [0.5, 0.5],
  [0.25, 10 / 60],
  [1 / 60, 1 / 60],
  [4 / 3600, 4 / 3600],
  [2 / 3600, 2 / 3600],
  [1 / (4 * 3600), 1 / (4 * 3600)],
  [1 / (32 * 3600), 1 / (32 * 3600)],
  [1 / (256 * 3600), 1 / (256 * 3600)],
  [1 / (2048 * 3600), 1 / (2048 * 3600)],
]

/** 各级网格尺寸（秒）[经度, 纬度] */
const GRID_SIZES_SEC: Array<[number, number] | null> = [
  null,
  [21600, 14400],
  [1800, 1800],
  [900, 600],
  [60, 60],
  [4, 4],
  [2, 2],
  [0.25, 0.25],
  [0.03125, 0.03125],
  [0.00390625, 0.00390625],
  [0.00048828125, 0.00048828125],
]

/** 累计码长（含首字母半球位） */
const CODE_LENGTH_AT_LEVEL = [1, 4, 6, 7, 9, 11, 12, 14, 16, 18, 20]

type Hemisphere = "NE" | "NW" | "SE" | "SW"

function level3Map(h: Hemisphere): number[][] {
  switch (h) {
    case "NW":
      return [
        [1, 0],
        [3, 2],
        [5, 4],
      ]
    case "NE":
      return [
        [0, 1],
        [2, 3],
        [4, 5],
      ]
    case "SW":
      return [
        [5, 4],
        [3, 2],
        [1, 0],
      ]
    case "SE":
      return [
        [4, 5],
        [2, 3],
        [0, 1],
      ]
  }
}

function level6Map(h: Hemisphere): number[][] {
  switch (h) {
    case "NW":
      return [
        [1, 0],
        [3, 2],
      ]
    case "NE":
      return [
        [0, 1],
        [2, 3],
      ]
    case "SW":
      return [
        [3, 2],
        [1, 0],
      ]
    case "SE":
      return [
        [2, 3],
        [0, 1],
      ]
  }
}

function getHemisphere(lon: number, lat: number): Hemisphere {
  const latDir = lat >= 0 ? "N" : "S"
  const lngDir = lon >= 0 ? "E" : "W"
  return `${latDir}${lngDir}` as Hemisphere
}

function hemisphereFromCode(code: string): Hemisphere {
  if (code.length < 3) throw new Error("无效的北斗格码")
  const latDir = code.charAt(0) === "N" ? "N" : "S"
  const lngDir = Number.parseInt(code.slice(1, 3), 10) >= 31 ? "E" : "W"
  return `${latDir}${lngDir}` as Hemisphere
}

function adjustCounts(
  lng: number,
  lat: number,
  hemisphere: Hemisphere,
  maxLng: number,
  maxLat: number
): [number, number] {
  switch (hemisphere) {
    case "NW":
      return [maxLng - lng, lat]
    case "NE":
      return [lng, lat]
    case "SW":
      return [maxLng - lng, maxLat - lat]
    case "SE":
      return [lng, maxLat - lat]
  }
}

function toHexPair(lng: number, lat: number): string {
  return lng.toString(16).toUpperCase() + lat.toString(16).toUpperCase()
}

function encodeLevel1(lngCount: number, latCount: number): string {
  return String(lngCount).padStart(2, "0") + String.fromCharCode("A".charCodeAt(0) + latCount)
}

function encodeLevel3(lngCount: number, latCount: number, h: Hemisphere): string {
  const [lng, lat] = adjustCounts(lngCount, latCount, h, 1, 2)
  return String(level3Map(h)[lat]![lng]!)
}

function encodeLevel6(lngCount: number, latCount: number, h: Hemisphere): string {
  const [lng, lat] = adjustCounts(lngCount, latCount, h, 1, 1)
  return String(level6Map(h)[lat]![lng]!)
}

function encodeFragment(
  level: number,
  lngCount: number,
  latCount: number,
  hemisphere: Hemisphere
): string {
  switch (level) {
    case 1:
      return encodeLevel1(lngCount, latCount)
    case 2:
    case 4:
    case 5:
    case 7:
    case 8:
    case 9:
    case 10:
      return toHexPair(lngCount, latCount)
    case 3:
      return encodeLevel3(lngCount, latCount, hemisphere)
    case 6:
      return encodeLevel6(lngCount, latCount, hemisphere)
    default:
      throw new Error(`非法北斗层级: ${level}`)
  }
}

/** 北斗二维编码层级 1–10 */
export function encode2D(lon: number, lat: number, level: number): string {
  if (!(level >= 1 && level <= 10)) {
    throw new Error("北斗编码级别必须在 1–10")
  }
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    throw new Error("经纬度无效")
  }
  if (Math.abs(lat) >= 88) {
    throw new Error("极地区域北斗编码暂未实现")
  }

  let baseLng = 0
  let baseLat = 0
  const hemisphere = getHemisphere(lon, lat)
  let res = hemisphere.charAt(0)
  let latitude = lat
  let longitude = lon

  for (let i = 1; i <= level; i++) {
    const [lngSize, latSize] = GRID_SIZES_DEG[i]!
    const lngP = Math.floor((longitude - baseLng) / lngSize)
    const latP = Math.floor((Math.abs(latitude) - baseLat) / latSize)

    if (i === 1) {
      if (lngP < 0) baseLng += (-lngP - 1) * lngSize
      else baseLng += lngP * lngSize
      baseLat += latP * latSize
      res += encodeFragment(i, lngP + 31, latP, hemisphere)
      latitude = Math.abs(latitude)
      longitude = Math.abs(longitude)
    } else {
      baseLng += lngP * lngSize
      baseLat += latP * latSize
      res += encodeFragment(i, lngP, latP, hemisphere)
    }
  }
  return res
}

export function getLevel2D(code: string): number {
  const length = code.trim().length
  for (let i = 0; i < CODE_LENGTH_AT_LEVEL.length; i++) {
    if (CODE_LENGTH_AT_LEVEL[i] === length) return i
  }
  throw new Error(`无效的北斗二维格码长度: ${length}`)
}

function getCodeFragment(code: string, level: number): string {
  if (level === 0) return code.charAt(0)
  const start = CODE_LENGTH_AT_LEVEL[level - 1]!
  const end = CODE_LENGTH_AT_LEVEL[level]!
  return code.slice(start, end)
}

function decodeLevel3(fragment: string, code: string): [number, number] {
  const n = Number.parseInt(fragment, 10)
  const hemisphere = hemisphereFromCode(code)
  const map = level3Map(hemisphere)
  for (let i = 0; i < map.length; i++) {
    for (let j = 0; j < map[i]!.length; j++) {
      if (map[i]![j] === n) {
        return adjustCounts(j, i, hemisphere, 1, 2)
      }
    }
  }
  throw new Error(`无效的三级北斗格码片段: ${fragment}`)
}

function decodeLevel6(fragment: string, code: string): [number, number] {
  const n = Number.parseInt(fragment, 10)
  const hemisphere = hemisphereFromCode(code)
  const map = level6Map(hemisphere)
  for (let i = 0; i < map.length; i++) {
    for (let j = 0; j < map[i]!.length; j++) {
      if (map[i]![j] === n) {
        return adjustCounts(j, i, hemisphere, 1, 1)
      }
    }
  }
  throw new Error(`无效的六级北斗格码片段: ${fragment}`)
}

function getRowAndCol(fragment: string, level: number, code: string): [number, number] {
  const expect =
    CODE_LENGTH_AT_LEVEL[level]! - CODE_LENGTH_AT_LEVEL[level - 1]!
  if (fragment.length !== expect) {
    throw new Error(`北斗码片段长度错误: ${fragment}`)
  }
  switch (level) {
    case 1:
      return [
        Number.parseInt(fragment.slice(0, 2), 10),
        fragment.charCodeAt(2) - "A".charCodeAt(0),
      ]
    case 2:
    case 4:
    case 5:
    case 7:
    case 8:
    case 9:
    case 10:
      return [
        Number.parseInt(fragment.charAt(0), 16),
        Number.parseInt(fragment.charAt(1), 16),
      ]
    case 3:
      return decodeLevel3(fragment, code)
    case 6:
      return decodeLevel6(fragment, code)
    default:
      throw new Error(`不支持的北斗层级: ${level}`)
  }
}

function decodeN(code: string, n: number): [number, number] {
  const fragment = getCodeFragment(code, n)
  let [lng, lat] = getRowAndCol(fragment, n, code)
  if (n === 1) {
    if (lng === 0) throw new Error("暂不支持两极地区解码")
    lng = lng >= 31 ? lng - 31 : 30 - lng
  }
  const [lngSec, latSec] = GRID_SIZES_SEC[n]!
  return [lng * lngSec, lat * latSec]
}

export type BeidouDecodeResult = {
  /** 网格西南角（度） */
  lon: number
  lat: number
  level: number
  /** 该级格宽（度，经向） */
  sizeLonDeg: number
  /** 该级格高（度，纬向） */
  sizeLatDeg: number
}

/** 解码北斗二维格码 → 西南角经纬度 */
export function decode2D(codeRaw: string): BeidouDecodeResult {
  const code = codeRaw.trim().toUpperCase()
  if (!code) throw new Error("北斗格码不能为空")
  if (!/^[NS]/i.test(code)) throw new Error("北斗格码应以 N/S 开头")

  const level = getLevel2D(code)
  if (level < 1) throw new Error("北斗格码层级无效")

  const latDir = code.charAt(0) === "N" ? 1 : -1
  const lngPart = Number.parseInt(code.slice(1, 3), 10)
  const lngDir = lngPart >= 31 ? 1 : -1

  let lngInSec = 0
  let latInSec = 0
  for (let i = 1; i <= level; i++) {
    const [dLng, dLat] = decodeN(code, i)
    lngInSec += dLng
    latInSec += dLat
  }

  const [sizeLonDeg, sizeLatDeg] = GRID_SIZES_DEG[level]!
  return {
    lon: (lngInSec * lngDir) / 3600,
    lat: (latInSec * latDir) / 3600,
    level,
    sizeLonDeg,
    sizeLatDeg,
  }
}

/** 格心经纬度 */
export function centerFromCode(code: string): { lon: number; lat: number; level: number } {
  const d = decode2D(code)
  const lngSign = d.lon >= 0 ? 1 : -1
  const latSign = d.lat >= 0 ? 1 : -1
  return {
    lon: d.lon + lngSign * (d.sizeLonDeg / 2),
    lat: d.lat + latSign * (d.sizeLatDeg / 2),
    level: d.level,
  }
}

/** 由北斗层级估算接近的 GeoSOT 层级（按经向格宽） */
export function suggestGeosotLevel(beidouLevel: number): number {
  const sizes = GRID_SIZES_DEG[beidouLevel]
  if (!sizes) return 10
  const want = sizes[0]!
  for (let i = 0; i <= 32; i++) {
    const s = gridSize[i]
    if (s != null && s <= want) return i
  }
  return 32
}

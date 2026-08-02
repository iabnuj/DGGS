/**
 * 剖分格包络分析
 *
 * 给定一组 GeoSOT 编码，计算最小包围盒对应的网格编码集。
 * - envelope2D：二维点集/网格集 → 最小包围经纬度矩形 → 按指定层级 cover
 * - envelopeFromCodes：直接从编码集推导经纬度 bbox
 */

import * as geosot from "./geosot"
import * as cover from "./cover"

export interface BBox {
  west: number
  south: number
  east: number
  north: number
}

/** 从编码集中推导经纬度包围盒 */
export function bboxFromCodes(codes: string[]): BBox {
  let west = 180, south = 90, east = -180, north = -90
  for (const code of codes) {
    const b = geosot.bboxFromCode(code)
    if (b.west < west) west = b.west
    if (b.south < south) south = b.south
    if (b.east > east) east = b.east
    if (b.north > north) north = b.north
  }
  return { west, south, east, north }
}

/**
 * 计算点集/网格集的最小包围网格编码集合
 * @param codes 输入网格编码集
 * @param targetLevel 目标层级（入参 <1 则自动选择合适的层级）
 * @returns 包围网格编码集合
 */
export function envelope2D(codes: string[], targetLevel?: number): {
  codes: string[]
  bbox: BBox
  level: number
} {
  const bbox = bboxFromCodes(codes)
  const codeLevels = codes.map((c) => geosot.toId(c).level)
  const minLevel = Math.min(...codeLevels)

  // 自动选层级：取输入最粗层级再粗 1-2 级作为包络层级
  const level = targetLevel && targetLevel > 0
    ? targetLevel
    : Math.max(4, minLevel - 2)

  const envelopeCodes = cover.coverBBox(bbox, level)
  return { codes: envelopeCodes, bbox, level }
}

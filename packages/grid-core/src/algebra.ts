import * as geosot from "./geosot"
import * as morton from "./morton"
import { code2decimal, gridSize } from "./utils"

export function parent(code: string): string | null {
  const { id, level } = geosot.toId(code)
  if (level <= 0) return null
  const parentLevel = level - 1
  let mask = 0n
  for (let i = 0; i < parentLevel; i++) {
    mask |= 0x3n << ((31n - BigInt(i)) * 2n)
  }
  return geosot.toCode(id & mask, parentLevel)
}

export function children(code: string): [string, string, string, string] {
  const { id, level } = geosot.toId(code)
  const childLevel = level + 1
  if (childLevel > 32) {
    throw new Error(`cannot subdivide beyond level 32: ${code}`)
  }
  const shift = (31n - BigInt(level)) * 2n
  return [0, 1, 2, 3].map((q) =>
    geosot.toCode(id | (BigInt(q) << shift), childLevel)
  ) as [string, string, string, string]
}

/** Cell interior point + size; sign bit selects which side of the truncated corner is inside. */
function cellInterior(code: string): {
  lng: number
  lat: number
  level: number
  size: number
} {
  const { id, level } = geosot.toId(code)
  const size = gridSize[level]!
  const { l, b } = morton.inverseMagicbits(id)
  const shift = BigInt(32 - level)
  const l0 = (BigInt(l) >> shift) << shift
  const b0 = (BigInt(b) >> shift) << shift
  const lng0 = code2decimal(l0)
  const lat0 = code2decimal(b0)
  const lng = (l0 >> 31n) === 0n ? lng0 + size / 2 : lng0 - size / 2
  const lat = (b0 >> 31n) === 0n ? lat0 + size / 2 : lat0 - size / 2
  return { lng, lat, level, size }
}

export function neighbors(
  code: string,
  options?: { diagonal?: boolean }
): string[] {
  // Geographic ±cellSize adjacency (not raw x±1): GeoSOT packs a sign bit into
  // DMS fields, so signed xy is negative in W/S hemispheres and discontinuous at 0.
  const { lng, lat, level, size } = cellInterior(code)
  const deltas = options?.diagonal
    ? [
        [-1, -1], [0, -1], [1, -1],
        [-1, 0],           [1, 0],
        [-1, 1],  [0, 1],  [1, 1],
      ]
    : [
        [0, -1], [-1, 0], [1, 0], [0, 1],
      ]
  const out: string[] = []
  for (const [dx, dy] of deltas) {
    const nLng = lng + dx * size
    const nLat = lat + dy * size
    if (nLat < -90 || nLat > 90 || nLng < -180 || nLng > 180) continue
    out.push(geosot.locToQuaternary(nLng, nLat, level))
  }
  return out
}

export function aggregate(codes: string[], toLevel: number): string[] {
  if (toLevel < 0 || toLevel > 32) throw new Error(`invalid toLevel: ${toLevel}`)
  const set = new Set<string>()
  for (const code of codes) {
    let { id, level } = geosot.toId(code)
    if (level < toLevel) {
      throw new Error(`code level ${level} < toLevel ${toLevel}: ${code}`)
    }
    let mask = 0n
    for (let i = 0; i < toLevel; i++) {
      mask |= 0x3n << ((31n - BigInt(i)) * 2n)
    }
    set.add(geosot.toCode(id & mask, toLevel))
  }
  return [...set]
}

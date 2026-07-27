import * as geosot from "./geosot"
import * as morton from "./morton"

function idFromXY(x: number, y: number, level: number): bigint {
  const l = BigInt(x) << BigInt(32 - level)
  const b = BigInt(y) << BigInt(32 - level)
  return morton.magicbits(l, b)
}

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

export function neighbors(
  code: string,
  options?: { diagonal?: boolean }
): string[] {
  const { id, level } = geosot.toId(code)
  const { x, y } = geosot.xyFromId(id, level)
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
    const nx = x + dx
    const ny = y + dy
    if (nx < 0 || ny < 0) continue
    out.push(geosot.toCode(idFromXY(nx, ny, level), level))
  }
  return out
}

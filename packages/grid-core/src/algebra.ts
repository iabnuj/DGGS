import * as geosot from "./geosot"

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

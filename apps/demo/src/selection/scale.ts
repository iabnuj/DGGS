import { algebra, geosot } from "@dggs/grid-core"

export type ScaleResult = {
  level: number
  codes: string[]
}

function uniqueCodes(codes: string[]): string[] {
  return [...new Set(codes)]
}

/** 选中格码升到父级（编码层操作）。 */
export function coarsenSelection(codes: string[]): ScaleResult | null {
  if (codes.length === 0) return null
  const level = Math.min(...codes.map((c) => geosot.getLevel(c)))
  if (level <= 0) return null
  const toLevel = level - 1
  return {
    level: toLevel,
    codes: algebra.aggregate(codes, toLevel),
  }
}

/** 选中格码拆到子级（编码层操作）。 */
export function refineSelection(
  codes: string[],
  limit = 2_000
): ScaleResult | null {
  if (codes.length === 0) return null
  const level = geosot.getLevel(codes[0]!)
  if (level >= 32) return null
  const out: string[] = []
  for (const c of codes) {
    for (const kid of algebra.children(c)) {
      out.push(kid)
      if (out.length >= limit) break
    }
    if (out.length >= limit) break
  }
  return {
    level: level + 1,
    codes: uniqueCodes(out),
  }
}

/**
 * 剖分格布尔运算（交 / 并 / 差）
 *
 * 不同层级时先卷粗到双方最粗公共层级，再做集合运算。
 */
import * as algebra from "./algebra"
import * as geosot from "./geosot"

function levelOf(code: string): number {
  return geosot.toId(code).level
}

/** 双方编码中的最粗层级（数值最小） */
export function commonLevel(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) {
    throw new Error("boolean: empty inputs")
  }
  let min = 32
  for (const code of a) {
    const lv = levelOf(code)
    if (lv < min) min = lv
  }
  for (const code of b) {
    const lv = levelOf(code)
    if (lv < min) min = lv
  }
  return min
}

function atLevel(codes: string[], level: number): string[] {
  if (codes.length === 0) return []
  return algebra.aggregate(codes, level)
}

export function union(a: string[], b: string[]): string[] {
  if (a.length === 0) return [...new Set(b)]
  if (b.length === 0) return [...new Set(a)]
  const level = commonLevel(a, b)
  return [...new Set([...atLevel(a, level), ...atLevel(b, level)])]
}

export function intersect(a: string[], b: string[]): string[] {
  if (a.length === 0 || b.length === 0) return []
  const level = commonLevel(a, b)
  const B = new Set(atLevel(b, level))
  return atLevel(a, level).filter((c) => B.has(c))
}

/** A − B */
export function difference(a: string[], b: string[]): string[] {
  if (a.length === 0) return []
  if (b.length === 0) return [...new Set(a)]
  const level = commonLevel(a, b)
  const B = new Set(atLevel(b, level))
  return atLevel(a, level).filter((c) => !B.has(c))
}

export type BooleanOp = "union" | "intersect" | "difference"

export function booleanOp(
  op: BooleanOp,
  a: string[],
  b: string[]
): { codes: string[]; level: number } {
  const level =
    a.length === 0 && b.length === 0
      ? 0
      : a.length === 0
        ? Math.min(...b.map(levelOf))
        : b.length === 0
          ? Math.min(...a.map(levelOf))
          : commonLevel(a, b)
  const codes =
    op === "union"
      ? union(a, b)
      : op === "intersect"
        ? intersect(a, b)
        : difference(a, b)
  return { codes, level }
}

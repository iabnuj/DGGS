import * as morton from "./morton"

export function idFromXY(x: number, y: number, level: number): bigint {
  const shift = BigInt(32 - level)
  const l = BigInt(x >>> 0) << shift
  const b = BigInt(y >>> 0) << shift
  return morton.magicbits(l, b)
}

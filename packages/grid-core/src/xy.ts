import * as morton from "./morton"

export function idFromXY(x: number, y: number, level: number): bigint {
  const l = BigInt(x) << BigInt(32 - level)
  const b = BigInt(y) << BigInt(32 - level)
  return morton.magicbits(l, b)
}

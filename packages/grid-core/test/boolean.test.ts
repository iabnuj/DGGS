import { describe, expect, it } from "vitest"
import { geosot, boolean as bool } from "../src/index"

describe("boolean", () => {
  const a = [
    geosot.locToQuaternary(86.2, 42.2, 12),
    geosot.locToQuaternary(86.3, 42.2, 12),
    geosot.locToQuaternary(86.2, 42.3, 12),
  ]
  const b = [
    geosot.locToQuaternary(86.3, 42.2, 12),
    geosot.locToQuaternary(86.4, 42.2, 12),
  ]

  it("union merges unique cells", () => {
    const u = bool.union(a, b)
    expect(u.length).toBe(4)
  })

  it("intersect keeps overlap", () => {
    const i = bool.intersect(a, b)
    expect(i.length).toBe(1)
    expect(i[0]).toBe(geosot.locToQuaternary(86.3, 42.2, 12))
  })

  it("difference A-B removes overlap", () => {
    const d = bool.difference(a, b)
    expect(d.length).toBe(2)
    expect(d).not.toContain(geosot.locToQuaternary(86.3, 42.2, 12))
  })

  it("booleanOp reports level", () => {
    const r = bool.booleanOp("intersect", a, b)
    expect(r.level).toBe(12)
    expect(r.codes.length).toBe(1)
  })
})

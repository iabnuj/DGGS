import { describe, expect, it } from "vitest"
import { geosot, path, algebra } from "../src/index"

describe("path.findPath", () => {
  it("finds a short path between neighbors", () => {
    const start = geosot.locToQuaternary(86.25, 42.25, 12)
    const nbs = algebra.neighbors(start)
    expect(nbs.length).toBeGreaterThan(0)
    const goal = nbs[0]!
    const p = path.findPath(start, goal)
    expect(p).not.toBeNull()
    expect(p![0]).toBe(start)
    expect(p![p!.length - 1]).toBe(goal)
  })

  it("returns null when goal is blocked", () => {
    const start = geosot.locToQuaternary(86.25, 42.25, 12)
    const goal = algebra.neighbors(start)[0]!
    const p = path.findPath(start, goal, { isBlocked: (c) => c === goal })
    expect(p).toBeNull()
  })
})

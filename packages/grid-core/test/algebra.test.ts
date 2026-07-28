import { test, expect } from "vitest"
import { geosot, algebra } from "../src"

test("parent strips one quaternary digit", () => {
  const child = geosot.locToQuaternary(116.315228, 39.91028, 15)
  const p = algebra.parent(child)
  expect(p).toBe(geosot.locToQuaternary(116.315228, 39.91028, 14))
  expect(algebra.parent(geosot.locToQuaternary(116.315228, 39.91028, 1))).not.toBeNull()
  // level 0: toCode(id, 0) => "G"; getLevel("G") === 0 => parent returns null
  expect(algebra.parent("G")).toBeNull()
})

test("children nest under parent and cover point", () => {
  const parent = geosot.locToQuaternary(116.315228, 39.91028, 14)
  const kids = algebra.children(parent)
  expect(kids).toHaveLength(4)
  const fine = geosot.locToQuaternary(116.315228, 39.91028, 15)
  expect(kids).toContain(fine)
  for (const k of kids) {
    expect(algebra.parent(k)).toBe(parent)
  }
})

test("neighbors are mutual for cardinal directions", () => {
  const code = geosot.locToQuaternary(116.315228, 39.91028, 15)
  const n4 = algebra.neighbors(code)
  expect(n4).toHaveLength(4)
  expect(n4).not.toContain(code)
  for (const n of n4) {
    expect(algebra.neighbors(n)).toContain(code)
  }
})

test("diagonal neighbors length 8", () => {
  const code = geosot.locToQuaternary(116.315228, 39.91028, 15)
  expect(algebra.neighbors(code, { diagonal: true })).toHaveLength(8)
})

test("neighbors work in western / southern hemispheres", () => {
  const code = geosot.locToQuaternary(-100, -40, 10)
  const n4 = algebra.neighbors(code)
  expect(n4).toHaveLength(4)
  for (const n of n4) {
    expect(algebra.neighbors(n)).toContain(code)
  }
  expect(algebra.neighbors(code, { diagonal: true })).toHaveLength(8)
})

test("neighbors are complete near prime meridian / equator", () => {
  const code = geosot.locToQuaternary(0.001, 0.001, 15)
  const n4 = algebra.neighbors(code)
  expect(n4).toHaveLength(4)
  for (const n of n4) {
    expect(algebra.neighbors(n)).toContain(code)
  }
  // western neighbor crosses into the western hemisphere (GeoSOT G1*)
  expect(n4.some((n) => n.startsWith("G1"))).toBe(true)
})

test("aggregate rolls fine codes to coarse unique parents", () => {
  const a = geosot.locToQuaternary(116.315228, 39.91028, 18)
  const b = geosot.locToQuaternary(116.316, 39.911, 18)
  const coarse = algebra.aggregate([a, b, a], 15)
  expect(new Set(coarse).size).toBe(coarse.length)
  for (const c of coarse) {
    expect(geosot.getLevel(c)).toBe(15)
  }
  expect(coarse).toContain(geosot.locToQuaternary(116.315228, 39.91028, 15))
})

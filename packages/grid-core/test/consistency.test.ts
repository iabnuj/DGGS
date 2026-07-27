import { test, expect } from "vitest"
import { geosot, algebra } from "../src"

const samples: Array<[number, number, number]> = [
  [116.315228, 39.91028, 15],
  [76.233, 27.688, 20],
  [120.0, 30.0, 10],
]

test("encode decode level roundtrip via corner center-ish", () => {
  for (const [lng, lat, level] of samples) {
    const code = geosot.locToQuaternary(lng, lat, level)
    expect(geosot.getLevel(code)).toBe(level)
    const { id, level: lv } = geosot.toId(code)
    expect(geosot.toCode(id, lv)).toBe(code)
    const box = geosot.bboxFromCode(code)
    // bboxFromCode: west/south inclusive, east/north exclusive
    expect(lng).toBeGreaterThanOrEqual(box.west)
    expect(lng).toBeLessThan(box.east)
    expect(lat).toBeGreaterThanOrEqual(box.south)
    expect(lat).toBeLessThan(box.north)
  }
})

test("child prefix equals parent path", () => {
  const [lng, lat] = [116.315228, 39.91028]
  const fine = geosot.locToQuaternary(lng, lat, 16)
  const coarse = geosot.locToQuaternary(lng, lat, 12)
  let cur = fine
  while (geosot.getLevel(cur) > 12) {
    cur = algebra.parent(cur)!
  }
  expect(cur).toBe(coarse)
})

test("aggregate rejects invalid toLevel", () => {
  const code = geosot.locToQuaternary(116.315228, 39.91028, 15)
  expect(() => algebra.aggregate([code], -1)).toThrow(/invalid toLevel/)
  expect(() => algebra.aggregate([code], 33)).toThrow(/invalid toLevel/)
})

test("aggregate rejects code finer than toLevel", () => {
  const fine = geosot.locToQuaternary(116.315228, 39.91028, 18)
  expect(() => algebra.aggregate([fine], 20)).toThrow(/level 18 < toLevel 20/)
})

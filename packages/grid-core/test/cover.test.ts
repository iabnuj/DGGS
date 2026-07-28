import { test, expect } from "vitest"
import { geosot, cover } from "../src"

test("coverBBox includes the cell of an interior point", () => {
  const lng = 116.315228
  const lat = 39.91028
  const level = 12
  const cell = geosot.bboxFromLngLat(lng, lat, level)
  const codes = cover.coverBBox(
    {
      west: cell.west - 0.01,
      south: cell.south - 0.01,
      east: cell.east + 0.01,
      north: cell.north + 0.01,
    },
    level
  )
  expect(codes).toContain(geosot.locToQuaternary(lng, lat, level))
  expect(codes.length).toBeGreaterThan(1)
})

test("coverBBox rejects huge requests", () => {
  expect(() =>
    cover.coverBBox({ west: 70, south: 10, east: 140, north: 50 }, 20)
  ).toThrow(/too many cells/)
})

test("coverBBox includes cells that only touch on the west/south edge", () => {
  // Query west sits on a grid line; that longitude encodes into the western cell.
  // Strict b.east > west would drop it; ±1 pad + closed intersect keeps it.
  const level = 15
  const bbox = {
    west: 136.35,
    south: 49.06666666666667,
    east: 136.38333333333335,
    north: 49.1,
  }
  const codes = cover.coverBBox(bbox, level)
  expect(codes).toContain(geosot.locToQuaternary(bbox.west, bbox.south, level))
  expect(codes).toContain(geosot.locToQuaternary(bbox.west, (bbox.south + bbox.north) / 2, level))
  expect(codes).toContain(geosot.locToQuaternary(bbox.west, bbox.north, level))
})

test("coverBBox covers western hemisphere and crosses the prime meridian", () => {
  const level = 8
  const westOnly = cover.coverBBox(
    { west: -10, south: 40, east: -1, north: 55 },
    level
  )
  expect(westOnly.length).toBeGreaterThan(0)
  expect(westOnly).toContain(geosot.locToQuaternary(-5, 50, level))

  const crossing = cover.coverBBox(
    { west: -15, south: 35, east: 30, north: 65 },
    level
  )
  expect(crossing).toContain(geosot.locToQuaternary(-1.5, 52, level)) // UK
  expect(crossing).toContain(geosot.locToQuaternary(10, 52, level)) // Germany
})

test("bboxFromCode keeps western longitude negative", () => {
  const code = geosot.locToQuaternary(-5, 50, 8)
  const box = geosot.bboxFromCode(code)
  expect(box.west).toBeLessThan(0)
  expect(box.east).toBeLessThanOrEqual(0)
  expect(box.west).toBeLessThan(box.east)
})

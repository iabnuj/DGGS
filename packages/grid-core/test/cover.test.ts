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

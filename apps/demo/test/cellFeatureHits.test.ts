import { describe, expect, it } from "vitest"
import { gisFeatureIntersectsBBox } from "../src/data/cellFeatureHits"

const cell = { west: 86.39, south: 42.31, east: 86.40, north: 42.32 }

describe("gisFeatureIntersectsBBox", () => {
  it("detects line crossing the cell", () => {
    const hit = gisFeatureIntersectsBBox(
      {
        id: "1",
        geometryType: "LineString",
        coordinates: [
          [86.38, 42.315],
          [86.41, 42.315],
        ],
      },
      cell
    )
    expect(hit).toBe(true)
  })

  it("rejects line far away", () => {
    const hit = gisFeatureIntersectsBBox(
      {
        id: "2",
        geometryType: "LineString",
        coordinates: [
          [86.0, 42.0],
          [86.1, 42.0],
        ],
      },
      cell
    )
    expect(hit).toBe(false)
  })
})

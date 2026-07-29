import { describe, expect, it } from "vitest"
import { parseGisFeaturesFromGeoJson } from "../src/data/featureGeometryStore"

describe("parseGisFeaturesFromGeoJson", () => {
  it("flattens lines and points", () => {
    const text = JSON.stringify({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { osm_id: 1 },
          geometry: {
            type: "LineString",
            coordinates: [
              [116, 40],
              [116.1, 40.1],
            ],
          },
        },
        {
          type: "Feature",
          properties: { osm_id: 2 },
          geometry: { type: "Point", coordinates: [86.4, 42.3] },
        },
      ],
    })
    const feats = parseGisFeaturesFromGeoJson(text)
    expect(feats).toHaveLength(2)
    expect(feats[0]?.geometryType).toBe("LineString")
    expect(feats[1]?.geometryType).toBe("Point")
    expect(feats[0]?.id).toBe("1")
  })
})

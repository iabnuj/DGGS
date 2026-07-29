import { describe, expect, it } from "vitest"
import {
  cellSizeMeters,
  levelForFeatureMeters,
  suggestIngestLevel,
} from "../src/data/suggestIngestLevel"

describe("cellSizeMeters / levelForFeatureMeters", () => {
  it("maps feature length to coarsest level with cell ≤ d", () => {
    const d = cellSizeMeters(14)
    expect(levelForFeatureMeters(d)).toBe(14)
    // slightly larger than L14 cell → still L14 (L13 cell is bigger than d)
    expect(levelForFeatureMeters(d * 1.5)).toBe(14)
    // smaller than L14 cell → need finer
    expect(levelForFeatureMeters(d * 0.5)).toBe(15)
  })

  it("clamps to 8–16", () => {
    expect(levelForFeatureMeters(1e9)).toBe(8)
    expect(levelForFeatureMeters(1)).toBe(16)
  })
})

describe("suggestIngestLevel", () => {
  it("suggests from line segment lengths", () => {
    // ~0.01° ≈ 1.1 km east-west at mid-lat → around L14
    const fc = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: [
              [116.0, 40.0],
              [116.01, 40.0],
            ],
          },
        },
      ],
    }
    const r = suggestIngestLevel(JSON.stringify(fc), { fallbackLevel: 12 })
    expect(r.level).toBeGreaterThanOrEqual(13)
    expect(r.level).toBeLessThanOrEqual(15)
    expect(r.reason).toMatch(/线/)
    expect(r.fromFallback).toBe(false)
  })

  it("suggests from point spacing", () => {
    const fc = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: { type: "Point", coordinates: [116.0, 40.0] },
        },
        {
          type: "Feature",
          properties: {},
          geometry: { type: "Point", coordinates: [116.02, 40.0] },
        },
      ],
    }
    const r = suggestIngestLevel(JSON.stringify(fc), { fallbackLevel: 12 })
    expect(r.level).toBeGreaterThanOrEqual(12)
    expect(r.level).toBeLessThanOrEqual(15)
    expect(r.fromFallback).toBe(false)
  })

  it("falls back when empty", () => {
    const fc = { type: "FeatureCollection", features: [] }
    const r = suggestIngestLevel(JSON.stringify(fc), { fallbackLevel: 11 })
    expect(r.level).toBe(11)
    expect(r.fromFallback).toBe(true)
  })
})

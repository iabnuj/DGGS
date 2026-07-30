import { describe, expect, it } from "vitest"
import { clipLineStringToBBox, clipRingToBBox, pointInBBox } from "../src/clip"

const cell = { west: 0, south: 0, east: 1, north: 1 }

describe("clipLineStringToBBox", () => {
  it("clips a line crossing the cell", () => {
    const parts = clipLineStringToBBox(
      [
        [-1, 0.5],
        [2, 0.5],
      ],
      cell
    )
    expect(parts).toHaveLength(1)
    expect(parts[0]![0]![0]).toBeCloseTo(0)
    expect(parts[0]![1]![0]).toBeCloseTo(1)
  })

  it("returns empty when fully outside", () => {
    expect(
      clipLineStringToBBox(
        [
          [2, 2],
          [3, 3],
        ],
        cell
      )
    ).toHaveLength(0)
  })
})

describe("pointInBBox / clipRingToBBox", () => {
  it("tests points", () => {
    expect(pointInBBox(0.5, 0.5, cell)).toBe(true)
    expect(pointInBBox(2, 0.5, cell)).toBe(false)
  })

  it("clips a square overlapping the cell", () => {
    const ring = clipRingToBBox(
      [
        [-0.5, -0.5],
        [1.5, -0.5],
        [1.5, 1.5],
        [-0.5, 1.5],
        [-0.5, -0.5],
      ],
      cell
    )
    expect(ring.length).toBeGreaterThanOrEqual(4)
    for (const [x, y] of ring) {
      expect(x).toBeGreaterThanOrEqual(0 - 1e-9)
      expect(x).toBeLessThanOrEqual(1 + 1e-9)
      expect(y).toBeGreaterThanOrEqual(0 - 1e-9)
      expect(y).toBeLessThanOrEqual(1 + 1e-9)
    }
  })
})

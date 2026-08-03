import { describe, expect, it } from "vitest"
import {
  cosineSimilarity,
  embedFromClass,
  embedHistRgba,
  embedTextPrototype,
  labelFromSource,
  l2Normalize,
  parseEmbedding,
  searchTopK,
  stringifyEmbedding,
} from "../src"

describe("vector", () => {
  it("normalizes and cosine of identical is 1", () => {
    const a = l2Normalize([3, 4])
    expect(a[0]! + a[1]!).toBeCloseTo(1.4, 5)
    expect(cosineSimilarity(a, a)).toBeCloseTo(1, 6)
  })

  it("roundtrips embedding json", () => {
    const v = [0.1, 0.2, 0.3]
    expect(parseEmbedding(stringifyEmbedding(v))).toEqual(v)
  })
})

describe("embed", () => {
  it("class-only vectors differ by class", () => {
    const a = embedFromClass("road")
    const b = embedFromClass("building")
    expect(cosineSimilarity(a, b)).toBeLessThan(0.95)
    expect(cosineSimilarity(a, embedTextPrototype("道路路网"))).toBeGreaterThan(
      0.8
    )
  })

  it("hist embed is deterministic", () => {
    const rgba = new Uint8Array(4 * 4)
    for (let i = 0; i < rgba.length; i++) rgba[i] = (i * 17) & 255
    const u = embedHistRgba(rgba, "road")
    const v = embedHistRgba(rgba, "road")
    expect(u).toEqual(v)
  })
})

describe("search", () => {
  it("labelFromSource maps roads", () => {
    expect(labelFromSource("roads.geojson")).toBe("road")
  })

  it("searchTopK orders by score", () => {
    const q = embedFromClass("road")
    const hits = searchTopK(
      q,
      [
        { gridId: "a", vector: embedFromClass("building"), className: "building" },
        { gridId: "b", vector: embedFromClass("road"), className: "road" },
      ],
      5,
      0
    )
    expect(hits[0]?.gridId).toBe("b")
  })
})

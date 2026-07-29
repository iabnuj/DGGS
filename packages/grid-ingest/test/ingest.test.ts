import { describe, expect, it } from "vitest"
import { geosot } from "@dggs/grid-core"
import {
  groupByGrid,
  ingestBBox,
  ingestPoint,
  ingestPoints,
  recordsForCell,
} from "../src"

const LEVEL = 12
const BJ = { lon: 116.391, lat: 39.907 }

describe("ingestPoint", () => {
  it("encodes a point to a GridCellRecord", () => {
    const r = ingestPoint({
      ...BJ,
      level: LEVEL,
      source: "recon",
      label: "侦察点 A",
      attrs: { type: "UAV", confidence: 0.86 },
    })
    expect(r.gridId).toBe(geosot.locToQuaternary(BJ.lon, BJ.lat, LEVEL))
    expect(r.level).toBe(LEVEL)
    expect(r.source).toBe("recon")
    expect(r.attrs.confidence).toBe(0.86)
  })

  it("rejects bad level / missing source", () => {
    expect(() =>
      ingestPoint({ ...BJ, level: -1, source: "x" })
    ).toThrow(/level/)
    expect(() =>
      ingestPoint({ ...BJ, level: LEVEL, source: "" })
    ).toThrow(/source/)
  })
})

describe("ingestBBox", () => {
  it("emits one record per covered cell with shared attrs", () => {
    const bbox = { west: 116.37, south: 39.89, east: 116.41, north: 39.92 }
    const rows = ingestBBox({
      bbox,
      level: LEVEL,
      source: "alert",
      label: "告警覆盖区",
      attrs: { alertLevel: "橙", areaId: "ALERT-BJ-01" },
    })
    expect(rows.length).toBeGreaterThan(1)
    expect(new Set(rows.map((r) => r.gridId)).size).toBe(rows.length)
    for (const r of rows) {
      expect(r.source).toBe("alert")
      expect(r.attrs.areaId).toBe("ALERT-BJ-01")
      expect(geosot.getLevel(r.gridId)).toBe(LEVEL)
    }
  })

  it("rejects inverted bbox", () => {
    expect(() =>
      ingestBBox({
        bbox: { west: 117, south: 39, east: 116, north: 40 },
        level: 8,
        source: "alert",
      })
    ).toThrow(/bbox/)
  })
})

describe("overlay query", () => {
  it("groupByGrid stacks multi-source on same cell", () => {
    const a = ingestPoint({ ...BJ, level: LEVEL, source: "recon", attrs: { k: 1 } })
    const b = ingestPoint({
      lon: BJ.lon + 1e-7,
      lat: BJ.lat,
      level: LEVEL,
      source: "weather",
      attrs: { k: 2 },
    })
    // Same cell if points are close enough at L12
    const map = groupByGrid([a, b])
    if (a.gridId === b.gridId) {
      expect(map.get(a.gridId)?.map((r) => r.source).sort()).toEqual([
        "recon",
        "weather",
      ])
    } else {
      expect(map.size).toBe(2)
    }
  })

  it("recordsForCell matches parent roll-up", () => {
    const fine = ingestPoints([
      { ...BJ, level: 14, source: "recon", attrs: {} },
    ])
    const coarse = geosot.locToQuaternary(BJ.lon, BJ.lat, 10)
    const hits = recordsForCell(fine, coarse)
    expect(hits).toHaveLength(1)
    expect(hits[0]!.source).toBe("recon")
  })
})

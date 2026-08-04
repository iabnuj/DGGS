import { describe, expect, it } from "vitest"
import { beidou, convert, fangli, geosot } from "../src"

describe("beidou 2D", () => {
  it("roundtrips lon/lat at level 6", () => {
    const lon = 120.637779
    const lat = 31.272068
    const code = beidou.encode2D(lon, lat, 6)
    expect(code.startsWith("N")).toBe(true)
    expect(beidou.getLevel2D(code)).toBe(6)
    const c = beidou.centerFromCode(code)
    expect(Math.abs(c.lon - lon)).toBeLessThan(0.01)
    expect(Math.abs(c.lat - lat)).toBeLessThan(0.01)
    const again = beidou.encode2D(c.lon, c.lat, 6)
    expect(again).toBe(code)
  })

  it("decodes SW corner with consistent level length", () => {
    const code = beidou.encode2D(116.3974, 39.9093, 4)
    const d = beidou.decode2D(code)
    expect(d.level).toBe(4)
    expect(d.lon).toBeLessThanOrEqual(116.3974)
    expect(d.lat).toBeLessThanOrEqual(39.9093)
  })
})

describe("convertAll", () => {
  it("from lonlat fills all sides", () => {
    const r = convert.convertAll(
      { kind: "lonlat", lon: 116.4, lat: 39.9 },
      { geosotLevel: 12, beidouLevel: 5 }
    )
    expect(r.geosot.startsWith("G")).toBe(true)
    expect(geosot.getLevel(r.geosot)).toBe(12)
    expect(r.beidou.startsWith("N")).toBe(true)
    expect(r.beidouLevel).toBe(5)
    expect(r.fangli.startsWith("FL6-")).toBe(true)
    fangli.parseFangliId(r.fangli)
  })

  it("from geosot and beidou stay near same place", () => {
    const geosotCode = geosot.locToQuaternary(116.4, 39.9, 14)
    const a = convert.convertAll(
      { kind: "geosot", code: geosotCode },
      { beidouLevel: 6 }
    )
    const b = convert.convertAll(
      { kind: "beidou", code: a.beidou },
      { geosotLevel: 14 }
    )
    expect(Math.abs(a.lon - b.lon)).toBeLessThan(0.02)
    expect(Math.abs(a.lat - b.lat)).toBeLessThan(0.02)
  })

  it("parses lonlat text", () => {
    expect(convert.parseLonLatText("116.4, 39.9")).toEqual({
      lon: 116.4,
      lat: 39.9,
    })
  })
})

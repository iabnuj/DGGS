import { expect, test } from "vitest"
import * as fangli from "../src/fangli"
import * as gk from "../src/gaussKruger"
import * as geosot from "../src/geosot"

test("gaussKruger roundtrip near Beijing", () => {
  const lon = 116.391
  const lat = 39.907
  const p = gk.project(lon, lat, { zoneWidth: 6 })
  expect(p.zone).toBe(20)
  expect(p.lon0).toBe(117)
  expect(p.y).toBeGreaterThan(400_000)
  expect(p.y).toBeLessThan(600_000)
  const back = gk.unproject(p.x, p.y, p.zone, { zoneWidth: 6 })
  expect(back.lon).toBeCloseTo(lon, 5)
  expect(back.lat).toBeCloseTo(lat, 5)
})

test("chinese Y packs zone prefix", () => {
  const Y = gk.toChineseY(20, 512_345.6)
  expect(Math.floor(Y / 1_000_000)).toBe(20)
  const { zone, yLocal } = gk.fromChineseY(Y)
  expect(zone).toBe(20)
  expect(yLocal).toBeCloseTo(512_345.6, 3)
})

test("fangli id format parse", () => {
  const id = fangli.parseFangliId("FL6-20-4421-20450")
  expect(id).toEqual({
    zoneWidth: 6,
    zone: 20,
    northingKm: 4421,
    eastingKm: 20450,
  })
  expect(fangli.formatFangliId(id)).toBe("FL6-20-4421-20450")
})

test("fangliFromLonLat → fangliToGeosot covers point", () => {
  const lon = 116.391
  const lat = 39.907
  const fl = fangli.fangliFromLonLat(lon, lat, { zoneWidth: 6 })
  expect(fl.zone).toBe(20)
  expect(fangli.formatFangliId(fl)).toMatch(/^FL6-20-/)

  const level = fangli.suggestFangliLevel(1000)
  expect(level).toBeGreaterThanOrEqual(14)
  expect(level).toBeLessThanOrEqual(16)

  const codes = fangli.fangliToGeosot(fl, level)
  expect(codes.length).toBeGreaterThan(0)
  const hit = geosot.locToQuaternary(lon, lat, level)
  expect(codes).toContain(hit)
})

test("geosotToFangli returns at least the containing cell", () => {
  const lon = 116.391
  const lat = 39.907
  const level = 15
  const code = geosot.locToQuaternary(lon, lat, level)
  const fls = fangli.geosotToFangli(code, { zoneWidth: 6 })
  expect(fls.length).toBeGreaterThan(0)
  const mine = fangli.fangliFromLonLat(lon, lat, { zoneWidth: 6 })
  expect(fls.map(fangli.formatFangliId)).toContain(fangli.formatFangliId(mine))
})

test("fangli bbox roundtrips through unproject corners", () => {
  const fl = fangli.fangliFromLonLat(116.4, 39.9, { zoneWidth: 6 })
  const bbox = fangli.fangliIdToBBox(fl)
  expect(bbox.west).toBeLessThan(bbox.east)
  expect(bbox.south).toBeLessThan(bbox.north)
  // original point should sit inside (with small tolerance for projection)
  expect(116.4).toBeGreaterThanOrEqual(bbox.west - 1e-4)
  expect(116.4).toBeLessThanOrEqual(bbox.east + 1e-4)
  expect(39.9).toBeGreaterThanOrEqual(bbox.south - 1e-4)
  expect(39.9).toBeLessThanOrEqual(bbox.north + 1e-4)
})

import { describe, expect, it, beforeEach } from "vitest"
import { ingestPoint, ingestPoints } from "@dggs/grid-ingest"
import { geosot } from "@dggs/grid-core"
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { MemoryWarehouse } from "../src"
import { JsonFileWarehouse } from "../src/jsonFile"

const BJ = { lon: 116.391, lat: 39.907 }

describe("MemoryWarehouse", () => {
  let store: MemoryWarehouse

  beforeEach(async () => {
    store = new MemoryWarehouse()
    await store.put(
      ingestPoints([
        { ...BJ, level: 12, source: "recon", label: "A", attrs: { k: 1 } },
        {
          lon: 116.4,
          lat: 39.91,
          level: 12,
          source: "weather",
          attrs: { temp: 18 },
        },
      ])
    )
  })

  it("upserts by primary key", async () => {
    const row = ingestPoint({
      ...BJ,
      level: 12,
      source: "recon",
      label: "A2",
      attrs: { k: 9 },
    })
    await store.put([row])
    const hits = await store.list({ source: "recon" })
    expect(hits).toHaveLength(1)
    expect(hits[0]!.attrs.k).toBe(9)
    expect(hits[0]!.label).toBe("A2")
  })

  it("getByCell finds roll-up from finer rows", async () => {
    await store.clear()
    await store.put([
      ingestPoint({ ...BJ, level: 14, source: "recon", attrs: {} }),
    ])
    const coarse = geosot.locToQuaternary(BJ.lon, BJ.lat, 10)
    const hits = await store.getByCell(coarse)
    expect(hits).toHaveLength(1)
  })

  it("keeps multiple features in the same cell when featureId differs", async () => {
    await store.clear()
    const a = ingestPoint({
      ...BJ,
      level: 12,
      source: "roads",
      featureId: "100",
      attrs: { osm_id: 100 },
    })
    const b = ingestPoint({
      ...BJ,
      level: 12,
      source: "roads",
      featureId: "200",
      attrs: { osm_id: 200 },
    })
    expect(a.gridId).toBe(b.gridId)
    await store.put([a, b])
    const hits = await store.getByCell(a.gridId)
    expect(hits).toHaveLength(2)
    expect(hits.map((h) => h.featureId).sort()).toEqual(["100", "200"])
  })
})

describe("JsonFileWarehouse", () => {
  it("persists across instances", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "dggs-store-"))
    mkdirSync(dir, { recursive: true })
    const file = path.join(dir, "rows.json")
    try {
      const a = new JsonFileWarehouse(file)
      await a.put([
        ingestPoint({ ...BJ, level: 12, source: "recon", attrs: { n: 1 } }),
      ])
      const raw = readFileSync(file, "utf8")
      expect(JSON.parse(raw)).toHaveLength(1)

      const b = new JsonFileWarehouse(file)
      const rows = await b.list()
      expect(rows).toHaveLength(1)
      expect(rows[0]!.attrs.n).toBe(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

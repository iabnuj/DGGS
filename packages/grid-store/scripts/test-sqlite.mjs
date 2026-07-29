/**
 * SqliteWarehouse smoke tests under Electron's Node (better-sqlite3 ABI).
 * Run: pnpm --filter @dggs/grid-store test:sqlite
 */
import { createRequire } from "node:module"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const { SqliteWarehouse } = require(path.join(root, "dist/node.cjs"))
const { ingestPoint } = require(path.join(root, "../grid-ingest/dist/index.cjs"))

const BJ = { lon: 116.391, lat: 39.907 }

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

async function main() {
  const dir = mkdtempSync(path.join(tmpdir(), "dggs-sqlite-"))
  const file = path.join(dir, "t.sqlite")
  try {
    const a = new SqliteWarehouse(file)
    const fine = ingestPoint({ ...BJ, level: 14, source: "recon", attrs: { n: 1 } })
    await a.put([fine])
    a.close()

    const b = new SqliteWarehouse(file)
    const rows = await b.list()
    assert(rows.length === 1, `expected 1 row, got ${rows.length}`)
    assert(rows[0].attrs.n === 1, "attrs.n mismatch")

    // Parent prefix of GeoSOT quaternary code = coarser cell
    const coarse = fine.gridId.slice(0, -4)
    const hits = await b.getByCell(coarse)
    assert(hits.length === 1, `roll-up expected 1, got ${hits.length}`)

    const prefixed = await b.getByPrefix(coarse.slice(0, 4))
    assert(prefixed.length === 1, "prefix query failed")

    b.close()
    console.log("SqliteWarehouse tests OK")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

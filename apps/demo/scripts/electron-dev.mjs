import { spawn, spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"
import http from "node:http"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const electronPath = require("electron")

const demoRoot = path.resolve(__dirname, "..")
const repoRoot = path.resolve(demoRoot, "../..")
const viteBin = path.resolve(demoRoot, "node_modules/vite/bin/vite.js")
const mainEntry = path.join(demoRoot, "electron/main.mjs")

function waitForVite(timeoutMs = 120_000) {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get("http://127.0.0.1:5173/", (res) => {
        res.resume()
        resolve()
      })
      req.on("error", () => {
        if (Date.now() - started > timeoutMs) {
          reject(new Error("Timed out waiting for Vite on :5173"))
          return
        }
        setTimeout(tick, 250)
      })
    }
    tick()
  })
}

function buildPackages() {
  // Electron main loads packages/grid-store/dist — rebuild so schema migrations ship.
  for (const pkg of ["@dggs/grid-ingest", "@dggs/grid-store"]) {
    const s = spawnSync("pnpm", ["--filter", pkg, "build"], {
      cwd: repoRoot,
      stdio: "inherit",
      shell: true,
      env: process.env,
    })
    if (s.status !== 0) throw new Error(`build ${pkg} failed`)
  }
}

const vite = spawn(process.execPath, [viteBin, "--host", "127.0.0.1", "--port", "5173", "--strictPort"], {
  cwd: demoRoot,
  stdio: "inherit",
  env: { ...process.env, BROWSER: "none" },
})

async function main() {
  buildPackages()
  await waitForVite()
  const child = spawn(electronPath, [mainEntry], {
    cwd: demoRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
    },
  })

  const shutdown = () => {
    child.kill()
    vite.kill()
    process.exit(0)
  }
  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)

  child.on("exit", (code) => {
    vite.kill()
    process.exit(code ?? 0)
  })
}

main().catch((err) => {
  console.error(err)
  vite.kill()
  process.exit(1)
})

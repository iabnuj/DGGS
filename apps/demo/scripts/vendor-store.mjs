#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const demoRoot = path.resolve(__dirname, "..")
const src = path.resolve(demoRoot, "../../packages/grid-store/dist/node.cjs")
const destDir = path.join(demoRoot, "electron/vendor")
const dest = path.join(destDir, "grid-store-node.cjs")

if (!fs.existsSync(src)) {
  console.error("Missing", src, "— run: pnpm build:store")
  process.exit(1)
}
fs.mkdirSync(destDir, { recursive: true })
fs.copyFileSync(src, dest)
console.log("Vendored", dest)

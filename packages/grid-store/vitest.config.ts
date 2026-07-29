import { defineConfig } from "vitest/config"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@dggs/grid-ingest",
        replacement: path.join(root, "../grid-ingest/src/index.ts"),
      },
      {
        find: "@dggs/grid-core",
        replacement: path.join(root, "../grid-core/src/index.ts"),
      },
    ],
  },
  test: {
    include: ["test/**/*.test.ts"],
  },
})

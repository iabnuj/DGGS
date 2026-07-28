import { defineConfig } from "vite"
import path from "node:path"
import cesium from "vite-plugin-cesium"

export default defineConfig({
  plugins: [cesium()],
  resolve: {
    alias: {
      "@dggs/grid-core": path.resolve(
        __dirname,
        "../../packages/grid-core/src/index.ts"
      ),
    },
  },
  server: {
    port: 5173,
    open: true,
  },
})

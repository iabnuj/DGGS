import { defineConfig } from "vite"
import path from "node:path"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import cesium from "vite-plugin-cesium"

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), cesium()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@dggs/grid-core": path.resolve(
        __dirname,
        "../../packages/grid-core/src/index.ts"
      ),
      "@dggs/grid-ingest": path.resolve(
        __dirname,
        "../../packages/grid-ingest/src/index.ts"
      ),
      "@dggs/grid-store": path.resolve(
        __dirname,
        "../../packages/grid-store/src/index.ts"
      ),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    open: process.env.BROWSER !== "none",
  },
})

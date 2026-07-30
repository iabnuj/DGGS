/**
 * Shapefile / zip → GeoJSON FeatureCollection text (Electron main).
 * Prefer ogr2ogr (CRS → EPSG:4326); fallback to shpjs.
 */
import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"
import { existsSync } from "node:fs"

function runOgr2ogr(args, timeoutMs = 120_000) {
  return new Promise((resolve, reject) => {
    const child = spawn("ogr2ogr", args, {
      stdio: ["ignore", "pipe", "pipe"],
    })
    const chunks = []
    const errChunks = []
    const timer = setTimeout(() => {
      child.kill("SIGKILL")
      reject(new Error("ogr2ogr 超时"))
    }, timeoutMs)
    child.stdout.on("data", (d) => chunks.push(d))
    child.stderr.on("data", (d) => errChunks.push(d))
    child.on("error", (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      const stdout = Buffer.concat(chunks).toString("utf8")
      const stderr = Buffer.concat(errChunks).toString("utf8")
      if (code !== 0) {
        reject(new Error(stderr.trim() || `ogr2ogr 退出码 ${code}`))
        return
      }
      resolve(stdout)
    })
  })
}

async function viaOgr2ogr(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  let src = filePath
  if (ext === ".zip") {
    src = `/vsizip/${filePath}`
  }
  const text = await runOgr2ogr([
    "-f",
    "GeoJSON",
    "-t_srs",
    "EPSG:4326",
    "-lco",
    "RFC7946=YES",
    "/vsistdout/",
    src,
  ])
  if (!text.trim()) throw new Error("ogr2ogr 未输出 GeoJSON")
  JSON.parse(text) // validate
  return text
}

function sibling(filePath, ext) {
  const base = filePath.replace(/\.shp$/i, "")
  return `${base}${ext}`
}

async function viaShpjs(filePath) {
  const shp = (await import("shpjs")).default
  const ext = path.extname(filePath).toLowerCase()

  if (ext === ".zip") {
    const buf = await fs.readFile(filePath)
    const geojson = await shp(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
    return JSON.stringify(normalizeGeoJson(geojson))
  }

  if (ext !== ".shp") {
    throw new Error("仅支持 .shp 或 shapefile 的 .zip")
  }

  const dbfPath = sibling(filePath, ".dbf")
  const shxPath = sibling(filePath, ".shx")
  if (!existsSync(dbfPath)) {
    throw new Error(`缺少同目录 ${path.basename(dbfPath)}`)
  }
  if (!existsSync(shxPath)) {
    throw new Error(`缺少同目录 ${path.basename(shxPath)}`)
  }

  const [shpBuf, dbfBuf, prjBuf] = await Promise.all([
    fs.readFile(filePath),
    fs.readFile(dbfPath),
    existsSync(sibling(filePath, ".prj"))
      ? fs.readFile(sibling(filePath, ".prj"))
      : Promise.resolve(null),
  ])

  const input = {
    shp: shpBuf.buffer.slice(shpBuf.byteOffset, shpBuf.byteOffset + shpBuf.byteLength),
    dbf: dbfBuf.buffer.slice(dbfBuf.byteOffset, dbfBuf.byteOffset + dbfBuf.byteLength),
  }
  if (prjBuf) {
    input.prj = prjBuf.toString("utf8")
  }

  const geojson = await shp(input)
  return JSON.stringify(normalizeGeoJson(geojson))
}

function normalizeGeoJson(geojson) {
  if (!geojson) throw new Error("无法解析 Shapefile")
  // shpjs may return FeatureCollection or array of them (multi-layer zip)
  if (Array.isArray(geojson)) {
    const features = []
    for (const g of geojson) {
      if (g?.type === "FeatureCollection" && Array.isArray(g.features)) {
        features.push(...g.features)
      } else if (g?.type === "Feature") {
        features.push(g)
      }
    }
    return { type: "FeatureCollection", features }
  }
  if (geojson.type === "FeatureCollection") return geojson
  if (geojson.type === "Feature") {
    return { type: "FeatureCollection", features: [geojson] }
  }
  throw new Error("无法识别的 Shapefile 解析结果")
}

/**
 * @param {string} filePath
 * @returns {Promise<{ text: string; via: "ogr2ogr" | "shpjs" }>}
 */
export async function shapefileToGeoJson(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext !== ".shp" && ext !== ".zip") {
    throw new Error("仅支持 .shp 或 .zip")
  }

  try {
    const text = await viaOgr2ogr(filePath)
    return { text, via: "ogr2ogr" }
  } catch (ogrErr) {
    try {
      const text = await viaShpjs(filePath)
      return { text, via: "shpjs" }
    } catch (shpErr) {
      const a = ogrErr instanceof Error ? ogrErr.message : String(ogrErr)
      const b = shpErr instanceof Error ? shpErr.message : String(shpErr)
      throw new Error(`Shapefile 转换失败（ogr2ogr: ${a}；shpjs: ${b}）`)
    }
  }
}

export function shapefileDisplayName(filePath) {
  const base = path.basename(filePath)
  return base.replace(/\.(shp|zip)$/i, "") + ".shp"
}

/**
 * GeoTIFF → GeoSOT cell records + PNG chips (Electron main).
 * Assumes geographic CRS (WGS84) bounding boxes.
 */
import fs from "node:fs/promises"
import path from "node:path"
import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"

const require = createRequire(import.meta.url)

const CHIP_SIZE = 64
const MAX_CELLS = 4000
const MIN_LEVEL = 8
const MAX_LEVEL = 16
const METERS_PER_DEG = 110_574

function loadGridCore(isDev, __dirname) {
  const corePath = isDev
    ? path.resolve(__dirname, "../../../packages/grid-core/dist/index.js")
    : path.join(__dirname, "vendor", "grid-core.cjs")
  return require(corePath)
}

function cellSizeMeters(level) {
  return (180 / 2 ** level) * METERS_PER_DEG
}

function clampLevel(n, min = MIN_LEVEL, max = MAX_LEVEL) {
  return Math.max(min, Math.min(max, Math.round(n)))
}

function levelForFeatureMeters(d) {
  if (!(d > 0) || !Number.isFinite(d)) return MAX_LEVEL
  for (let L = MIN_LEVEL; L <= MAX_LEVEL; L++) {
    if (cellSizeMeters(L) <= d) return L
  }
  return MAX_LEVEL
}

function formatMeters(m) {
  if (m >= 1000) return `${(m / 1000).toFixed(m >= 10_000 ? 0 : 1)} km`
  return `${Math.round(m)} m`
}

function safeChipName(gridId) {
  return gridId.replace(/[^A-Za-z0-9._-]/g, "_") + ".png"
}

/** @param {import('geotiff').GeoTIFFImage} image */
function imageBBox(image) {
  const b = image.getBoundingBox()
  return {
    west: b[0],
    south: b[1],
    east: b[2],
    north: b[3],
  }
}

/** Map lon/lat bbox → pixel window [left, top, right, bottom] (half-open). */
function bboxToWindow(image, bbox) {
  const fb = image.getBoundingBox()
  const w = image.getWidth()
  const h = image.getHeight()
  const minX = fb[0]
  const minY = fb[1]
  const maxX = fb[2]
  const maxY = fb[3]
  const xScale = w / (maxX - minX)
  const yScale = h / (maxY - minY)
  let left = Math.floor((bbox.west - minX) * xScale)
  let right = Math.ceil((bbox.east - minX) * xScale)
  // GeoTIFF rows often start at north
  let top = Math.floor((maxY - bbox.north) * yScale)
  let bottom = Math.ceil((maxY - bbox.south) * yScale)
  left = Math.max(0, Math.min(w, left))
  right = Math.max(0, Math.min(w, right))
  top = Math.max(0, Math.min(h, top))
  bottom = Math.max(0, Math.min(h, bottom))
  if (right <= left) right = Math.min(w, left + 1)
  if (bottom <= top) bottom = Math.min(h, top + 1)
  return [left, top, right, bottom]
}

function encodePngRgba(width, height, rgba) {
  const { PNG } = require("pngjs")
  const png = new PNG({ width, height })
  Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength).copy(png.data)
  return PNG.sync.write(png)
}

function stretchGray(values, nodata) {
  let min = Infinity
  let max = -Infinity
  for (const v of values) {
    if (v == null || Number.isNaN(v)) continue
    if (nodata != null && v === nodata) continue
    if (v < min) min = v
    if (v > max) max = v
  }
  if (!(min < max)) {
    min = 0
    max = 1
  }
  const rgba = new Uint8Array(values.length * 4)
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    const o = i * 4
    if (v == null || Number.isNaN(v) || (nodata != null && v === nodata)) {
      rgba[o + 3] = 0
      continue
    }
    const t = Math.max(0, Math.min(1, (v - min) / (max - min)))
    const g = Math.round(t * 255)
    rgba[o] = g
    rgba[o + 1] = g
    rgba[o + 2] = g
    rgba[o + 3] = 255
  }
  return { rgba, min, max }
}

function rgbToRgba(r, g, b, len) {
  const rgba = new Uint8Array(len * 4)
  for (let i = 0; i < len; i++) {
    const o = i * 4
    rgba[o] = Math.max(0, Math.min(255, Math.round(r[i] ?? 0)))
    rgba[o + 1] = Math.max(0, Math.min(255, Math.round(g[i] ?? 0)))
    rgba[o + 2] = Math.max(0, Math.min(255, Math.round(b[i] ?? 0)))
    rgba[o + 3] = 255
  }
  return rgba
}

function stats1d(values, nodata) {
  let min = Infinity
  let max = -Infinity
  let sum = 0
  let n = 0
  for (const v of values) {
    if (v == null || Number.isNaN(v)) continue
    if (nodata != null && v === nodata) continue
    if (v < min) min = v
    if (v > max) max = v
    sum += v
    n++
  }
  if (n === 0) return { min: null, max: null, mean: null, n: 0 }
  return { min, max, mean: sum / n, n }
}

/**
 * @param {object} opts
 * @param {string} opts.filePath
 * @param {boolean} opts.isDev
 * @param {string} opts.dirname electron __dirname
 */
export async function probeRaster(opts) {
  const { fromFile } = await import("geotiff")
  const tiff = await fromFile(opts.filePath)
  const image = await tiff.getImage()
  const bbox = imageBBox(image)
  const width = image.getWidth()
  const height = image.getHeight()
  const bands = image.getSamplesPerPixel()
  const nodata = image.getGDALNoData?.() ?? null
  const res = image.getResolution?.() ?? null
  const pixelDeg =
    res && Array.isArray(res)
      ? Math.max(Math.abs(res[0] ?? 0), Math.abs(res[1] ?? 0))
      : Math.max(
          (bbox.east - bbox.west) / width,
          (bbox.north - bbox.south) / height
        )
  const pixelSizeM = pixelDeg * METERS_PER_DEG
  const suggestedLevel = levelForFeatureMeters(pixelSizeM * 4)
  const modality = bands <= 1 ? "dem" : "ortho"

  const { cover } = loadGridCore(opts.isDev, opts.dirname)
  let estimatedCells = null
  let coverError = null
  try {
    estimatedCells = cover.coverBBox(bbox, suggestedLevel).length
  } catch (err) {
    coverError = err instanceof Error ? err.message : String(err)
  }

  return {
    filePath: opts.filePath,
    name: path.basename(opts.filePath),
    bbox,
    width,
    height,
    bands,
    nodata,
    pixelSizeM,
    suggestedLevel,
    estimatedCells,
    coverError,
    modality,
    reason: `${modality === "dem" ? "高程" : "影像"} · 像元 ≈ ${formatMeters(pixelSizeM)} → 建议 L${suggestedLevel}（格边 ≈ ${formatMeters(cellSizeMeters(suggestedLevel))}）${
      estimatedCells != null ? ` · 约 ${estimatedCells} 格` : ""
    }`,
  }
}

/**
 * @param {object} opts
 * @param {string} opts.filePath
 * @param {number} opts.level
 * @param {string} opts.source
 * @param {string} [opts.label]
 * @param {string} opts.userDataDir
 * @param {boolean} opts.isDev
 * @param {string} opts.dirname
 * @param {(p: number) => void} [opts.onProgress]
 */
export async function ingestRasterFile(opts) {
  const level = clampLevel(opts.level)
  const { fromFile } = await import("geotiff")
  const { cover, geosot } = loadGridCore(opts.isDev, opts.dirname)

  const tiff = await fromFile(opts.filePath)
  const image = await tiff.getImage()
  const bbox = imageBBox(image)
  const bands = image.getSamplesPerPixel()
  const nodataRaw = image.getGDALNoData?.()
  const nodata =
    nodataRaw == null || nodataRaw === ""
      ? null
      : typeof nodataRaw === "number"
        ? nodataRaw
        : Number(nodataRaw)
  const modality = bands <= 1 ? "dem" : "ortho"
  const fileUrl = pathToFileURL(opts.filePath).href

  let codes
  try {
    codes = cover.coverBBox(bbox, level)
  } catch (err) {
    throw new Error(
      err instanceof Error ? err.message : String(err) + "；请改用更粗层级"
    )
  }
  if (codes.length > MAX_CELLS) {
    throw new Error(
      `预估 ${codes.length} 格超过上限 ${MAX_CELLS}，请改用更粗层级（当前 L${level}）`
    )
  }
  if (codes.length === 0) {
    throw new Error("栅格范围未覆盖任何网格")
  }

  const chipDir = path.join(opts.userDataDir, "chips", opts.source)
  await fs.mkdir(chipDir, { recursive: true })
  // wipe previous chips for this source
  for (const name of await fs.readdir(chipDir)) {
    if (name.endsWith(".png")) await fs.unlink(path.join(chipDir, name))
  }

  const records = []
  const total = codes.length
  for (let i = 0; i < codes.length; i++) {
    const gridId = codes[i]
    const cellBBox = geosot.bboxFromCode(gridId)
    const window = bboxToWindow(image, cellBBox)
    let rasters
    try {
      rasters = await image.readRasters({
        window,
        width: CHIP_SIZE,
        height: CHIP_SIZE,
        resampleMethod: "bilinear",
        fillValue: nodata ?? 0,
      })
    } catch {
      // tiny / empty window fallback
      rasters = await image.readRasters({
        window,
        fillValue: nodata ?? 0,
      })
    }

    const w = rasters.width ?? CHIP_SIZE
    const h = rasters.height ?? CHIP_SIZE
    const band0 = rasters[0]
    if (!band0 || band0.length === 0) continue

    let rgba
    let attrs = {
      modality,
      bands,
    }
    if (modality === "dem") {
      const st = stats1d(band0, Number.isFinite(nodata) ? nodata : null)
      const stretched = stretchGray(
        band0,
        Number.isFinite(nodata) ? nodata : null
      )
      rgba = stretched.rgba
      if (st.min != null) {
        attrs = {
          ...attrs,
          zMin: Math.round(st.min * 100) / 100,
          zMax: Math.round(st.max * 100) / 100,
          zMean: Math.round(st.mean * 100) / 100,
        }
      }
      if (nodata != null && Number.isFinite(Number(nodata))) {
        attrs.nodata = Number(nodata)
      }
    } else {
      const r = rasters[0]
      const g = rasters[Math.min(1, bands - 1)]
      const b = rasters[Math.min(2, bands - 1)]
      rgba = rgbToRgba(r, g, b, r.length)
      attrs = { ...attrs, bands }
    }

    // If read without resample, rgba length may not match CHIP_SIZE² — rebuild via canvas-less nearest by encoding actual w/h
    const pngW = Math.round(Math.sqrt(rgba.length / 4))
    const pngH = pngW
    // Prefer declared w/h when matching
    const outW = w * h * 4 === rgba.length ? w : pngW
    const outH = w * h * 4 === rgba.length ? h : pngH

    const chipRel = path.posix.join("chips", opts.source, safeChipName(gridId))
    const chipAbs = path.join(opts.userDataDir, chipRel)
    await fs.writeFile(chipAbs, encodePngRgba(outW, outH, rgba))

    records.push({
      gridId,
      level,
      source: opts.source,
      featureId: opts.source,
      label: opts.label ?? opts.source,
      attrs,
      ref: {
        objectId: opts.source,
        uri: fileUrl,
        kind: "raster",
      },
      fragment: {
        kind: "raster",
        bbox: cellBBox,
        chipUri: chipRel.replace(/\\/g, "/"),
        width: outW,
        height: outH,
      },
    })

    if (opts.onProgress && (i % 20 === 0 || i === total - 1)) {
      opts.onProgress(Math.round(((i + 1) / total) * 100))
    }
  }

  return {
    records,
    count: records.length,
    modality,
    level,
    source: opts.source,
  }
}

export function resolveChipPath(userDataDir, chipUri) {
  if (!chipUri || chipUri.includes("..")) {
    throw new Error("invalid chipUri")
  }
  return path.join(userDataDir, chipUri)
}

export { MAX_CELLS, CHIP_SIZE }

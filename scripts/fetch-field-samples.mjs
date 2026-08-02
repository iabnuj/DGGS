/**
 * 从 Open-Meteo Archive 拉取和静测区气象场，写成「连续填满」的常规 CSV。
 *
 * 策略：先对 bbox 做 GeoSOT cover，再取每格中心点采样。
 * 导入时用同一层级入格 → 一格一点、色斑连续无空洞。
 *
 * 输出：testdata/fields/{temperature,pressure,wind_speed}.csv
 * 列：lon,lat,value,unit,time,name
 *
 * 来源：https://open-meteo.com/ （CC BY 4.0，ERA5 再分析）
 */
import { writeFileSync, mkdirSync, copyFileSync, existsSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { createRequire } from "module"

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, "..", "testdata", "fields")
const BBOX = { west: 86.0, south: 42.0, east: 87.0, north: 43.0 }
/** 与 Demo 建议入格层级一致 */
const LEVEL = 12
const DATE = "2024-07-15"
const HOUR_INDEX = 6 // 06:00 UTC

function loadGridCore() {
  const corePath = join(__dirname, "..", "packages", "grid-core", "dist", "index.js")
  return require(corePath)
}

function cellCenters(cover, geosot) {
  const codes = cover.coverBBox(BBOX, LEVEL)
  return codes.map((code) => {
    const b = geosot.bboxFromCode(code)
    return {
      code,
      lon: Math.round(((b.west + b.east) / 2) * 1e6) / 1e6,
      lat: Math.round(((b.south + b.north) / 2) * 1e6) / 1e6,
    }
  })
}

async function fetchChunk(points) {
  const lats = points.map((p) => p.lat).join(",")
  const lons = points.map((p) => p.lon).join(",")
  const url =
    `https://archive-api.open-meteo.com/v1/archive` +
    `?latitude=${lats}&longitude=${lons}` +
    `&start_date=${DATE}&end_date=${DATE}` +
    `&hourly=temperature_2m,surface_pressure,wind_speed_10m` +
    `&timezone=UTC`
  const resp = await fetch(url)
  if (!resp.ok) {
    throw new Error(`Open-Meteo ${resp.status}: ${await resp.text()}`)
  }
  const data = await resp.json()
  return Array.isArray(data) ? data : [data]
}

function pickHourly(block, key) {
  const arr = block?.hourly?.[key]
  if (!arr || arr[HOUR_INDEX] == null) return null
  return arr[HOUR_INDEX]
}

/** 对缺测点用最近邻填充，保证 cover 内每格都有值 */
function fillMissing(points, values) {
  const known = []
  for (let i = 0; i < points.length; i++) {
    if (values[i] != null && Number.isFinite(values[i])) {
      known.push({ i, lon: points[i].lon, lat: points[i].lat, v: values[i] })
    }
  }
  if (known.length === 0) return values
  return values.map((v, i) => {
    if (v != null && Number.isFinite(v)) return v
    const p = points[i]
    let best = known[0]
    let bestD = Infinity
    for (const k of known) {
      const d = (k.lon - p.lon) ** 2 + (k.lat - p.lat) ** 2
      if (d < bestD) {
        bestD = d
        best = k
      }
    }
    return best.v
  })
}

function toCsv(rows) {
  const header = "lon,lat,value,unit,time,name"
  const lines = rows.map(
    (r) =>
      `${r.lon},${r.lat},${r.value},${r.unit},${r.time},${JSON.stringify(r.name)}`
  )
  return [header, ...lines].join("\n") + "\n"
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  const { cover, geosot } = loadGridCore()
  const points = cellCenters(cover, geosot)
  console.log(
    `GeoSOT L${LEVEL} cover ${points.length} 格 · 中心采样 · ${DATE} 06:00 UTC`
  )

  const chunks = []
  const SIZE = 40
  for (let i = 0; i < points.length; i += SIZE) {
    chunks.push(points.slice(i, i + SIZE))
  }

  const tempRaw = new Array(points.length).fill(null)
  const pressureRaw = new Array(points.length).fill(null)
  const windRaw = new Array(points.length).fill(null)
  const time = `${DATE}T06:00:00Z`

  let offset = 0
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    process.stdout.write(`  拉取 ${i + 1}/${chunks.length}…\n`)
    const blocks = await fetchChunk(chunk)
    for (let j = 0; j < chunk.length; j++) {
      const b = blocks[j]
      const idx = offset + j
      if (!b) continue
      tempRaw[idx] = pickHourly(b, "temperature_2m")
      pressureRaw[idx] = pickHourly(b, "surface_pressure")
      windRaw[idx] = pickHourly(b, "wind_speed_10m")
    }
    offset += chunk.length
    await new Promise((r) => setTimeout(r, 400))
  }

  const tempVals = fillMissing(points, tempRaw)
  const pressureVals = fillMissing(points, pressureRaw)
  const windVals = fillMissing(points, windRaw)

  const temp = points.map((p, i) => ({
    lon: p.lon,
    lat: p.lat,
    value: tempVals[i],
    unit: "C",
    time,
    name: "temperature_2m",
  }))
  const pressure = points.map((p, i) => ({
    lon: p.lon,
    lat: p.lat,
    value: pressureVals[i],
    unit: "hPa",
    time,
    name: "surface_pressure",
  }))
  const wind = points.map((p, i) => ({
    lon: p.lon,
    lat: p.lat,
    value: windVals[i],
    unit: "km/h",
    time,
    name: "wind_speed_10m",
  }))

  writeFileSync(join(OUT, "temperature.csv"), toCsv(temp))
  writeFileSync(join(OUT, "pressure.csv"), toCsv(pressure))
  writeFileSync(join(OUT, "wind_speed.csv"), toCsv(wind))
  console.log(
    `已写 temperature=${temp.length} pressure=${pressure.length} wind_speed=${wind.length}（应等于 cover 格数）`
  )

  const demSrc = join(
    __dirname,
    "..",
    "testdata",
    "hejing",
    "raster",
    "dem_glo30.tif"
  )
  const demDst = join(OUT, "elevation_dem_glo30.tif")
  if (existsSync(demSrc) && !existsSync(demDst)) {
    try {
      copyFileSync(demSrc, demDst)
      console.log("已复制 dem_glo30.tif → fields/elevation_dem_glo30.tif")
    } catch (err) {
      console.warn("DEM 复制跳过:", err.message)
    }
  }

  writeFileSync(
    join(OUT, "README.md"),
    `# 标量场样本（常规格式 · 连续填满）

区域：和静测区约 42–43°N, 86–87°E

采样方式：对 bbox 做 **GeoSOT L${LEVEL} cover**，取每格中心向 Open-Meteo 取值。  
导入时请选 **L${LEVEL}**，可得到与 cover 一致、无空洞的色斑。

| 文件 | 格式 | 含义 | 来源 |
|------|------|------|------|
| temperature.csv | CSV \`lon,lat,value\` | 2m 气温 (°C) | [Open-Meteo Archive](https://open-meteo.com/) / ERA5，${DATE} 06:00 UTC |
| pressure.csv | CSV | 地表气压 (hPa) | 同上 |
| wind_speed.csv | CSV | 10m 风速 (km/h) | 同上 |
| elevation_dem_glo30.tif | GeoTIFF | 高程 | Copernicus DEM GLO-30（见 \`../hejing/raster/dem_glo30.tif\`） |

重新生成：

\`\`\`bash
node scripts/fetch-field-samples.mjs
\`\`\`
`
  )
  console.log("README 已更新")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

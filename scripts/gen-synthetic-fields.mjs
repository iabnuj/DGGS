/**
 * 生成电磁 / 雷达 / 磁场等合成标量场 CSV（连续填满）
 *
 * 与 fetch-field-samples.mjs 相同区域与层级：
 * 和静测区 bbox → GeoSOT L12 cover → 格心一点
 *
 * 输出：testdata/fields/{em_intensity,radar_coverage,magnetic_field}.csv
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { createRequire } from "module"

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, "..", "testdata", "fields")
const BBOX = { west: 86.0, south: 42.0, east: 87.0, north: 43.0 }
const LEVEL = 12
const SEED = 42

const FIELDS = [
  {
    file: "em_intensity.csv",
    name: "em_intensity",
    label: "电磁场强度",
    unit: "dBm",
    min: -90,
    max: -30,
    /** 偏向西南强、东北弱 + 噪声 */
    pattern: (nx, ny, n) => 0.55 * (1 - nx) + 0.25 * (1 - ny) + 0.2 * n,
  },
  {
    file: "radar_coverage.csv",
    name: "radar_coverage",
    label: "雷达波覆盖",
    unit: "dB",
    min: -85,
    max: 5,
    /** 中心站强、向外衰减 */
    pattern: (nx, ny, n) => {
      const d = Math.hypot(nx - 0.45, ny - 0.55)
      return Math.max(0, 1 - d * 1.35) * 0.85 + 0.15 * n
    },
  },
  {
    file: "magnetic_field.csv",
    name: "magnetic_field",
    label: "磁场强度",
    unit: "nT",
    min: 47500,
    max: 56500,
    /** 纬度缓变 + 弱噪声（地磁总强度量级） */
    pattern: (nx, ny, n) => 0.35 + 0.45 * ny + 0.1 * nx + 0.1 * n,
  },
]

function loadGridCore() {
  return require(join(__dirname, "..", "packages", "grid-core", "dist", "index.js"))
}

function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function smoothNoise(x, y, seed = SEED) {
  const h = (n) => {
    let t = Math.sin(n * 12.9898 + seed * 78.233) * 43758.5453
    return t - Math.floor(t)
  }
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = x - x0
  const fy = y - y0
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const n00 = h(x0 * 101.3 + y0 * 57.1)
  const n10 = h((x0 + 1) * 101.3 + y0 * 57.1)
  const n01 = h(x0 * 101.3 + (y0 + 1) * 57.1)
  const n11 = h((x0 + 1) * 101.3 + (y0 + 1) * 57.1)
  const a = n00 * (1 - sx) + n10 * sx
  const b = n01 * (1 - sx) + n11 * sx
  return a * (1 - sy) + b * sy
}

function toCsv(rows) {
  const header = "lon,lat,value,unit,time,name"
  const lines = rows.map(
    (r) =>
      `${r.lon},${r.lat},${r.value},${r.unit},${r.time},${JSON.stringify(r.name)}`
  )
  return [header, ...lines].join("\n") + "\n"
}

function main() {
  mkdirSync(OUT, { recursive: true })
  const { cover, geosot } = loadGridCore()
  const codes = cover.coverBBox(BBOX, LEVEL)
  const rand = mulberry32(SEED)
  const time = "2024-07-15T06:00:00Z"

  const cells = codes.map((code) => {
    const b = geosot.bboxFromCode(code)
    const lon = Math.round(((b.west + b.east) / 2) * 1e6) / 1e6
    const lat = Math.round(((b.south + b.north) / 2) * 1e6) / 1e6
    const nx = (lon - BBOX.west) / (BBOX.east - BBOX.west)
    const ny = (lat - BBOX.south) / (BBOX.north - BBOX.south)
    const n =
      0.55 * smoothNoise(nx * 4, ny * 4, SEED) +
      0.3 * smoothNoise(nx * 9, ny * 9, SEED + 7) +
      0.15 * rand()
    return { lon, lat, nx, ny, n }
  })

  for (const field of FIELDS) {
    const rows = cells.map((c) => {
      let t = field.pattern(c.nx, c.ny, c.n)
      t = Math.max(0, Math.min(1, t))
      const value =
        Math.round((field.min + t * (field.max - field.min)) * 100) / 100
      return {
        lon: c.lon,
        lat: c.lat,
        value,
        unit: field.unit,
        time,
        name: field.name,
      }
    })
    writeFileSync(join(OUT, field.file), toCsv(rows))
    console.log(
      `${field.label} → ${field.file} · ${rows.length} 点 · [${field.min}, ${field.max}] ${field.unit}`
    )
  }

  // 追加 README 段落（若已有气象说明则替换合成场段落）
  const readmePath = join(OUT, "README.md")
  let readme = existsSync(readmePath) ? readFileSync(readmePath, "utf8") : ""
  const synthBlock = `
## 合成环境场（连续填满）

与上表同一 bbox / L${LEVEL} cover。空间分布为平滑合成场，量级贴近常见业务区间。

| 文件 | 含义 | 值域 | 单位 |
|------|------|------|------|
| em_intensity.csv | 电磁场强度 | -90 ~ -30 | dBm |
| radar_coverage.csv | 雷达波覆盖 | -85 ~ 5 | dB |
| magnetic_field.csv | 磁场强度 | 47500 ~ 56500 | nT |

\`\`\`bash
node scripts/gen-synthetic-fields.mjs
\`\`\`
`
  if (readme.includes("## 合成环境场")) {
    readme = readme.replace(/## 合成环境场[\s\S]*?(?=\n## |\n*$)/, synthBlock.trim() + "\n")
  } else {
    readme = readme.trimEnd() + "\n" + synthBlock
  }
  writeFileSync(readmePath, readme)
  console.log("README 已更新")
}

main()

/**
 * 生成「空中突击通道」一键演示包
 *
 * 区域：和静测区 86–87°E / 42–43°N · GeoSOT L12 连续 cover
 * 输出：apps/demo/public/demo/assault/
 *
 *   elevation.csv / wind_speed.csv / em_intensity.csv / radar_coverage.csv
 *   units.geojson / manifest.json
 *
 * 运行：node scripts/gen-assault-demo.mjs
 */
import { writeFileSync, mkdirSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { createRequire } from "module"

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, "..", "apps", "demo", "public", "demo", "assault")
const BBOX = { west: 86.0, south: 42.0, east: 87.0, north: 43.0 }
const LEVEL = 12
const SEED = 20260804
const TIME = "2024-07-15T06:00:00Z"

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

/** 场定义：作战叙事用别名写进 label（manifest 再覆盖图层名） */
const FIELDS = [
  {
    file: "elevation.csv",
    name: "elevation",
    unit: "m",
    min: 900,
    max: 4200,
    /** 中脊山脉高，两侧低 → 撞山约束会逼通道绕行 */
    pattern: (nx, ny, n) => {
      const ridge = Math.exp(-((nx - 0.5) ** 2) / 0.04) * 0.85
      return Math.min(1, ridge + 0.15 * n + 0.1 * ny)
    },
  },
  {
    file: "wind_speed.csv",
    name: "wind_speed",
    unit: "km/h",
    min: 5,
    max: 55,
    /** 中部偏东强对流带（避开西南起点与东北目标） */
    pattern: (nx, ny, n) => {
      const band = Math.exp(-((nx - 0.55) ** 2 + (ny - 0.45) ** 2) / 0.05)
      return Math.min(1, 0.15 + band * 0.8 + 0.1 * n)
    },
  },
  {
    file: "em_intensity.csv",
    name: "em_intensity",
    unit: "dBm",
    min: -90,
    max: -25,
    pattern: (nx, ny, n) => 0.45 * (1 - nx) + 0.2 * ny + 0.2 * n,
  },
  {
    file: "radar_coverage.csv",
    name: "radar_coverage",
    unit: "dB",
    min: -85,
    max: 8,
    /** 斜向雷达墙切断西南→东北直线，关雷达后通路会更直 */
    pattern: (nx, ny, n) => {
      const wall = Math.exp(-((nx + ny - 0.95) ** 2) / 0.012)
      const lobe = Math.exp(-((nx - 0.4) ** 2 + (ny - 0.55) ** 2) / 0.04)
      return Math.min(1, wall * 0.95 + lobe * 0.35 + 0.05 * n)
    },
  },
]

const UNITS = [
  {
    id: "blue_start",
    lon: 86.12,
    lat: 42.12,
    label: "蓝方出发阵地",
    role: "blue_start",
    taskLevel: 9,
    side: "blue",
  },
  {
    id: "blue_goal",
    lon: 86.88,
    lat: 42.88,
    label: "突击目标",
    role: "blue_goal",
    taskLevel: 9,
    side: "blue",
  },
  {
    id: "blue_company",
    lon: 86.28,
    lat: 42.32,
    label: "蓝方突击分队",
    role: "blue_unit",
    taskLevel: 11,
    side: "blue",
  },
  {
    id: "blue_flight",
    lon: 86.35,
    lat: 42.4,
    label: "蓝方编队节点",
    role: "blue_unit",
    taskLevel: 13,
    side: "blue",
  },
  {
    id: "red_radar",
    lon: 86.48,
    lat: 42.52,
    label: "敌雷达站",
    role: "red_radar",
    taskLevel: 9,
    side: "red",
  },
  {
    id: "red_sam",
    lon: 86.58,
    lat: 42.6,
    label: "敌防空阵地",
    role: "red_threat",
    taskLevel: 11,
    side: "red",
  },
  {
    id: "red_patrol",
    lon: 86.65,
    lat: 42.45,
    label: "敌巡逻点",
    role: "red_threat",
    taskLevel: 13,
    side: "red",
  },
]

function main() {
  mkdirSync(OUT, { recursive: true })
  const { cover, geosot } = loadGridCore()
  const codes = cover.coverBBox(BBOX, LEVEL)
  const rand = mulberry32(SEED)

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
    return { code, lon, lat, nx, ny, n }
  })

  const startCode = geosot.locToQuaternary(UNITS[0].lon, UNITS[0].lat, LEVEL)
  const goalCode = geosot.locToQuaternary(UNITS[1].lon, UNITS[1].lat, LEVEL)
  const endpointCodes = new Set([startCode, goalCode])

  /** 起终点强制安全，避免被阈值直接封死 */
  const SAFE = {
    elevation: 1200,
    wind_speed: 18,
    em_intensity: -70,
    radar_coverage: -70,
  }

  for (const field of FIELDS) {
    const rows = cells.map((c) => {
      let t = field.pattern(c.nx, c.ny, c.n)
      t = Math.max(0, Math.min(1, t))
      let value =
        Math.round((field.min + t * (field.max - field.min)) * 100) / 100
      if (endpointCodes.has(c.code) && SAFE[field.name] != null) {
        value = SAFE[field.name]
      }
      return {
        lon: c.lon,
        lat: c.lat,
        value,
        unit: field.unit,
        time: TIME,
        name: field.name,
      }
    })
    writeFileSync(join(OUT, field.file), toCsv(rows))
    console.log(`${field.name} → ${rows.length} 点`)
  }

  const features = UNITS.map((u) => {
    const code = geosot.locToQuaternary(u.lon, u.lat, LEVEL)
    return {
      type: "Feature",
      properties: {
        id: u.id,
        name: u.label,
        label: u.label,
        role: u.role,
        taskLevel: u.taskLevel,
        side: u.side,
        gridCode: code,
      },
      geometry: {
        type: "Point",
        coordinates: [u.lon, u.lat],
      },
    }
  })

  writeFileSync(
    join(OUT, "units.geojson"),
    JSON.stringify(
      {
        type: "FeatureCollection",
        name: "assault_units",
        features,
      },
      null,
      2
    ) + "\n"
  )

  const manifest = {
    id: "assault-corridor-hejing",
    title: "合静演训 · 空中突击通道",
    description:
      "预置地形/气象/电磁/雷达威胁场与部队态势点，可一键计算多约束突击通道。",
    level: LEVEL,
    bbox: BBOX,
    startCode,
    goalCode,
    startLabel: UNITS[0].label,
    goalLabel: UNITS[1].label,
    unitsSource: "assault_units",
    defaultTaskLevel: 13,
    constraints: {
      maxElevation: 3000,
      maxWind: 40,
      maxEm: -40,
      maxRadar: -20,
    },
    toggles: {
      elevation: true,
      wind: true,
      em: true,
      radar: true,
    },
    fields: [
      {
        file: "elevation.csv",
        source: "elevation",
        displayName: "地形（撞山约束）",
        rampId: "elevation",
      },
      {
        file: "wind_speed.csv",
        source: "wind_speed",
        displayName: "气象（强对流禁区）",
        rampId: "wind_speed",
      },
      {
        file: "em_intensity.csv",
        source: "em_intensity",
        displayName: "电磁威胁",
        rampId: "em_intensity",
      },
      {
        file: "radar_coverage.csv",
        source: "radar_coverage",
        displayName: "敌雷达探测",
        rampId: "radar_coverage",
      },
    ],
    unitsDisplayName: "部队与目标态势",
    cameraHeight: 180_000,
  }

  writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n")
  writeFileSync(
    join(OUT, "README.md"),
    `# 空中突击通道演示包

由 \`node scripts/gen-assault-demo.mjs\` 生成，勿手改数值场（可改 units / 文案后重跑）。

- 层级：L${LEVEL} · ${codes.length} 格
- 起点：\`${startCode}\`
- 终点：\`${goalCode}\`

Demo 内「空中突击通道 → 加载演训态势」会读取本目录。
`
  )

  console.log(`units → ${features.length} 点`)
  console.log(`start ${startCode}`)
  console.log(`goal  ${goalCode}`)
  console.log(`→ ${OUT}`)
}

main()

import "./styles.css"
import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  HeightReference,
  HorizontalOrigin,
  LabelStyle,
  Math as CesiumMath,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  UrlTemplateImageryProvider,
  VerticalOrigin,
  Viewer,
  WebMercatorTilingScheme,
} from "cesium"
import { geosot, algebra } from "@dggs/grid-core"
import { GridLayer } from "./gridLayer"
import { levelFromHeight } from "./levelFromHeight"
import {
  buildSampleRecords,
  recordsForCell,
  type GridRecord,
} from "./sampleData"

const viewer = new Viewer("cesiumContainer", {
  animation: false,
  timeline: false,
  baseLayerPicker: false,
  geocoder: false,
  homeButton: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  fullscreenButton: false,
  infoBox: false,
  selectionIndicator: false,
  baseLayer: false,
})

viewer.imageryLayers.addImageryProvider(
  new UrlTemplateImageryProvider({
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    tilingScheme: new WebMercatorTilingScheme(),
    maximumLevel: 19,
  })
)

viewer.scene.globe.baseColor = Color.fromCssColorString("#dfe7ef")
viewer.scene.fog.enabled = false

viewer.camera.setView({
  destination: Cartesian3.fromDegrees(116.4, 39.9, 180_000),
})

const gridLayer = new GridLayer(viewer)
const SAMPLE_LEVEL = 12
const sampleRecords: GridRecord[] = buildSampleRecords(SAMPLE_LEVEL)
let selectedCode: string | null = null
let refreshTimer: number | undefined

const levelInput = document.getElementById("levelInput") as HTMLInputElement
const heightCountInput = document.getElementById("heightCount") as HTMLInputElement
const autoLevel = document.getElementById("autoLevel") as HTMLInputElement
const showOutline = document.getElementById("showOutline") as HTMLInputElement
const showFaces = document.getElementById("showFaces") as HTMLInputElement
const showCode = document.getElementById("showCode") as HTMLInputElement
const refreshBtn = document.getElementById("refreshBtn") as HTMLButtonElement
const parentBtn = document.getElementById("parentBtn") as HTMLButtonElement
const childBtn = document.getElementById("childBtn") as HTMLButtonElement
const statusEl = document.getElementById("status") as HTMLParagraphElement
const cellInfo = document.getElementById("cellInfo") as HTMLDListElement
const sourceList = document.getElementById("sourceList") as HTMLUListElement

function syncDrawOptions() {
  gridLayer.setOptions({
    showOutline: showOutline.checked,
    showFaces: showFaces.checked,
    showCode: showCode.checked,
    heightCount: Number(heightCountInput.value) || 1,
  })
}

function setStatus(text: string) {
  statusEl.textContent = text
}

function currentLevel(): number {
  if (autoLevel.checked) {
    const carto = Cartographic.fromCartesian(viewer.camera.positionWC)
    const lv = levelFromHeight(carto.height)
    levelInput.value = String(lv)
    return lv
  }
  return Number(levelInput.value)
}

function renderSources(records: GridRecord[]) {
  if (records.length === 0) {
    sourceList.innerHTML = "<li>该格暂无样例多源数据（或先点选北京附近格子）</li>"
    return
  }
  sourceList.innerHTML = records
    .map((r) => {
      const attrs = Object.entries(r.attrs)
        .map(([k, v]) => `${k}: ${v}`)
        .join(" · ")
      return `<li data-source="${r.source}"><strong>${r.label}</strong>${r.source} · L${r.level}<br/>${attrs}</li>`
    })
    .join("")
}

function updateCellPanel(code: string | null) {
  selectedCode = code
  const rows = cellInfo.querySelectorAll("dd")
  if (!code) {
    rows[0].textContent = "—"
    rows[1].textContent = "—"
    rows[2].textContent = "—"
    parentBtn.disabled = true
    childBtn.disabled = true
    renderSources([])
    return
  }
  const level = geosot.getLevel(code)
  const b = geosot.bboxFromCode(code)
  rows[0].textContent = code
  rows[1].textContent = String(level)
  rows[2].textContent = `${b.west.toFixed(5)}, ${b.south.toFixed(5)} → ${b.east.toFixed(5)}, ${b.north.toFixed(5)}`
  parentBtn.disabled = level <= 0
  childBtn.disabled = level >= 32
  renderSources(recordsForCell(sampleRecords, code))
}

function placeSampleMarkers() {
  for (const r of sampleRecords) {
    if (r.source === "alert") continue
    const b = geosot.bboxFromCode(r.gridId)
    const lng = (b.west + b.east) / 2
    const lat = (b.south + b.north) / 2
    const color =
      r.source === "recon"
        ? Color.fromCssColorString("#1d4ed8")
        : Color.fromCssColorString("#b45309")
    viewer.entities.add({
      position: Cartesian3.fromDegrees(lng, lat),
      point: {
        pixelSize: 10,
        color,
        outlineColor: Color.WHITE,
        outlineWidth: 1,
        heightReference: HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: r.label,
        font: "12px sans-serif",
        fillColor: Color.WHITE,
        outlineColor: Color.BLACK,
        outlineWidth: 3,
        style: LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: VerticalOrigin.BOTTOM,
        horizontalOrigin: HorizontalOrigin.CENTER,
        pixelOffset: new Cartesian2(0, -14),
        heightReference: HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    })
  }
}

function refreshGrid() {
  syncDrawOptions()
  const level = currentLevel()
  const hi = new Set<string>()
  for (const r of sampleRecords) {
    if (r.source !== "alert") continue
    if (r.level === level) {
      hi.add(r.gridId)
    } else if (r.level > level) {
      try {
        hi.add(algebra.aggregate([r.gridId], level)[0])
      } catch {
        /* skip */
      }
    }
  }
  gridLayer.setHighlights(hi)

  try {
    const { count, truncated } = gridLayer.refresh(level)
    const opts = gridLayer.getOptions()
    const layers = opts.heightCount > 1 ? ` · ${opts.heightCount} 层` : ""
    setStatus(
      truncated
        ? `视窗过大，已自动降级，当前约 L${levelInput.value} · ${count} 格${layers}`
        : `L${level} · ${count} 格${layers}`
    )
  } catch (err) {
    setStatus(`刷新失败: ${err instanceof Error ? err.message : String(err)}`)
  }
}

function scheduleRefresh() {
  window.clearTimeout(refreshTimer)
  refreshTimer = window.setTimeout(() => refreshGrid(), 200)
}

refreshBtn.addEventListener("click", () => refreshGrid())
levelInput.addEventListener("change", () => {
  autoLevel.checked = false
  refreshGrid()
})
heightCountInput.addEventListener("change", () => refreshGrid())
autoLevel.addEventListener("change", () => refreshGrid())
for (const el of [showOutline, showFaces, showCode]) {
  el.addEventListener("change", () => refreshGrid())
}

parentBtn.addEventListener("click", () => {
  if (!selectedCode) return
  const p = algebra.parent(selectedCode)
  if (!p) return
  const b = geosot.bboxFromCode(p)
  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(
      (b.west + b.east) / 2,
      (b.south + b.north) / 2,
      Math.max(viewer.camera.positionCartographic.height * 1.6, 50_000)
    ),
    duration: 0.8,
  })
  updateCellPanel(p)
  autoLevel.checked = false
  levelInput.value = String(geosot.getLevel(p))
  window.setTimeout(() => refreshGrid(), 900)
})

childBtn.addEventListener("click", () => {
  if (!selectedCode) return
  const kids = algebra.children(selectedCode)
  const b = geosot.bboxFromCode(selectedCode)
  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(
      (b.west + b.east) / 2,
      (b.south + b.north) / 2,
      Math.max(viewer.camera.positionCartographic.height * 0.45, 8_000)
    ),
    duration: 0.8,
  })
  updateCellPanel(kids[0])
  autoLevel.checked = false
  levelInput.value = String(geosot.getLevel(kids[0]))
  window.setTimeout(() => refreshGrid(), 900)
})

const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
handler.setInputAction((movement: { position: Cartesian2 }) => {
  const picked = viewer.scene.pick(movement.position)
  let code: string | null = null
  if (picked) {
    const raw = picked.id
    if (typeof raw === "string") code = raw
    else if (raw && typeof raw === "object" && "id" in raw && typeof (raw as { id: unknown }).id === "string") {
      code = (raw as { id: string }).id
    }
  }
  const cell = code ? gridLayer.pickFromId(code) : null
  if (cell) {
    updateCellPanel(cell.code)
    setStatus(`选中 ${cell.code}`)
    return
  }
  const cartesian = viewer.camera.pickEllipsoid(
    movement.position,
    viewer.scene.globe.ellipsoid
  )
  if (!cartesian) return
  const carto = Cartographic.fromCartesian(cartesian)
  const lng = CesiumMath.toDegrees(carto.longitude)
  const lat = CesiumMath.toDegrees(carto.latitude)
  updateCellPanel(geosot.locToQuaternary(lng, lat, currentLevel()))
  setStatus(`点选 ${lng.toFixed(5)}, ${lat.toFixed(5)}`)
}, ScreenSpaceEventType.LEFT_CLICK)

viewer.camera.moveEnd.addEventListener(() => scheduleRefresh())

placeSampleMarkers()
updateCellPanel(null)
refreshGrid()

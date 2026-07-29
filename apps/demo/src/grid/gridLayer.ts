import {
  Cartesian2,
  Cartesian3,
  ClassificationType,
  Color,
  ColorGeometryInstanceAttribute,
  GeometryInstance,
  GroundPrimitive,
  GroundPolylineGeometry,
  GroundPolylinePrimitive,
  HeightReference,
  HorizontalOrigin,
  LabelCollection,
  LabelStyle,
  Math as CesiumMath,
  Material,
  PerInstanceColorAppearance,
  PolylineColorAppearance,
  PolylineGeometry,
  PolylineMaterialAppearance,
  Primitive,
  Rectangle,
  RectangleGeometry,
  RectangleOutlineGeometry,
  VerticalOrigin,
  ArcType,
  type Viewer,
} from "cesium"
import { geosot, cover } from "@dggs/grid-core"

type BBox = { west: number; south: number; east: number; north: number }

export type CellPick = {
  code: string
  west: number
  south: number
  east: number
  north: number
}

type CellMeta = CellPick

/** Cesium Rectangle rejects |lat| > 90°; GeoSOT coarse cells can exceed that. */
const MAX_LAT = 90 - 1e-6
const MAX_LON = 180 - 1e-6

/** Approx meters per degree latitude (same heuristic as test.html). */
const METERS_PER_DEG_LAT = 110_574

export type GridDrawOptions = {
  showOutline: boolean
  showFaces: boolean
  showCode: boolean
  /** Vertical stack count (≥1). Layer thickness ≈ cell lat span × 110574 m. */
  heightCount: number
  /** Drape outlines/fills on terrain (ignores extrusion while on). */
  clampToGround: boolean
  /** CSS hex, e.g. #ffffff */
  outlineColor: string
  /** CSS hex for fill faces */
  fillColor: string
  /** CSS hex for selection / buffer highlight */
  highlightColor: string
  /** 0–100 overall alpha multiplier */
  opacity: number
  /** 编号文字颜色 */
  codeColor: string
  /** 编号描边颜色 */
  codeOutlineColor: string
  /** 编号字号 px */
  codeFontSize: number
  /** 编号是否带底衬 */
  codeBackground: boolean
  /** 编号底衬透明度 0–100 */
  codeBgOpacity: number
  /** 编号缩写：只显示末尾几段，避免遮挡 */
  codeShort: boolean
}

const DEFAULT_OPTIONS: GridDrawOptions = {
  showOutline: true,
  showFaces: false,
  showCode: false,
  heightCount: 1,
  clampToGround: false,
  outlineColor: "#ffffff",
  fillColor: "#22c55e",
  highlightColor: "#ef4444",
  opacity: 100,
  codeColor: "#ffffff",
  codeOutlineColor: "#000000",
  codeFontSize: 13,
  codeBackground: true,
  codeBgOpacity: 45,
  codeShort: true,
}

function colorWithOpacity(css: string, baseAlpha: number, opacityPct: number) {
  const o = Math.max(0, Math.min(100, opacityPct)) / 100
  return Color.fromCssColorString(css).withAlpha(baseAlpha * o)
}

/** GeoSOT 码过长时截取末尾，便于图上阅读。 */
function formatCodeLabel(code: string, short: boolean): string {
  if (!short || code.length <= 14) return code
  const parts = code.split("-")
  if (parts.length <= 3) return `…${code.slice(-12)}`
  return `…${parts.slice(-3).join("-")}`
}

function clampLat(v: number) {
  return Math.max(-MAX_LAT, Math.min(MAX_LAT, v))
}

function clampLon(v: number) {
  return Math.max(-MAX_LON, Math.min(MAX_LON, v))
}

/**
 * Normalize a Cesium view rectangle into one or two GeoSOT-coverable bboxes.
 * Handles antimeridian (west > east) which previously collapsed to 0 cells.
 */
export function viewRectToBBoxes(rect: Rectangle): BBox[] {
  let west = CesiumMath.toDegrees(rect.west)
  let south = CesiumMath.toDegrees(rect.south)
  let east = CesiumMath.toDegrees(rect.east)
  let north = CesiumMath.toDegrees(rect.north)

  south = clampLat(south)
  north = clampLat(north)
  if (!(south < north)) return []

  if (west > east) {
    const left = { west: clampLon(west), south, east: MAX_LON, north }
    const right = { west: -MAX_LON, south, east: clampLon(east), north }
    return [left, right].filter((b) => b.west < b.east)
  }

  west = clampLon(west)
  east = clampLon(east)
  if (!(west < east)) return []
  return [{ west, south, east, north }]
}

/** Fallback when computeViewRectangle() is undefined (tilted / horizon views). */
function fallbackBBoxes(viewer: Viewer): BBox[] {
  const carto = viewer.camera.positionCartographic
  const lng = CesiumMath.toDegrees(carto.longitude)
  const lat = CesiumMath.toDegrees(carto.latitude)
  const span = Math.max(2, Math.min(80, (carto.height / 6378137) * (180 / Math.PI) * 1.4))
  const west = clampLon(lng - span)
  const east = clampLon(lng + span)
  const south = clampLat(lat - span)
  const north = clampLat(lat + span)
  if (west < east && south < north) {
    return [{ west, south, east, north }]
  }
  const w = lng - span
  const e = lng + span
  if (w < -180 || e > 180) {
    const parts: BBox[] = []
    if (w < -180) {
      parts.push({ west: clampLon(w + 360), south, east: MAX_LON, north })
      parts.push({ west: -MAX_LON, south, east: clampLon(e), north })
    } else {
      parts.push({ west: clampLon(w), south, east: MAX_LON, north })
      parts.push({ west: -MAX_LON, south, east: clampLon(e - 360), north })
    }
    return parts.filter((b) => b.west < b.east && b.south < b.north)
  }
  return []
}

type AnyPrimitive = Primitive | GroundPrimitive | GroundPolylinePrimitive

/**
 * Viewport grid mesh with toggles for outline / face / code / vertical layers
 * (display style aligned with apps/demo/test.html).
 */
function sameCodeSet(a: Set<string>, b: Set<string>) {
  if (a.size !== b.size) return false
  for (const x of a) if (!b.has(x)) return false
  return true
}

export class GridLayer {
  private outlinePrimitive: AnyPrimitive | undefined
  private fillPrimitive: AnyPrimitive | undefined
  private pillarPrimitive: Primitive | undefined
  private labelCollection: LabelCollection | undefined
  /** Selection/buffer overlay — updated independently so the base mesh never flashes. */
  private hiOutlinePrimitive: AnyPrimitive | undefined
  private hiFillPrimitive: AnyPrimitive | undefined
  /** Visible warehouse data layers (roads/buildings/…) — independent of pick highlights. */
  private dataOutlinePrimitive: AnyPrimitive | undefined
  private dataFillPrimitive: AnyPrimitive | undefined
  private cells: CellMeta[] = []
  private highlightCodes = new Set<string>()
  private dataCodes = new Set<string>()
  private options: GridDrawOptions = { ...DEFAULT_OPTIONS }
  /** Skip full mesh rebuild when camera / style signature unchanged. */
  private lastViewKey = ""

  constructor(private viewer: Viewer) {}

  get size() {
    return this.cells.length
  }

  getOptions(): GridDrawOptions {
    return { ...this.options }
  }

  setOptions(partial: Partial<GridDrawOptions>) {
    const prev = this.options
    this.options = {
      ...this.options,
      ...partial,
      heightCount: Math.max(
        1,
        Math.min(10, Math.floor(partial.heightCount ?? this.options.heightCount))
      ),
      opacity: Math.max(
        0,
        Math.min(100, Math.round(partial.opacity ?? this.options.opacity))
      ),
      codeFontSize: Math.max(
        8,
        Math.min(28, Math.round(partial.codeFontSize ?? this.options.codeFontSize))
      ),
      codeBgOpacity: Math.max(
        0,
        Math.min(100, Math.round(partial.codeBgOpacity ?? this.options.codeBgOpacity))
      ),
    }
    if (this.styleSignature(prev) !== this.styleSignature(this.options)) {
      this.lastViewKey = ""
    } else if (prev.highlightColor !== this.options.highlightColor) {
      this.redrawHighlightOverlay()
    }
  }

  private styleSignature(o: GridDrawOptions) {
    return [
      o.showOutline,
      o.showFaces,
      o.showCode,
      o.heightCount,
      o.clampToGround,
      o.outlineColor,
      o.fillColor,
      o.opacity,
      o.codeColor,
      o.codeOutlineColor,
      o.codeFontSize,
      o.codeBackground,
      o.codeBgOpacity,
      o.codeShort,
    ].join("|")
  }

  private viewSignature(level: number): string {
    const cellDeg = 180 / 2 ** Math.max(1, level)
    const q = Math.max(cellDeg * 0.4, 0.002)
    const quantDeg = (deg: number) => (Math.round(deg / q) * q).toFixed(5)
    const quantRad = (rad: number) => quantDeg(CesiumMath.toDegrees(rad))
    const style = this.styleSignature(this.options)
    const rect = this.viewer.camera.computeViewRectangle()
    if (!rect) {
      const c = this.viewer.camera.positionCartographic
      const h = Math.round(c.height / Math.max(80, c.height * 0.02)) *
        Math.max(80, c.height * 0.02)
      return `fb|${level}|${quantRad(c.longitude)}|${quantRad(c.latitude)}|${Math.round(h)}|${style}`
    }
    return [
      level,
      quantRad(rect.west),
      quantRad(rect.south),
      quantRad(rect.east),
      quantRad(rect.north),
      style,
    ].join("|")
  }

  private addCodeLabel(
    labels: LabelCollection,
    opts: {
      lng: number
      lat: number
      height?: number
      text: string
      clampToGround?: boolean
    }
  ) {
    const {
      codeColor,
      codeOutlineColor,
      codeFontSize,
      codeBackground,
      codeBgOpacity,
      codeShort,
      opacity,
    } = this.options
    const o = Math.max(0, Math.min(100, opacity)) / 100
    // Keep a small lift so labels don't z-fight the globe; do NOT set
    // disableDepthTestDistance to Infinity — that draws far-side codes through Earth.
    const lift = opts.clampToGround ? 2 : Math.max(30, (opts.height ?? 0) + 80)
    labels.add({
      position: Cartesian3.fromDegrees(opts.lng, opts.lat, lift),
      text: formatCodeLabel(opts.text, codeShort),
      font: `${codeFontSize}px "IBM Plex Sans", "Source Han Sans SC", sans-serif`,
      fillColor: Color.fromCssColorString(codeColor).withAlpha(Math.max(0.15, o)),
      outlineColor: Color.fromCssColorString(codeOutlineColor).withAlpha(
        Math.max(0.15, o)
      ),
      outlineWidth: 3,
      style: LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: VerticalOrigin.CENTER,
      horizontalOrigin: HorizontalOrigin.CENTER,
      heightReference: opts.clampToGround
        ? HeightReference.CLAMP_TO_GROUND
        : HeightReference.NONE,
      disableDepthTestDistance: 0,
      showBackground: codeBackground,
      backgroundColor: Color.BLACK.withAlpha((codeBgOpacity / 100) * o),
      backgroundPadding: new Cartesian2(4, 3),
    })
  }

  clear() {
    this.clearHighlightOverlay()
    this.clearDataOverlay()
    if (this.outlinePrimitive) {
      this.viewer.scene.primitives.remove(this.outlinePrimitive)
      this.outlinePrimitive = undefined
    }
    if (this.fillPrimitive) {
      this.viewer.scene.primitives.remove(this.fillPrimitive)
      this.fillPrimitive = undefined
    }
    if (this.pillarPrimitive) {
      this.viewer.scene.primitives.remove(this.pillarPrimitive)
      this.pillarPrimitive = undefined
    }
    if (this.labelCollection) {
      this.viewer.scene.primitives.remove(this.labelCollection)
      this.labelCollection = undefined
    }
    this.cells = []
  }

  private clearHighlightOverlay() {
    if (this.hiOutlinePrimitive) {
      this.viewer.scene.primitives.remove(this.hiOutlinePrimitive)
      this.hiOutlinePrimitive = undefined
    }
    if (this.hiFillPrimitive) {
      this.viewer.scene.primitives.remove(this.hiFillPrimitive)
      this.hiFillPrimitive = undefined
    }
  }

  private clearDataOverlay() {
    if (this.dataOutlinePrimitive) {
      this.viewer.scene.primitives.remove(this.dataOutlinePrimitive)
      this.dataOutlinePrimitive = undefined
    }
    if (this.dataFillPrimitive) {
      this.viewer.scene.primitives.remove(this.dataFillPrimitive)
      this.dataFillPrimitive = undefined
    }
  }

  setHighlights(codes: Iterable<string>) {
    this.highlightCodes = new Set(codes)
  }

  /** Update selection / analysis overlay only. */
  applyHighlights(codes: Iterable<string>) {
    const next = new Set(codes)
    if (sameCodeSet(this.highlightCodes, next)) return
    this.highlightCodes = next
    this.redrawHighlightOverlay()
  }

  /** Imported data layers (eye toggle). Independent of pick/analysis highlights. */
  applyDataOverlay(codes: Iterable<string>, force = false) {
    const next = new Set(codes)
    if (!force && sameCodeSet(this.dataCodes, next)) return
    this.dataCodes = next
    this.redrawDataOverlay()
  }

  private redrawHighlightOverlay() {
    this.clearHighlightOverlay()
    const painted = this.paintCellOverlay(this.highlightCodes, {
      idPrefix: "hi",
      lineCss: this.options.highlightColor,
      lineAlpha: 0.98,
      fillAlpha: 0.35,
      width: 3,
    })
    this.hiOutlinePrimitive = painted.outline
    this.hiFillPrimitive = painted.fill
  }

  private redrawDataOverlay() {
    this.clearDataOverlay()
    const painted = this.paintCellOverlay(this.dataCodes, {
      idPrefix: "data",
      lineCss: "#38bdf8",
      lineAlpha: 0.95,
      fillAlpha: 0.32,
      width: 2.5,
    })
    this.dataOutlinePrimitive = painted.outline
    this.dataFillPrimitive = painted.fill
  }

  private paintCellOverlay(
    codes: Set<string>,
    style: {
      idPrefix: string
      lineCss: string
      lineAlpha: number
      fillAlpha: number
      width: number
    }
  ): { outline?: AnyPrimitive; fill?: AnyPrimitive } {
    if (this.viewer.isDestroyed() || codes.size === 0) return {}

    const lineColor = colorWithOpacity(
      style.lineCss,
      style.lineAlpha,
      this.options.opacity
    )
    const fillColor = colorWithOpacity(
      style.lineCss,
      style.fillAlpha,
      this.options.opacity
    )
    const clamp = this.options.clampToGround
    const heightCount = this.options.heightCount
    const outlineInstances: GeometryInstance[] = []
    const fillInstances: GeometryInstance[] = []
    const prefix = style.idPrefix

    for (const code of codes) {
      const b = geosot.bboxFromCode(code)
      const west = clampLon(b.west)
      const east = clampLon(b.east)
      const south = clampLat(b.south)
      const north = clampLat(b.north)
      if (!(west < east && south < north)) continue
      const rectangle = Rectangle.fromDegrees(west, south, east, north)

      if (clamp) {
        outlineInstances.push(
          new GeometryInstance({
            id: `${prefix}:${code}`,
            geometry: new GroundPolylineGeometry({
              positions: Cartesian3.fromDegreesArray([
                west,
                south,
                east,
                south,
                east,
                north,
                west,
                north,
                west,
                south,
              ]),
              width: style.width,
            }),
            attributes: {
              color: ColorGeometryInstanceAttribute.fromColor(lineColor),
            },
          })
        )
        fillInstances.push(
          new GeometryInstance({
            id: `${prefix}:${code}#fill`,
            geometry: new RectangleGeometry({
              rectangle,
              vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
            }),
            attributes: {
              color: ColorGeometryInstanceAttribute.fromColor(fillColor),
            },
          })
        )
      } else {
        const layerH = Math.max(50, (north - south) * METERS_PER_DEG_LAT)
        for (let k = 0; k < heightCount; k++) {
          const h0 = k * layerH
          outlineInstances.push(
            new GeometryInstance({
              id: `${prefix}:${code}#o${k}`,
              geometry: new RectangleOutlineGeometry({
                rectangle,
                height: h0,
              }),
              attributes: {
                color: ColorGeometryInstanceAttribute.fromColor(lineColor),
              },
            })
          )
          fillInstances.push(
            new GeometryInstance({
              id: `${prefix}:${code}#fill${k}`,
              geometry: new RectangleGeometry({
                rectangle,
                height: h0,
                extrudedHeight: h0 + Math.max(40, layerH * 0.2),
                vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
              }),
              attributes: {
                color: ColorGeometryInstanceAttribute.fromColor(fillColor),
              },
            })
          )
        }
      }
    }

    const async = codes.size > 64
    let outline: AnyPrimitive | undefined
    let fill: AnyPrimitive | undefined

    if (outlineInstances.length > 0) {
      if (clamp) {
        outline = this.viewer.scene.primitives.add(
          new GroundPolylinePrimitive({
            geometryInstances: outlineInstances,
            appearance: new PolylineColorAppearance(),
            asynchronous: async,
          })
        )
      } else {
        const lineWidth = Math.min(
          style.width,
          this.viewer.scene.maximumAliasedLineWidth
        )
        outline = this.viewer.scene.primitives.add(
          new Primitive({
            geometryInstances: outlineInstances,
            appearance: new PerInstanceColorAppearance({
              flat: true,
              renderState: { lineWidth },
            }),
            asynchronous: async,
            allowPicking: false,
          })
        )
      }
    }

    if (fillInstances.length > 0) {
      if (clamp) {
        fill = this.viewer.scene.primitives.add(
          new GroundPrimitive({
            geometryInstances: fillInstances,
            appearance: new PerInstanceColorAppearance({
              translucent: true,
              flat: true,
            }),
            classificationType: ClassificationType.TERRAIN,
            asynchronous: async,
          })
        )
      } else {
        fill = this.viewer.scene.primitives.add(
          new Primitive({
            geometryInstances: fillInstances,
            appearance: new PerInstanceColorAppearance({
              translucent: true,
              flat: true,
            }),
            asynchronous: async,
            allowPicking: false,
          })
        )
      }
    }

    return { outline, fill }
  }

  private collectCodes(bboxes: BBox[], level: number): {
    codes: string[]
    truncated: boolean
    level: number
  } {
    const set = new Set<string>()
    let truncated = false
    let usedLevel = level

    const coverAll = (lv: number) => {
      set.clear()
      for (const b of bboxes) {
        for (const code of cover.coverBBox(b, lv)) set.add(code)
      }
    }

    try {
      coverAll(level)
    } catch {
      truncated = true
      let lv = level
      while (lv >= 4) {
        try {
          coverAll(lv)
          usedLevel = lv
          break
        } catch {
          lv -= 1
        }
      }
    }

    return { codes: [...set], truncated, level: usedLevel }
  }

  refresh(
    level: number,
    opts?: { force?: boolean; highlights?: Iterable<string> }
  ): { count: number; truncated: boolean; skipped: boolean } {
    if (this.viewer.isDestroyed()) {
      return { count: 0, truncated: false, skipped: true }
    }

    const nextHighlights =
      opts?.highlights !== undefined
        ? new Set(opts.highlights)
        : this.highlightCodes

    const key = this.viewSignature(level)
    if (!opts?.force && key === this.lastViewKey && this.cells.length > 0) {
      // Same viewport: only refresh selection colors.
      this.applyHighlights(nextHighlights)
      return { count: this.cells.length, truncated: false, skipped: true }
    }

    this.highlightCodes = nextHighlights

    const rect = this.viewer.camera.computeViewRectangle()
    let bboxes = rect ? viewRectToBBoxes(rect) : []
    if (bboxes.length === 0) {
      bboxes = fallbackBBoxes(this.viewer)
    }
    if (bboxes.length === 0) {
      this.clear()
      this.lastViewKey = ""
      return { count: 0, truncated: false, skipped: false }
    }

    const { codes, truncated } = this.collectCodes(bboxes, level)
    this.draw(codes)
    this.lastViewKey = key
    return { count: this.cells.length, truncated, skipped: false }
  }

  draw(codes: string[]) {
    this.clear()
    if (this.viewer.isDestroyed()) return

    const { showOutline, showFaces, showCode, heightCount, clampToGround } =
      this.options

    // Empty / style-off mesh still must restore pick + data overlays —
    // clear() removed their primitives but codes remain in memory.
    if (codes.length === 0 || (!showOutline && !showFaces && !showCode)) {
      this.redrawHighlightOverlay()
      this.redrawDataOverlay()
      return
    }

    // Ground draping is 2.5D; keep extrusion on ellipsoid path only.
    if (clampToGround) {
      this.drawClamped(codes, showOutline, showFaces, showCode)
    } else {
      this.drawEllipsoid(codes, showOutline, showFaces, showCode, heightCount)
    }
    this.redrawHighlightOverlay()
    this.redrawDataOverlay()
  }

  private drawClamped(
    codes: string[],
    showOutline: boolean,
    showFaces: boolean,
    showCode: boolean
  ) {
    const outlineInstances: GeometryInstance[] = []
    const fillInstances: GeometryInstance[] = []
    this.cells = []

    const outlineColor = colorWithOpacity(this.options.outlineColor, 0.85, this.options.opacity)
    const faceColor = colorWithOpacity(this.options.fillColor, 0.28, this.options.opacity)

    let labels: LabelCollection | undefined
    if (showCode) {
      labels = this.viewer.scene.primitives.add(new LabelCollection())
      this.labelCollection = labels
    }

    for (const code of codes) {
      const b = geosot.bboxFromCode(code)
      const west = clampLon(b.west)
      const east = clampLon(b.east)
      const south = clampLat(b.south)
      const north = clampLat(b.north)
      if (!(west < east && south < north)) continue

      const rectangle = Rectangle.fromDegrees(west, south, east, north)
      const cx = (west + east) / 2
      const cy = (south + north) / 2

      if (showOutline) {
        outlineInstances.push(
          new GeometryInstance({
            id: code,
            geometry: new GroundPolylineGeometry({
              positions: Cartesian3.fromDegreesArray([
                west,
                south,
                east,
                south,
                east,
                north,
                west,
                north,
                west,
                south,
              ]),
              width: 1.5,
            }),
            attributes: {
              color: ColorGeometryInstanceAttribute.fromColor(outlineColor),
            },
          })
        )
      }

      if (showFaces) {
        fillInstances.push(
          new GeometryInstance({
            id: `${code}#fill0`,
            geometry: new RectangleGeometry({
              rectangle,
              vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
            }),
            attributes: {
              color: ColorGeometryInstanceAttribute.fromColor(faceColor),
            },
          })
        )
      }

      if (showCode && labels) {
        this.addCodeLabel(labels, {
          lng: cx,
          lat: cy,
          text: code,
          clampToGround: true,
        })
      }

      this.cells.push({ code, west, south, east, north })
    }

    if (outlineInstances.length > 0) {
      this.outlinePrimitive = this.viewer.scene.primitives.add(
        new GroundPolylinePrimitive({
          geometryInstances: outlineInstances,
          appearance: new PolylineColorAppearance(),
          asynchronous: true,
        })
      )
    }

    if (fillInstances.length > 0) {
      this.fillPrimitive = this.viewer.scene.primitives.add(
        new GroundPrimitive({
          geometryInstances: fillInstances,
          appearance: new PerInstanceColorAppearance({
            translucent: true,
            flat: true,
          }),
          classificationType: ClassificationType.TERRAIN,
          asynchronous: true,
        })
      )
    }
  }

  private drawEllipsoid(
    codes: string[],
    showOutline: boolean,
    showFaces: boolean,
    showCode: boolean,
    heightCount: number
  ) {
    const outlineInstances: GeometryInstance[] = []
    const fillInstances: GeometryInstance[] = []
    const pillarInstances: GeometryInstance[] = []
    this.cells = []

    const outlineColor = colorWithOpacity(this.options.outlineColor, 0.75, this.options.opacity)
    const faceColor = colorWithOpacity(this.options.fillColor, 0.25, this.options.opacity)

    let labels: LabelCollection | undefined
    if (showCode) {
      labels = this.viewer.scene.primitives.add(new LabelCollection())
      this.labelCollection = labels
    }

    for (const code of codes) {
      const b = geosot.bboxFromCode(code)
      const west = clampLon(b.west)
      const east = clampLon(b.east)
      const south = clampLat(b.south)
      const north = clampLat(b.north)
      if (!(west < east && south < north)) continue

      const rectangle = Rectangle.fromDegrees(west, south, east, north)
      const layerH = Math.max(50, (north - south) * METERS_PER_DEG_LAT)
      const totalH = layerH * heightCount
      const cx = (west + east) / 2
      const cy = (south + north) / 2

      for (let k = 0; k < heightCount; k++) {
        const h0 = k * layerH
        const h1 = h0 + layerH

        if (showOutline) {
          outlineInstances.push(
            new GeometryInstance({
              id: k === 0 ? code : `${code}#o${k}`,
              geometry: new RectangleOutlineGeometry({
                rectangle,
                height: h0,
              }),
              attributes: {
                color: ColorGeometryInstanceAttribute.fromColor(outlineColor),
              },
            })
          )
          if (k === heightCount - 1 && heightCount > 1) {
            outlineInstances.push(
              new GeometryInstance({
                id: `${code}#otop`,
                geometry: new RectangleOutlineGeometry({
                  rectangle,
                  height: h1,
                }),
                attributes: {
                  color: ColorGeometryInstanceAttribute.fromColor(outlineColor),
                },
              })
            )
          }
        }

        if (showFaces) {
          fillInstances.push(
            new GeometryInstance({
              id: `${code}#fill${k}`,
              geometry: new RectangleGeometry({
                rectangle,
                height: h0,
                extrudedHeight: h1,
                vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
              }),
              attributes: {
                color: ColorGeometryInstanceAttribute.fromColor(faceColor),
              },
            })
          )
        }

        if (showCode && labels) {
          this.addCodeLabel(labels, {
            lng: cx,
            lat: cy,
            height: h0 + layerH / 2,
            text: heightCount > 1 ? `${code}\nL${k + 1}` : code,
            clampToGround: false,
          })
        }
      }

      if (showOutline && heightCount > 1) {
        const corners: [number, number][] = [
          [west, south],
          [east, south],
          [east, north],
          [west, north],
        ]
        for (const [lon, lat] of corners) {
          pillarInstances.push(
            new GeometryInstance({
              geometry: new PolylineGeometry({
                positions: Cartesian3.fromDegreesArrayHeights([
                  lon,
                  lat,
                  0,
                  lon,
                  lat,
                  totalH,
                ]),
                width: 1.0,
                arcType: ArcType.NONE,
              }),
            })
          )
        }
      }

      this.cells.push({ code, west, south, east, north })
    }

    const lineWidth = Math.min(1.5, this.viewer.scene.maximumAliasedLineWidth)

    if (outlineInstances.length > 0) {
      this.outlinePrimitive = this.viewer.scene.primitives.add(
        new Primitive({
          geometryInstances: outlineInstances,
          appearance: new PerInstanceColorAppearance({
            flat: true,
            renderState: { lineWidth },
          }),
          asynchronous: true,
          allowPicking: true,
        })
      )
    }

    if (pillarInstances.length > 0) {
      this.pillarPrimitive = this.viewer.scene.primitives.add(
        new Primitive({
          geometryInstances: pillarInstances,
          appearance: new PolylineMaterialAppearance({
            material: Material.fromType("Color", {
              color: Color.WHITE.withAlpha(0.3),
            }),
            translucent: true,
          }),
          asynchronous: true,
          allowPicking: false,
        })
      )
    }

    if (fillInstances.length > 0) {
      this.fillPrimitive = this.viewer.scene.primitives.add(
        new Primitive({
          geometryInstances: fillInstances,
          appearance: new PerInstanceColorAppearance({
            translucent: true,
            flat: true,
          }),
          asynchronous: true,
          allowPicking: false,
        })
      )
    }
  }

  pickFromId(id: unknown): CellPick | null {
    if (typeof id !== "string") return null
    const code = id.replace(/#(fill\d*|o\d*|otop)$/, "")
    const hit = this.cells.find((c) => c.code === code)
    if (!hit) return null
    return {
      code: hit.code,
      west: hit.west,
      south: hit.south,
      east: hit.east,
      north: hit.north,
    }
  }
}

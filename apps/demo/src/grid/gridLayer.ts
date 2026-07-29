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
}

function colorWithOpacity(css: string, baseAlpha: number, opacityPct: number) {
  const o = Math.max(0, Math.min(100, opacityPct)) / 100
  return Color.fromCssColorString(css).withAlpha(baseAlpha * o)
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
export class GridLayer {
  private outlinePrimitive: AnyPrimitive | undefined
  private fillPrimitive: AnyPrimitive | undefined
  private pillarPrimitive: Primitive | undefined
  private labelCollection: LabelCollection | undefined
  private cells: CellMeta[] = []
  private highlightCodes = new Set<string>()
  private options: GridDrawOptions = { ...DEFAULT_OPTIONS }

  constructor(private viewer: Viewer) {}

  get size() {
    return this.cells.length
  }

  getOptions(): GridDrawOptions {
    return { ...this.options }
  }

  setOptions(partial: Partial<GridDrawOptions>) {
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
    }
  }

  clear() {
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

  setHighlights(codes: Iterable<string>) {
    this.highlightCodes = new Set(codes)
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

  refresh(level: number): { count: number; truncated: boolean } {
    if (this.viewer.isDestroyed()) return { count: 0, truncated: false }
    const rect = this.viewer.camera.computeViewRectangle()
    let bboxes = rect ? viewRectToBBoxes(rect) : []
    if (bboxes.length === 0) {
      bboxes = fallbackBBoxes(this.viewer)
    }
    if (bboxes.length === 0) {
      this.clear()
      return { count: 0, truncated: false }
    }

    const { codes, truncated } = this.collectCodes(bboxes, level)
    this.draw(codes)
    return { count: this.cells.length, truncated }
  }

  draw(codes: string[]) {
    this.clear()
    if (codes.length === 0) return
    if (this.viewer.isDestroyed()) return

    const { showOutline, showFaces, showCode, heightCount, clampToGround } =
      this.options
    if (!showOutline && !showFaces && !showCode) return

    // Ground draping is 2.5D; keep extrusion on ellipsoid path only.
    if (clampToGround) {
      this.drawClamped(codes, showOutline, showFaces, showCode)
      return
    }

    this.drawEllipsoid(codes, showOutline, showFaces, showCode, heightCount)
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
    const hiLine = colorWithOpacity(this.options.highlightColor, 0.95, this.options.opacity)
    const hiFill = colorWithOpacity(this.options.highlightColor, 0.32, this.options.opacity)

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

      const hi = this.highlightCodes.has(code)
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
              width: hi ? 2.5 : 1.5,
            }),
            attributes: {
              color: ColorGeometryInstanceAttribute.fromColor(hi ? hiLine : outlineColor),
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
              color: ColorGeometryInstanceAttribute.fromColor(hi ? hiFill : faceColor),
            },
          })
        )
      }

      if (showCode && labels) {
        labels.add({
          position: Cartesian3.fromDegrees(cx, cy),
          text: code,
          font: "13px IBM Plex Sans, sans-serif",
          fillColor: Color.WHITE,
          outlineColor: Color.BLACK,
          outlineWidth: 3,
          style: LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: VerticalOrigin.CENTER,
          horizontalOrigin: HorizontalOrigin.CENTER,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          showBackground: true,
          backgroundColor: Color.BLACK.withAlpha(0.45),
          backgroundPadding: new Cartesian2(4, 3),
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
    const hiLine = colorWithOpacity(this.options.highlightColor, 0.95, this.options.opacity)
    const hiFill = colorWithOpacity(this.options.highlightColor, 0.3, this.options.opacity)

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

      const hi = this.highlightCodes.has(code)
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
                color: ColorGeometryInstanceAttribute.fromColor(hi ? hiLine : outlineColor),
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
                  color: ColorGeometryInstanceAttribute.fromColor(hi ? hiLine : outlineColor),
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
                color: ColorGeometryInstanceAttribute.fromColor(hi ? hiFill : faceColor),
              },
            })
          )
        }

        if (showCode && labels) {
          labels.add({
            position: Cartesian3.fromDegrees(cx, cy, h0 + layerH / 2),
            text: heightCount > 1 ? `${code}\nL${k + 1}` : code,
            font: "13px IBM Plex Sans, sans-serif",
            fillColor: Color.WHITE,
            outlineColor: Color.BLACK,
            outlineWidth: 3,
            style: LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: VerticalOrigin.CENTER,
            horizontalOrigin: HorizontalOrigin.CENTER,
            pixelOffset: new Cartesian2(0, 0),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            showBackground: true,
            backgroundColor: Color.BLACK.withAlpha(0.45),
            backgroundPadding: new Cartesian2(4, 3),
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

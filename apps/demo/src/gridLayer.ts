import {
  Color,
  ColorGeometryInstanceAttribute,
  GeometryInstance,
  Math as CesiumMath,
  PerInstanceColorAppearance,
  Primitive,
  Rectangle,
  RectangleGeometry,
  RectangleOutlineGeometry,
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

  // Antimeridian: Cesium may return west > east (e.g. 170 → -170).
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
  // Rough ground span from altitude (radians ≈ height / R for small angles).
  const span = Math.max(2, Math.min(80, (carto.height / 6378137) * (180 / Math.PI) * 1.4))
  const west = clampLon(lng - span)
  const east = clampLon(lng + span)
  const south = clampLat(lat - span)
  const north = clampLat(lat + span)
  if (west < east && south < north) {
    return [{ west, south, east, north }]
  }
  // Near ±180 with wide span: split via synthetic wrapping rectangle degrees
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

/**
 * Viewport grid as a lat/lon-style mesh: outlines for every cell,
 * light fill only on highlighted (e.g. alert) cells.
 */
export class GridLayer {
  private outlinePrimitive: Primitive | undefined
  private fillPrimitive: Primitive | undefined
  private cells: CellMeta[] = []
  private highlightCodes = new Set<string>()

  constructor(private viewer: Viewer) {}

  get size() {
    return this.cells.length
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

    const outlineInstances: GeometryInstance[] = []
    const fillInstances: GeometryInstance[] = []
    this.cells = []

    const lineColor = Color.fromCssColorString("#1a5c45").withAlpha(0.85)
    const hiLine = Color.fromCssColorString("#b91c1c").withAlpha(0.95)
    const hiFill = Color.fromCssColorString("#b91c1c").withAlpha(0.2)

    for (const code of codes) {
      const b = geosot.bboxFromCode(code)
      const west = clampLon(b.west)
      const east = clampLon(b.east)
      const south = clampLat(b.south)
      const north = clampLat(b.north)
      if (!(west < east && south < north)) continue

      const hi = this.highlightCodes.has(code)
      const rectangle = Rectangle.fromDegrees(west, south, east, north)

      outlineInstances.push(
        new GeometryInstance({
          id: code,
          geometry: new RectangleOutlineGeometry({
            rectangle,
            height: 80,
          }),
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(hi ? hiLine : lineColor),
          },
        })
      )

      if (hi) {
        fillInstances.push(
          new GeometryInstance({
            id: `${code}#fill`,
            geometry: new RectangleGeometry({
              rectangle,
              height: 60,
              vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
            }),
            attributes: {
              color: ColorGeometryInstanceAttribute.fromColor(hiFill),
            },
          })
        )
      }

      this.cells.push({ code, west, south, east, north })
    }

    if (outlineInstances.length === 0) return

    const lineWidth = Math.min(1.5, this.viewer.scene.maximumAliasedLineWidth)

    this.outlinePrimitive = this.viewer.scene.primitives.add(
      new Primitive({
        geometryInstances: outlineInstances,
        appearance: new PerInstanceColorAppearance({
          flat: true,
          renderState: {
            lineWidth,
          },
        }),
        asynchronous: true,
        allowPicking: true,
      })
    )

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
    const code = id.endsWith("#fill") ? id.slice(0, -5) : id
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

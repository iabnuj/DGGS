import {
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  GeometryInstance,
  Math as CesiumMath,
  PerInstanceColorAppearance,
  Primitive,
  Rectangle,
  RectangleGeometry,
  type Viewer,
} from "cesium"
import { geosot } from "@dggs/grid-core"

export type WhiteModelCell = {
  code: string
  /** 挤出高度（米）；会与格宽联动放大，避免俯视像平面填色 */
  heightM: number
}

const METERS_PER_DEG = 111_320

/**
 * 格网挤出白模：按 GeoSOT 编码画半透明立方体（体对象①）。
 */
export class WhiteModelLayer {
  private primitive: Primitive | undefined
  private topPrimitive: Primitive | undefined
  private cells: WhiteModelCell[] = []
  private visible = true

  constructor(private viewer: Viewer) {}

  setVisible(v: boolean) {
    this.visible = v
    if (this.primitive) this.primitive.show = v
    if (this.topPrimitive) this.topPrimitive.show = v
    if (!this.viewer.isDestroyed()) this.viewer.scene.requestRender()
  }

  /** @deprecated 使用 drawCells；保留兼容等高校 */
  draw(codes: string[], heightM = 24) {
    this.drawCells(codes.map((code) => ({ code, heightM })))
  }

  drawCells(cells: WhiteModelCell[]) {
    this.clear()
    this.cells = cells.slice(0, 4_000)
    if (this.cells.length === 0 || this.viewer.isDestroyed()) return

    const fillInstances: GeometryInstance[] = []
    const topInstances: GeometryInstance[] = []

    for (const { code, heightM } of this.cells) {
      try {
        const b = geosot.bboxFromCode(code)
        const midLat = ((b.south + b.north) / 2) * (Math.PI / 180)
        const cellW =
          Math.abs(b.east - b.west) *
          METERS_PER_DEG *
          Math.max(0.2, Math.cos(midLat))
        const cellH = Math.abs(b.north - b.south) * METERS_PER_DEG
        const cellEdge = Math.max(20, Math.min(cellW, cellH))
        // 至少约 0.6 倍格宽，属性高度再放大，俯视也能看出柱体
        const h = Math.max(cellEdge * 0.6, heightM * Math.max(1, cellEdge / 40))

        const rectangle = Rectangle.fromDegrees(b.west, b.south, b.east, b.north)
        fillInstances.push(
          new GeometryInstance({
            id: `wm:${code}`,
            geometry: new RectangleGeometry({
              rectangle,
              height: 0,
              extrudedHeight: h,
              vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
            }),
            attributes: {
              color: ColorGeometryInstanceAttribute.fromColor(
                Color.fromCssColorString("#dce6f0").withAlpha(0.72)
              ),
            },
          })
        )
        topInstances.push(
          new GeometryInstance({
            id: `wm-top:${code}`,
            geometry: new RectangleGeometry({
              rectangle,
              height: h,
              extrudedHeight: h + Math.max(6, cellEdge * 0.03),
              vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
            }),
            attributes: {
              color: ColorGeometryInstanceAttribute.fromColor(
                Color.fromCssColorString("#f5f8fc").withAlpha(0.95)
              ),
            },
          })
        )
      } catch {
        /* skip */
      }
    }
    if (fillInstances.length === 0) return

    this.primitive = this.viewer.scene.primitives.add(
      new Primitive({
        geometryInstances: fillInstances,
        appearance: new PerInstanceColorAppearance({
          flat: false,
          translucent: true,
          closed: true,
          faceForward: true,
        }),
        asynchronous: true,
        releaseGeometryInstances: true,
      })
    )
    this.primitive.show = this.visible

    this.topPrimitive = this.viewer.scene.primitives.add(
      new Primitive({
        geometryInstances: topInstances,
        appearance: new PerInstanceColorAppearance({
          flat: false,
          translucent: true,
          closed: true,
          faceForward: true,
        }),
        asynchronous: true,
        releaseGeometryInstances: true,
      })
    )
    this.topPrimitive.show = this.visible

    this.viewer.scene.requestRender()
    window.setTimeout(() => this.tiltForVolume(), 250)
  }

  tiltForVolume() {
    if (this.viewer.isDestroyed()) return
    const cam = this.viewer.camera
    if (cam.pitch > CesiumMath.toRadians(-70)) return
    cam.setView({
      destination: cam.positionWC.clone(),
      orientation: {
        heading: cam.heading,
        pitch: CesiumMath.toRadians(-40),
        roll: 0,
      },
    })
  }

  clear() {
    if (this.primitive) {
      this.viewer.scene.primitives.remove(this.primitive)
      this.primitive = undefined
    }
    if (this.topPrimitive) {
      this.viewer.scene.primitives.remove(this.topPrimitive)
      this.topPrimitive = undefined
    }
    this.cells = []
  }

  focusFirst() {
    const cell = this.cells[0]
    if (!cell || this.viewer.isDestroyed()) return
    try {
      const b = geosot.bboxFromCode(cell.code)
      const lon = (b.west + b.east) / 2
      const lat = (b.south + b.north) / 2
      this.viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(
          lon,
          lat,
          Math.max(800, cell.heightM * 40)
        ),
        duration: 1.0,
        orientation: {
          heading: 0,
          pitch: CesiumMath.toRadians(-40),
          roll: 0,
        },
      })
    } catch {
      /* ignore */
    }
  }
}

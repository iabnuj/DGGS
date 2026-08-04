import {
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

export type VolumeCell = {
  code: string
  /** CSS color */
  color: string
  /** 归一化 0–1 */
  t: number
}

const MAX_CELLS = 1_200
const METERS_PER_DEG = 111_320

/**
 * 三维球体场：每格一根「柱状体」，高度随标量变化，侧面可见才有体感。
 * （多层薄片在俯视下几乎等同平面填色，故改为单柱挤出。）
 */
export class VolumeFieldLayer {
  private primitive: Primitive | undefined
  private outlinePrimitive: Primitive | undefined
  private visible = true

  constructor(private viewer: Viewer) {}

  setVisible(v: boolean) {
    this.visible = v
    if (this.primitive) this.primitive.show = v
    if (this.outlinePrimitive) this.outlinePrimitive.show = v
    if (!this.viewer.isDestroyed()) this.viewer.scene.requestRender()
  }

  draw(
    cells: VolumeCell[],
    opts?: { layers?: number; totalHeightM?: number }
  ) {
    this.clear()
    if (this.viewer.isDestroyed() || cells.length === 0) return

    const list = cells.length > MAX_CELLS ? cells.slice(0, MAX_CELLS) : cells
    const heightCap = opts?.totalHeightM

    const fillInstances: GeometryInstance[] = []
    const outlineInstances: GeometryInstance[] = []

    for (const cell of list) {
      try {
        const b = geosot.bboxFromCode(cell.code)
        const midLat = ((b.south + b.north) / 2) * (Math.PI / 180)
        const cellW =
          Math.abs(b.east - b.west) * METERS_PER_DEG * Math.max(0.2, Math.cos(midLat))
        const cellH = Math.abs(b.north - b.south) * METERS_PER_DEG
        const cellEdge = Math.max(30, Math.min(cellW, cellH))
        // 柱高：至少约 0.8 倍格宽，最大约 4 倍，随 t 变化 —— 俯视也能看出起伏
        const minH = cellEdge * 0.8
        const maxH = heightCap ?? cellEdge * 4.5
        const extruded = minH + cell.t * (maxH - minH)

        const base = Color.fromCssColorString(cell.color)
        const fill = Color.fromBytes(
          Math.round(base.red * 255),
          Math.round(base.green * 255),
          Math.round(base.blue * 255),
          Math.round(200)
        )
        const outline = Color.fromBytes(
          Math.round(base.red * 255),
          Math.round(base.green * 255),
          Math.round(base.blue * 255),
          255
        )

        const rectangle = Rectangle.fromDegrees(b.west, b.south, b.east, b.north)
        fillInstances.push(
          new GeometryInstance({
            id: `vf:${cell.code}`,
            geometry: new RectangleGeometry({
              rectangle,
              height: 0,
              extrudedHeight: extruded,
              vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
            }),
            attributes: {
              color: ColorGeometryInstanceAttribute.fromColor(fill),
            },
          })
        )
        // 顶面略抬一点的细环感：再用一层很扁的顶盖加深轮廓
        outlineInstances.push(
          new GeometryInstance({
            id: `vf-top:${cell.code}`,
            geometry: new RectangleGeometry({
              rectangle,
              height: extruded,
              extrudedHeight: extruded + Math.max(8, cellEdge * 0.04),
              vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
            }),
            attributes: {
              color: ColorGeometryInstanceAttribute.fromColor(outline),
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

    if (outlineInstances.length > 0) {
      this.outlinePrimitive = this.viewer.scene.primitives.add(
        new Primitive({
          geometryInstances: outlineInstances,
          appearance: new PerInstanceColorAppearance({
            flat: false,
            translucent: false,
            closed: true,
            faceForward: true,
          }),
          asynchronous: true,
          releaseGeometryInstances: true,
        })
      )
      this.outlinePrimitive.show = this.visible
    }

    this.viewer.scene.requestRender()
  }

  /** 斜视一点，让柱体侧面露出来 */
  tiltForVolume() {
    if (this.viewer.isDestroyed()) return
    const cam = this.viewer.camera
    const pitch = cam.pitch
    // 若近乎垂直向下，压到约 -45°
    if (pitch > CesiumMath.toRadians(-70)) return
    const dest = cam.positionWC.clone()
    cam.setView({
      destination: dest,
      orientation: {
        heading: cam.heading,
        pitch: CesiumMath.toRadians(-42),
        roll: 0,
      },
    })
  }

  clear() {
    if (this.primitive) {
      this.viewer.scene.primitives.remove(this.primitive)
      this.primitive = undefined
    }
    if (this.outlinePrimitive) {
      this.viewer.scene.primitives.remove(this.outlinePrimitive)
      this.outlinePrimitive = undefined
    }
  }
}

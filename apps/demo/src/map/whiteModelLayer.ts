import {
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  GeometryInstance,
  PerInstanceColorAppearance,
  Primitive,
  Rectangle,
  RectangleGeometry,
  type Viewer,
} from "cesium"
import { geosot } from "@dggs/grid-core"

/**
 * 格网挤出白模：按 GeoSOT 编码画半透明立方体（场地白模①）。
 */
export class WhiteModelLayer {
  private primitive: Primitive | undefined
  private codes: string[] = []
  private heightM = 24
  private visible = true

  constructor(private viewer: Viewer) {}

  setVisible(v: boolean) {
    this.visible = v
    if (this.primitive) this.primitive.show = v
    if (!this.viewer.isDestroyed()) this.viewer.scene.requestRender()
  }

  setHeight(m: number) {
    this.heightM = Math.max(2, m)
    if (this.codes.length) this.draw(this.codes, this.heightM)
  }

  draw(codes: string[], heightM = this.heightM) {
    this.clear()
    this.codes = [...codes]
    this.heightM = heightM
    if (codes.length === 0 || this.viewer.isDestroyed()) return

    const instances: GeometryInstance[] = []
    const max = 4_000
    let n = 0
    for (const code of codes) {
      if (n >= max) break
      try {
        const b = geosot.bboxFromCode(code)
        const h0 = 0
        instances.push(
          new GeometryInstance({
            id: `wm:${code}`,
            geometry: new RectangleGeometry({
              rectangle: Rectangle.fromDegrees(b.west, b.south, b.east, b.north),
              height: h0,
              extrudedHeight: h0 + this.heightM,
              vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
            }),
            attributes: {
              color: ColorGeometryInstanceAttribute.fromColor(
                Color.fromCssColorString("#e8eef5").withAlpha(0.55)
              ),
            },
          })
        )
        n++
      } catch {
        /* skip bad codes */
      }
    }
    if (instances.length === 0) return
    const prim = this.viewer.scene.primitives.add(
      new Primitive({
        geometryInstances: instances,
        appearance: new PerInstanceColorAppearance({
          flat: true,
          translucent: true,
          closed: true,
        }),
        asynchronous: true,
        releaseGeometryInstances: true,
      })
    )
    this.primitive = prim
    prim.show = this.visible
    this.viewer.scene.requestRender()
  }

  clear() {
    if (this.primitive) {
      this.viewer.scene.primitives.remove(this.primitive)
      this.primitive = undefined
    }
    this.codes = []
  }

  /** Fly camera near first cell (best-effort). */
  focusFirst() {
    const code = this.codes[0]
    if (!code || this.viewer.isDestroyed()) return
    try {
      const b = geosot.bboxFromCode(code)
      const lon = (b.west + b.east) / 2
      const lat = (b.south + b.north) / 2
      this.viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(lon, lat, Math.max(800, this.heightM * 40)),
        duration: 1.0,
      })
    } catch {
      /* ignore */
    }
  }
}

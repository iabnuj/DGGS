import {
  Cartesian3,
  Cesium3DTileset,
  Color,
  HeadingPitchRange,
  HeightReference,
  Math as CesiumMath,
  type Entity,
  type Viewer,
} from "cesium"

/**
 * 外部模型白模③：glTF Entity 或 3D Tileset。
 */
export class ExternalModelLayer {
  private entity: Entity | undefined
  private tileset: Cesium3DTileset | undefined
  private visible = true

  constructor(private viewer: Viewer) {}

  setVisible(v: boolean) {
    this.visible = v
    if (this.entity) this.entity.show = v
    if (this.tileset) this.tileset.show = v
    if (!this.viewer.isDestroyed()) this.viewer.scene.requestRender()
  }

  clear() {
    if (this.entity) {
      this.viewer.entities.remove(this.entity)
      this.entity = undefined
    }
    if (this.tileset) {
      this.viewer.scene.primitives.remove(this.tileset)
      this.tileset = undefined
    }
  }

  loadGltf(url: string, lon: number, lat: number, height = 0) {
    if (this.viewer.isDestroyed()) return
    this.clear()
    this.entity = this.viewer.entities.add({
      name: "external-gltf",
      position: Cartesian3.fromDegrees(lon, lat, height),
      model: {
        uri: url,
        heightReference: HeightReference.CLAMP_TO_GROUND,
        color: Color.WHITE.withAlpha(0.95),
        minimumPixelSize: 64,
        maximumScale: 20_000,
      },
    })
    this.entity.show = this.visible
    this.viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(lon, lat, 1_200),
      duration: 1.0,
    })
    this.viewer.scene.requestRender()
  }

  async loadTileset(url: string) {
    if (this.viewer.isDestroyed()) return
    this.clear()
    const tileset = await Cesium3DTileset.fromUrl(url)
    const added = this.viewer.scene.primitives.add(tileset)
    this.tileset = added
    added.show = this.visible
    this.viewer.scene.requestRender()
    try {
      await this.viewer.zoomTo(
        tileset,
        new HeadingPitchRange(
          0,
          CesiumMath.toRadians(-35),
          tileset.boundingSphere.radius * 2.2
        )
      )
    } catch {
      /* ignore */
    }
  }
}

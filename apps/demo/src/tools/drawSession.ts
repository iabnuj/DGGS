import {
  CallbackProperty,
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  HeightReference,
  Math as CesiumMath,
  PolygonHierarchy,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  type Entity,
  type Viewer,
} from "cesium"
import type { LngLat } from "@/tools/geometryToGrid"

function pickLngLat(viewer: Viewer, position: Cartesian2): LngLat | null {
  const cartesian = viewer.camera.pickEllipsoid(position, viewer.scene.globe.ellipsoid)
  if (!cartesian) return null
  const carto = Cartographic.fromCartesian(cartesian)
  return {
    lng: CesiumMath.toDegrees(carto.longitude),
    lat: CesiumMath.toDegrees(carto.latitude),
  }
}

export type DrawKind = "line" | "polygon"

export type DrawSession = {
  kind: DrawKind
  points: LngLat[]
  destroy: () => void
  finish: () => LngLat[] | null
  cancel: () => void
}

export function startDrawSession(
  viewer: Viewer,
  kind: DrawKind,
  onChange?: (points: LngLat[]) => void
): DrawSession {
  const points: LngLat[] = []
  const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
  const entities: Entity[] = []

  const positionsProp = new CallbackProperty(() => {
    return points.map((p) => Cartesian3.fromDegrees(p.lng, p.lat))
  }, false)

  if (kind === "line") {
    entities.push(
      viewer.entities.add({
        polyline: {
          positions: positionsProp,
          width: 3,
          material: Color.fromCssColorString("#34d399"),
          clampToGround: true,
        },
      })
    )
  } else {
    entities.push(
      viewer.entities.add({
        polygon: {
          hierarchy: new CallbackProperty(() => {
            if (points.length < 2) return new PolygonHierarchy([])
            return new PolygonHierarchy(
              points.map((p) => Cartesian3.fromDegrees(p.lng, p.lat))
            )
          }, false),
          material: Color.fromCssColorString("#34d399").withAlpha(0.28),
          outline: true,
          outlineColor: Color.fromCssColorString("#34d399"),
          heightReference: HeightReference.CLAMP_TO_GROUND,
        },
      })
    )
    entities.push(
      viewer.entities.add({
        polyline: {
          positions: positionsProp,
          width: 2,
          material: Color.fromCssColorString("#34d399"),
          clampToGround: true,
        },
      })
    )
  }

  const addPoint = (p: LngLat) => {
    points.push(p)
    onChange?.([...points])
  }

  handler.setInputAction((movement: { position: Cartesian2 }) => {
    const p = pickLngLat(viewer, movement.position)
    if (p) addPoint(p)
  }, ScreenSpaceEventType.LEFT_CLICK)

  const finish = (): LngLat[] | null => {
    if (kind === "line" && points.length < 2) return null
    if (kind === "polygon" && points.length < 3) return null
    const out = [...points]
    if (kind === "polygon") {
      const first = out[0]!
      const last = out[out.length - 1]!
      if (first.lng !== last.lng || first.lat !== last.lat) out.push({ ...first })
    }
    return out
  }

  const destroy = () => {
    handler.destroy()
    for (const e of entities) viewer.entities.remove(e)
  }

  const cancel = () => {
    points.length = 0
    destroy()
  }

  return { kind, points, destroy, finish, cancel }
}

export function bindFinishActions(
  viewer: Viewer,
  onFinish: () => void
): ScreenSpaceEventHandler {
  const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
  handler.setInputAction(() => onFinish(), ScreenSpaceEventType.RIGHT_CLICK)
  handler.setInputAction(() => onFinish(), ScreenSpaceEventType.LEFT_DOUBLE_CLICK)
  return handler
}

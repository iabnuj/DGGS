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

export type DrawKind = "line" | "polygon" | "freeLine" | "freePolygon"

export type DrawSession = {
  kind: DrawKind
  points: LngLat[]
  destroy: () => void
  finish: () => LngLat[] | null
  cancel: () => void
}

function attachPreview(
  viewer: Viewer,
  kind: DrawKind,
  points: LngLat[]
): Entity[] {
  const entities: Entity[] = []
  const positionsProp = new CallbackProperty(() => {
    return points.map((p) => Cartesian3.fromDegrees(p.lng, p.lat))
  }, false)

  const isPoly = kind === "polygon" || kind === "freePolygon"
  if (isPoly) {
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
  }
  entities.push(
    viewer.entities.add({
      polyline: {
        positions: positionsProp,
        width: isPoly ? 2 : 3,
        material: Color.fromCssColorString("#34d399"),
        clampToGround: true,
      },
    })
  )
  return entities
}

/** Click-to-add vertices (折线 / 多边形). */
export function startDrawSession(
  viewer: Viewer,
  kind: "line" | "polygon",
  onChange?: (points: LngLat[]) => void
): DrawSession {
  const points: LngLat[] = []
  const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
  const entities = attachPreview(viewer, kind, points)

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

const FREEHAND_MIN_PX = 5

/**
 * Drag freehand stroke; releases mouse to finish.
 * Disables camera drag while stroking so the globe does not spin.
 */
export function startFreehandDrawSession(
  viewer: Viewer,
  kind: "freeLine" | "freePolygon",
  opts?: {
    onChange?: (points: LngLat[]) => void
    onComplete?: (points: LngLat[] | null) => void
  }
): DrawSession {
  const points: LngLat[] = []
  const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
  const entities = attachPreview(viewer, kind, points)
  let drawing = false
  let lastScreen: Cartesian2 | null = null

  const ctrl = viewer.scene.screenSpaceCameraController
  const saved = {
    enableInputs: ctrl.enableInputs,
    enableRotate: ctrl.enableRotate,
    enableTranslate: ctrl.enableTranslate,
    enableTilt: ctrl.enableTilt,
    enableLook: ctrl.enableLook,
  }

  const freezeCamera = (freeze: boolean) => {
    if (freeze) {
      ctrl.enableRotate = false
      ctrl.enableTranslate = false
      ctrl.enableTilt = false
      ctrl.enableLook = false
    } else {
      ctrl.enableInputs = saved.enableInputs
      ctrl.enableRotate = saved.enableRotate
      ctrl.enableTranslate = saved.enableTranslate
      ctrl.enableTilt = saved.enableTilt
      ctrl.enableLook = saved.enableLook
    }
  }

  const addPoint = (p: LngLat) => {
    points.push(p)
    opts?.onChange?.([...points])
  }

  const finish = (): LngLat[] | null => {
    if (kind === "freeLine" && points.length < 2) return null
    if (kind === "freePolygon" && points.length < 3) return null
    const out = [...points]
    if (kind === "freePolygon") {
      const first = out[0]!
      const last = out[out.length - 1]!
      if (first.lng !== last.lng || first.lat !== last.lat) out.push({ ...first })
    }
    return out
  }

  const destroy = () => {
    freezeCamera(false)
    handler.destroy()
    for (const e of entities) viewer.entities.remove(e)
  }

  const cancel = () => {
    points.length = 0
    destroy()
  }

  handler.setInputAction((movement: { position: Cartesian2 }) => {
    drawing = true
    freezeCamera(true)
    points.length = 0
    lastScreen = Cartesian2.clone(movement.position)
    const p = pickLngLat(viewer, movement.position)
    if (p) addPoint(p)
  }, ScreenSpaceEventType.LEFT_DOWN)

  handler.setInputAction((movement: { endPosition: Cartesian2 }) => {
    if (!drawing) return
    const pos = movement.endPosition
    if (lastScreen) {
      const dx = pos.x - lastScreen.x
      const dy = pos.y - lastScreen.y
      if (dx * dx + dy * dy < FREEHAND_MIN_PX * FREEHAND_MIN_PX) return
    }
    const p = pickLngLat(viewer, pos)
    if (!p) return
    lastScreen = Cartesian2.clone(pos)
    addPoint(p)
  }, ScreenSpaceEventType.MOUSE_MOVE)

  const endStroke = () => {
    if (!drawing) return
    drawing = false
    freezeCamera(false)
    const out = finish()
    opts?.onComplete?.(out)
  }

  handler.setInputAction(endStroke, ScreenSpaceEventType.LEFT_UP)

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

export function isLineDrawKind(kind: DrawKind): boolean {
  return kind === "line" || kind === "freeLine"
}

export function isPolygonDrawKind(kind: DrawKind): boolean {
  return kind === "polygon" || kind === "freePolygon"
}

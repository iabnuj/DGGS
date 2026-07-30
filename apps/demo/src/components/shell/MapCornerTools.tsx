import { Box, MousePointer2, Spline, Pentagon, Eraser } from "lucide-react"
import { SceneMode } from "cesium"
import { Button } from "@/components/ui/button"
import { getMapRuntime } from "@/map/useCesiumMap"
import { useAppStore, type ToolMode } from "@/state/store"

/** Left drawer width — keep in sync with LeftDrawer. */
const LEFT_PANEL_W = 320

const selectTools: { mode: ToolMode; label: string; icon: typeof MousePointer2 }[] = [
  { mode: "pick", label: "点选", icon: MousePointer2 },
  { mode: "drawLine", label: "画线", icon: Spline },
  { mode: "drawPolygon", label: "画面", icon: Pentagon },
]

/**
 * Top map tools: 2D/3D + grid selection (pick / line / polygon).
 * Positioned in the map band between side panels.
 */
export function MapCornerTools() {
  const leftOpen = useAppStore((s) => s.leftPanelOpen)
  const rightOpen = useAppStore((s) => s.rightPanelOpen)
  const toolMode = useAppStore((s) => s.toolMode)

  const left = leftOpen ? LEFT_PANEL_W : 0
  const right = rightOpen ? 340 : 0

  return (
    <div
      className="pointer-events-none absolute top-3 z-20 flex justify-center transition-[left,right] duration-200"
      style={{ left, right }}
    >
      <div className="pointer-events-auto flex gap-1 rounded-lg border border-border/60 bg-[#0b1017]/0.7 p-1 backdrop-blur-md">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title="2D / 3D"
          onClick={() => {
            const viewer = getMapRuntime()?.viewer
            if (!viewer) return
            if (viewer.scene.mode === SceneMode.SCENE3D) viewer.scene.morphTo2D(0.8)
            else viewer.scene.morphTo3D(0.8)
            window.setTimeout(() => getMapRuntime()?.refresh(), 900)
          }}
        >
          <Box className="h-4 w-4" />
        </Button>
        {selectTools.map((t) => {
          const Icon = t.icon
          const on = toolMode === t.mode
          return (
            <Button
              key={t.mode}
              type="button"
              variant={on ? "secondary" : "ghost"}
              size="icon"
              title={t.label}
              aria-pressed={on}
              onClick={() => useAppStore.getState().setToolMode(t.mode)}
            >
              <Icon className="h-4 w-4" />
            </Button>
          )
        })}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title="清除选中"
          onClick={() => {
            useAppStore.getState().setGridSet(null)
            useAppStore.getState().setToolMode("pick")
            getMapRuntime()?.applyHighlights()
            useAppStore.getState().setStatusText("已清除选中")
          }}
        >
          <Eraser className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

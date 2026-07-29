import { Expand, RotateCcw, Box } from "lucide-react"
import { SceneMode } from "cesium"
import { Button } from "@/components/ui/button"
import { getMapRuntime, resetChinaView } from "@/map/useCesiumMap"

export function MapCornerTools() {
  return (
    <div className="pointer-events-auto absolute bottom-10 left-5 z-20 flex gap-1 rounded-lg border border-border/60 bg-[#0b1017]/0.7 p-1 backdrop-blur-md">
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
      <Button
        type="button"
        variant="ghost"
        size="icon"
        title="全屏"
        onClick={() => {
          const root = document.documentElement
          if (!document.fullscreenElement) void root.requestFullscreen()
          else void document.exitFullscreen()
        }}
      >
        <Expand className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        title="重置视角"
        onClick={() => {
          resetChinaView()
          window.setTimeout(() => getMapRuntime()?.refresh(), 1300)
        }}
      >
        <RotateCcw className="h-4 w-4" />
      </Button>
    </div>
  )
}

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { useAppStore, type ToolMode } from "@/state/store"
import { getMapRuntime } from "@/map/useCesiumMap"

const tools: { mode: ToolMode; label: string }[] = [
  { mode: "pick", label: "点选" },
  { mode: "drawLine", label: "画线" },
  { mode: "drawPolygon", label: "画面" },
]

export function QueryTab() {
  const toolMode = useAppStore((s) => s.toolMode)

  return (
    <div className="space-y-3">
      <Label>地图工具</Label>
      <div className="grid grid-cols-3 gap-2">
        {tools.map((t) => (
          <Button
            key={t.mode}
            type="button"
            size="sm"
            variant={toolMode === t.mode ? "secondary" : "outline"}
            onClick={() => useAppStore.getState().setToolMode(t.mode)}
          >
            {t.label}
          </Button>
        ))}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-full"
        onClick={() => {
          useAppStore.getState().setGridSet(null)
          useAppStore.getState().setAnalysisResult(null)
          useAppStore.getState().setToolMode("pick")
          getMapRuntime()?.gridLayer.setHighlights([])
          getMapRuntime()?.refresh()
          useAppStore.getState().setStatusText("已清除查询")
        }}
      >
        清除当前几何
      </Button>
      <p className="text-[11px] text-muted-foreground">
        画线/画面：左键加点，右键或双击结束。结果在右侧。
      </p>
    </div>
  )
}

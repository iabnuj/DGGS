import { useState } from "react"
import {
  Box,
  Eraser,
  Lasso,
  MousePointer2,
  PenLine,
  Pentagon,
  Search,
  Spline,
} from "lucide-react"
import { SceneMode } from "cesium"
import { Button } from "@/components/ui/button"
import {
  paintSemanticHits,
  searchSemanticText,
} from "@/data/semanticPipeline"
import { getMapRuntime } from "@/map/useCesiumMap"
import { useAppStore, type ToolMode } from "@/state/store"

/** Left drawer width — keep in sync with LeftDrawer. */
const LEFT_PANEL_W = 320

const selectTools: { mode: ToolMode; label: string; icon: typeof MousePointer2 }[] = [
  { mode: "pick", label: "点选", icon: MousePointer2 },
  { mode: "drawLine", label: "折线选格", icon: Spline },
  { mode: "drawPolygon", label: "多边形选格", icon: Pentagon },
  { mode: "drawFreeLine", label: "自由线选格", icon: PenLine },
  { mode: "drawFreePolygon", label: "自由面选格", icon: Lasso },
]

/**
 * Top map tools: 2D/3D + grid selection (pick / line / polygon) + semantic search.
 * Positioned in the map band between side panels.
 */
export function MapCornerTools() {
  const leftOpen = useAppStore((s) => s.leftPanelOpen)
  const rightOpen = useAppStore((s) => s.rightPanelOpen)
  const toolMode = useAppStore((s) => s.toolMode)
  const [query, setQuery] = useState("")
  const [busy, setBusy] = useState(false)

  const left = leftOpen ? LEFT_PANEL_W : 0
  const right = rightOpen ? 340 : 0

  const runSemanticSearch = async () => {
    const q = query.trim()
    if (!q || busy) return
    setBusy(true)
    try {
      const hits = await searchSemanticText(q, 48)
      const codes = paintSemanticHits(hits, `语义·${q}`)
      getMapRuntime()?.applyAnalysisOverlays?.()
      useAppStore
        .getState()
        .setStatusText(
          hits.length
            ? `语义检索「${q}」命中 ${hits.length} 格`
            : `无命中：请先导入时勾选「同时生成语义向量」`
        )
      if (codes.length) {
        useAppStore.getState().setGridSet({
          codes: codes.slice(0, 80),
          level: useAppStore.getState().level,
          from: "pick",
        })
        getMapRuntime()?.applyHighlights()
      }
    } catch (e) {
      useAppStore
        .getState()
        .setStatusText(
          `语义检索失败: ${e instanceof Error ? e.message : String(e)}`
        )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="pointer-events-none absolute top-3 z-20 flex justify-center transition-[left,right] duration-200"
      style={{ left, right }}
    >
      <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-border/60 bg-[#0b1017]/0.7 p-1 backdrop-blur-md">
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

        <div className="mx-0.5 h-5 w-px shrink-0 bg-border/70" aria-hidden />

        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault()
            void runSemanticSearch()
          }}
        >
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="语义检索…"
            title="基于语义向量检索（如：道路、建筑、机场）"
            disabled={busy}
            className="h-8 w-[9.5rem] rounded-md border border-border/50 bg-background/80 px-2 text-[12px] text-foreground outline-none placeholder:text-muted-foreground focus:border-border disabled:opacity-60 sm:w-[12rem]"
          />
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            title="语义检索"
            disabled={busy || !query.trim()}
          >
            <Search className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  )
}

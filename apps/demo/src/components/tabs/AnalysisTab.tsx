import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { runAnalysis } from "@/analysis"
import { getWarehouse } from "@/data/warehouseBoot"
import { getMapRuntime } from "@/map/useCesiumMap"
import { useAppStore } from "@/state/store"
import type { GridCellRecord } from "@dggs/grid-ingest"

async function run(kind: "intersect" | "aggregate" | "buffer") {
  const s = useAppStore.getState()
  const records = (await getWarehouse().list()) as GridCellRecord[]
  const result = runAnalysis(kind, {
    gridSet: s.gridSet,
    records,
    bufferRadiusM: s.bufferRadiusM,
    obstacleSource: "alert",
  })
  if (!result) {
    useAppStore.getState().setStatusText("当前查询不足以执行该分析")
    return
  }
  useAppStore.getState().setAnalysisResult(result)
  if (result.kind === "buffer") {
    useAppStore.getState().setBufferPreview(true)
    getMapRuntime()?.applyHighlights()
  } else if (result.kind === "intersect") {
    useAppStore.getState().setBufferPreview(false)
    getMapRuntime()?.applyHighlights()
  }
  useAppStore.getState().setStatusText(`已完成${kind}`)
}

export function AnalysisTab() {
  const gridSet = useAppStore((s) => s.gridSet)
  const bufferRadiusM = useAppStore((s) => s.bufferRadiusM)
  const canIntersect =
    !!gridSet && (gridSet.from === "line" || gridSet.from === "polygon")
  const canAggregate = !!gridSet && gridSet.codes.length > 0
  const canBuffer = !!gridSet && gridSet.from === "pick" && gridSet.codes.length === 1

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle>空间碰撞</CardTitle>
          <CardDescription>autoRun: 关 · 线/面 ∩ 告警障碍层</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            className="w-full"
            size="sm"
            disabled={!canIntersect}
            onClick={() => void run("intersect")}
          >
            开始检测
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>区域聚合</CardTitle>
          <CardDescription>autoRun: 开 · 画面后自动；也可手动</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            size="sm"
            disabled={!canAggregate}
            onClick={() => void run("aggregate")}
          >
            执行统计
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>网格缓冲</CardTitle>
          <CardDescription>点选后调半径或点按钮预览邻域</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>缓冲距离</Label>
            <span className="font-mono text-xs">{bufferRadiusM} m</span>
          </div>
          <Slider
            value={[bufferRadiusM]}
            min={500}
            max={2000}
            step={100}
            disabled={!canBuffer}
            onValueChange={([v]) => {
              useAppStore.getState().setBufferRadiusM(v)
            }}
          />
          <Button
            type="button"
            variant="outline"
            className="w-full"
            size="sm"
            disabled={!canBuffer}
            onClick={() => void run("buffer")}
          >
            重新生成缓冲
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

import { useRef, useState } from "react"
import { Eye, EyeOff, LocateFixed, Map, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { getDesktopApi, isDesktopApp } from "@/ipcWarehouse"
import { ingestGeoJsonText } from "@/data/ingestGeoJson"
import {
  cellSizeMeters,
  suggestIngestLevel,
} from "@/data/suggestIngestLevel"
import {
  hasSourceFeatures,
  registerFromGeoJsonText,
} from "@/data/featureGeometryStore"
import {
  deleteSourceLayer,
  getWarehouse,
  importRecords,
  refreshDataOverlay,
} from "@/data/warehouseBoot"
import { useAppStore } from "@/state/store"
import { flyToCode, getMapRuntime } from "@/map/useCesiumMap"
import type { GridCellRecord } from "@dggs/grid-ingest"

type PendingImport = {
  name: string
  text: string
  suggested: number
  reason: string
  level: number
}

function formatCellEdge(level: number): string {
  const m = cellSizeMeters(level)
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`
}

function applyGisFeaturesNow() {
  getMapRuntime()?.applyGisFeatures()
}

export function DataTab() {
  const layers = useAppStore((s) => s.layers)
  const progress = useAppStore((s) => s.importProgress)
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<PendingImport | null>(null)

  const stageImport = (name: string, text: string) => {
    const fallbackLevel = useAppStore.getState().level
    const suggestion = suggestIngestLevel(text, { fallbackLevel })
    setPending({
      name,
      text,
      suggested: suggestion.level,
      reason: suggestion.reason,
      level: suggestion.level,
    })
    useAppStore
      .getState()
      .setStatusText(`已解析 ${name} · ${suggestion.reason} · 请确认后入格`)
  }

  const confirmImport = async () => {
    if (!pending) return
    const { name, text, level } = pending
    setPending(null)
    try {
      useAppStore.getState().setStatusText(`正在入格 ${name} @ L${level}…`)
      const source = name.replace(/\.(geo)?json$/i, "") || "import"
      const featCount = registerFromGeoJsonText(source, text)
      const records = ingestGeoJsonText(text, { level, source, label: name })
      if (records.length === 0) throw new Error("未解析到可入格要素")
      // Replace prior rows for this source so old single-occupancy keys don't linger.
      const wh = getWarehouse()
      const prior = (await wh.list({ source })) as GridCellRecord[]
      if (prior.length && wh.delete) await wh.delete(prior)
      await importRecords(records)
      useAppStore.getState().patchLayer(source, { featuresVisible: true })
      applyGisFeaturesNow()
      const first = records[0]?.gridId
      if (first) flyToCode(first, 80_000)
      useAppStore.getState().setStatusText(
        `已导入 ${records.length} 条格 @ L${level} · 要素 ${featCount} · 已打开要素显示`
      )
    } catch (err) {
      useAppStore.getState().setStatusText(
        `导入失败: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  const onPickFile = async (file: File) => {
    const text = await file.text()
    stageImport(file.name, text)
  }

  const onImportClick = async () => {
    const desktop = getDesktopApi()
    if (desktop?.pickImportFile) {
      const picked = await desktop.pickImportFile()
      if (picked) stageImport(picked.name, picked.text)
      return
    }
    fileRef.current?.click()
  }

  return (
    <div className="space-y-3">
      <input
        ref={fileRef}
        type="file"
        accept=".json,.geojson,application/geo+json,application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void onPickFile(f)
          e.target.value = ""
        }}
      />
      <Button type="button" className="w-full" onClick={() => void onImportClick()}>
        导入数据 {isDesktopApp() ? "(本地文件)" : "(GeoJSON)"}
      </Button>
      {progress != null && (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
      {pending && (
        <Card className="border-primary/40">
          <CardHeader className="pb-2">
            <CardTitle className="truncate text-sm">{pending.name}</CardTitle>
            <CardDescription className="text-[11px] leading-relaxed">
              {pending.reason}
              {pending.level !== pending.suggested
                ? ` · 已改为 L${pending.level}`
                : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>入格层级</Label>
                <span className="font-mono text-xs">
                  L{pending.level}
                  <span className="ml-1 text-muted-foreground">
                    · 约 {formatCellEdge(pending.level)}
                  </span>
                </span>
              </div>
              <Slider
                value={[pending.level]}
                min={8}
                max={16}
                step={1}
                onValueChange={([v]) =>
                  setPending((p) => (p && v != null ? { ...p, level: v } : p))
                }
              />
              <p className="text-[10px] text-muted-foreground">
                建议 L{pending.suggested}；可拖动修改后再确认入格
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                className="flex-1"
                onClick={() => void confirmImport()}
              >
                确认入格
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setPending(null)
                  useAppStore.getState().setStatusText("已取消导入")
                }}
              >
                取消
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      <div className="max-h-[42vh] space-y-2 overflow-y-auto">
        {layers.length === 0 ? (
          <p className="text-xs text-muted-foreground">暂无图层</p>
        ) : (
          layers.map((layer) => (
            <Card key={layer.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between gap-2">
                  <span className="truncate">{layer.name}</span>
                  <span className="shrink-0 text-[10px] font-normal text-muted-foreground">
                    {layer.type}
                  </span>
                </CardTitle>
                <CardDescription>
                  {layer.count.toLocaleString()} 格 · L{layer.levelMin}
                  {layer.levelMax !== layer.levelMin ? `-${layer.levelMax}` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  title={layer.visible ? "隐藏入格高亮" : "显示入格高亮"}
                  onClick={() => {
                    void (async () => {
                      const nextVisible = !layer.visible
                      useAppStore.getState().patchLayer(layer.id, {
                        visible: nextVisible,
                      })
                      const codes = await refreshDataOverlay()
                      const rows = (await getWarehouse().list({
                        source: layer.source,
                      })) as GridCellRecord[]
                      if (nextVisible && rows[0]) {
                        flyToCode(rows[0].gridId, 60_000)
                      }
                      useAppStore
                        .getState()
                        .setStatusText(
                          nextVisible
                            ? `显示格网「${layer.name}」· ${codes.length} 格`
                            : `隐藏格网「${layer.name}」· ${codes.length} 格`
                        )
                    })()
                  }}
                >
                  {layer.visible ? (
                    <Eye className="h-4 w-4" />
                  ) : (
                    <EyeOff className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  title={
                    layer.featuresVisible ? "隐藏 GIS 要素" : "显示 GIS 要素"
                  }
                  onClick={() => {
                    const next = !layer.featuresVisible
                    if (next && !hasSourceFeatures(layer.source)) {
                      useAppStore
                        .getState()
                        .setStatusText(
                          `「${layer.name}」无原始几何，请重新导入对应 GeoJSON`
                        )
                      return
                    }
                    useAppStore.getState().patchLayer(layer.id, {
                      featuresVisible: next,
                    })
                    applyGisFeaturesNow()
                    const n = hasSourceFeatures(layer.source)
                      ? "已缓存要素"
                      : ""
                    useAppStore
                      .getState()
                      .setStatusText(
                        next
                          ? `显示要素「${layer.name}」${n ? ` · ${n}` : ""}`
                          : `隐藏要素「${layer.name}」`
                      )
                  }}
                >
                  {layer.featuresVisible ? (
                    <Map className="h-4 w-4 text-sky-400" />
                  ) : (
                    <Map className="h-4 w-4 opacity-35" />
                  )}
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  title="定位"
                  onClick={async () => {
                    const wh = getWarehouse()
                    const rows = (await wh.list({
                      source: layer.source,
                    })) as GridCellRecord[]
                    if (!layer.visible) {
                      useAppStore.getState().patchLayer(layer.id, {
                        visible: true,
                      })
                      await refreshDataOverlay()
                    }
                    if (rows[0]) flyToCode(rows[0].gridId, 80_000)
                  }}
                >
                  <LocateFixed className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  title="删除该 source"
                  onClick={() => void deleteSourceLayer(layer.source)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}

import { useEffect, useMemo, useRef, useState } from "react"
import { Eye, EyeOff, LocateFixed, Map, Trash2, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { FieldStylePopover } from "@/components/shell/FieldStylePopover"
import { OverlayScrollArea } from "@/components/ui/overlay-scroll-area"
import { getDesktopApi, isDesktopApp, confirmAction } from "@/ipcWarehouse"
import { ingestFieldCsv } from "@dggs/grid-ingest"
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
  syncLayersFromWarehouse,
} from "@/data/warehouseBoot"
import { buildSemanticFromSource } from "@/data/semanticPipeline"
import { useAppStore } from "@/state/store"
import { flyToCode, flyToCodes, getMapRuntime } from "@/map/useCesiumMap"
import type { GridCellRecord } from "@dggs/grid-ingest"
import { semanticSourceName } from "@dggs/grid-semantic"

type PendingGeoJson = {
  kind: "geojson"
  name: string
  text: string
  suggested: number
  reason: string
  level: number
}

type PendingCsv = {
  kind: "csv"
  name: string
  text: string
  suggested: number
  reason: string
  level: number
}

type PendingRaster = {
  kind: "raster"
  name: string
  filePath: string
  suggested: number
  reason: string
  level: number
  estimatedCells: number | null
  modality: string
}

type PendingImport = PendingGeoJson | PendingCsv | PendingRaster

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
  /** 入格确认时是否同时生成语义向量 */
  const [withSemantic, setWithSemantic] = useState(true)

  const dataLayers = useMemo(
    () => layers.filter((l) => !l.source.startsWith("semantic:")),
    [layers]
  )
  const semanticReady = useMemo(() => {
    const set = new Set<string>()
    for (const l of layers) {
      if (l.source.startsWith("semantic:") && l.count > 0) {
        set.add(l.source)
      }
    }
    return set
  }, [layers])

  useEffect(() => {
    const api = getDesktopApi()
    if (!api?.onImportProgress) return
    return api.onImportProgress(({ progress: p }) => {
      useAppStore.getState().setImportProgress(p)
    })
  }, [])

  const maybeBuildSemantic = async (source: string, enabled: boolean) => {
    if (!enabled) return 0
    useAppStore.getState().setStatusText(`入格完成，正在生成语义向量 ${source}…`)
    try {
      return await buildSemanticFromSource(source)
    } catch (err) {
      useAppStore.getState().setStatusText(
        `入格已完成，但语义生成失败: ${
          err instanceof Error ? err.message : String(err)
        }`
      )
      return -1
    }
  }

  const stageGeoJson = (name: string, text: string) => {
    const fallbackLevel = useAppStore.getState().level
    const suggestion = suggestIngestLevel(text, { fallbackLevel })
    setPending({
      kind: "geojson",
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

  const stageCsv = (name: string, text: string) => {
    // 0.1° 格点约 11km → 建议 L12；可再调
    const suggested = 12
    setPending({
      kind: "csv",
      name,
      text,
      suggested,
      reason: "CSV 标量场（lon/lat/value）· 建议按点距选级",
      level: suggested,
    })
    useAppStore
      .getState()
      .setStatusText(`已读取 ${name} · CSV 标量场 · 请确认后入格`)
  }

  const stageRaster = async (name: string, filePath: string) => {
    const desktop = getDesktopApi()
    if (!desktop?.probeRaster) {
      useAppStore.getState().setStatusText("当前环境不支持栅格入格（需桌面端）")
      return
    }
    useAppStore.getState().setStatusText(`正在探测 ${name}…`)
    try {
      const probe = await desktop.probeRaster(filePath)
      setPending({
        kind: "raster",
        name,
        filePath,
        suggested: probe.suggestedLevel,
        reason: probe.reason,
        level: probe.suggestedLevel,
        estimatedCells: probe.estimatedCells,
        modality: probe.modality,
      })
      useAppStore
        .getState()
        .setStatusText(`已探测 ${name} · ${probe.reason} · 请确认后入格`)
    } catch (err) {
      useAppStore.getState().setStatusText(
        `探测失败: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  const confirmImport = async () => {
    if (!pending) return
    const current = pending
    const wantSemantic = withSemantic
    setPending(null)
    try {
      if (current.kind === "geojson") {
        const { name, text, level } = current
        useAppStore.getState().setStatusText(`正在入格 ${name} @ L${level}…`)
        const source =
          name.replace(/\.(geo)?json$/i, "").replace(/\.shp$/i, "") || "import"
        const featCount = registerFromGeoJsonText(source, text)
        const records = ingestGeoJsonText(text, { level, source, label: name })
        if (records.length === 0) throw new Error("未解析到可入格要素")
        const wh = getWarehouse()
        const prior = (await wh.list({ source })) as GridCellRecord[]
        if (prior.length && wh.delete) await wh.delete(prior)
        await importRecords(records)
        useAppStore.getState().patchLayer(source, { featuresVisible: true })
        applyGisFeaturesNow()
        flyToCodes(records.map((r) => r.gridId))
        const semN = await maybeBuildSemantic(source, wantSemantic)
        useAppStore.getState().setStatusText(
          `已导入 ${records.length} 条格 @ L${level} · 要素 ${featCount} · 已打开要素显示` +
            (semN > 0 ? ` · 语义 ${semN} 格` : wantSemantic && semN === 0 ? " · 语义 0 格" : "")
        )
        return
      }

      if (current.kind === "csv") {
        const { name, text, level } = current
        useAppStore.getState().setStatusText(`正在入格标量场 ${name} @ L${level}…`)
        const source = name.replace(/\.csv$/i, "") || "field"
        const parsed = ingestFieldCsv(text, {
          source,
          level,
          label: name.replace(/\.csv$/i, ""),
        })
        const wh = getWarehouse()
        const prior = (await wh.list({ source })) as GridCellRecord[]
        if (prior.length && wh.delete) await wh.delete(prior)
        await importRecords(parsed.records)
        useAppStore.getState().addFieldSource(source)
        // 同源重导时 fieldSources 引用可能不变，需强制重建色斑
        getMapRuntime()?.rebuildFieldView?.()
        flyToCodes(parsed.records.map((r) => r.gridId))
        const semN = await maybeBuildSemantic(source, wantSemantic)
        useAppStore.getState().setStatusText(
          `已导入标量场 ${parsed.cellCount} 格 @ L${level}（${parsed.pointCount} 点 · 列 ${parsed.valueColumn}${
            parsed.unit ? ` · ${parsed.unit}` : ""
          }）` + (semN > 0 ? ` · 语义 ${semN} 格` : "")
        )
        return
      }

      const desktop = getDesktopApi()
      if (!desktop?.ingestRaster) {
        throw new Error("当前环境不支持栅格入格（需桌面端）")
      }
      const { name, filePath, level } = current
      const source = name.replace(/\.(tiff?|geotiff)$/i, "") || "raster"
      useAppStore.getState().setStatusText(`正在入格栅格 ${name} @ L${level}…`)
      useAppStore.getState().setImportProgress(1)
      const result = await desktop.ingestRaster({
        filePath,
        level,
        source,
        label: name,
      })
      await syncLayersFromWarehouse()
      await refreshDataOverlay()
      // 单波段 DEM/标量：加入场渲染源
      if (result.modality === "dem") {
        useAppStore.getState().addFieldSource(source)
        getMapRuntime()?.rebuildFieldView?.()
      }
      useAppStore.getState().setImportProgress(100)
      window.setTimeout(() => useAppStore.getState().setImportProgress(null), 600)
      {
        const rows = (await getWarehouse().list({
          source,
        })) as GridCellRecord[]
        if (rows.length > 0) flyToCodes(rows.map((r) => r.gridId))
        else if (result.firstGridId) flyToCode(result.firstGridId, 80_000)
      }
      const semN = await maybeBuildSemantic(source, wantSemantic)
      useAppStore.getState().setStatusText(
        `已导入 ${result.modality === "dem" ? "标量场" : result.modality} ${result.count} 格 @ L${result.level}` +
          (semN > 0 ? ` · 语义 ${semN} 格` : "")
      )
    } catch (err) {
      useAppStore.getState().setImportProgress(null)
      useAppStore.getState().setStatusText(
        `导入失败: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  const onPickFile = async (file: File) => {
    const lower = file.name.toLowerCase()
    if (lower.endsWith(".tif") || lower.endsWith(".tiff")) {
      useAppStore
        .getState()
        .setStatusText("浏览器不支持 GeoTIFF 入格，请使用桌面端")
      return
    }
    const text = await file.text()
    if (lower.endsWith(".csv")) {
      stageCsv(file.name, text)
      return
    }
    stageGeoJson(file.name, text)
  }

  const onImportClick = async () => {
    const desktop = getDesktopApi()
    if (desktop?.pickImportFile) {
      const picked = await desktop.pickImportFile()
      if (!picked) return
      if (picked.kind === "raster" && picked.filePath) {
        await stageRaster(picked.name, picked.filePath)
        return
      }
      if (picked.kind === "csv" && picked.text) {
        stageCsv(picked.name, picked.text)
        return
      }
      if (picked.text) {
        if (picked.fromShapefile) {
          useAppStore
            .getState()
            .setStatusText(
              `已转换 Shapefile（${picked.convertVia ?? "unknown"}）· ${picked.name}`
            )
        }
        if (picked.name.toLowerCase().endsWith(".csv")) {
          stageCsv(picked.name, picked.text)
          return
        }
        stageGeoJson(picked.name, picked.text)
      }
      return
    }
    fileRef.current?.click()
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <input
        ref={fileRef}
        type="file"
        accept=".json,.geojson,.csv,application/geo+json,application/json,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void onPickFile(f)
          e.target.value = ""
        }}
      />
      <div className="shrink-0 space-y-3">
      <div className="flex items-center justify-center">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 px-2.5 text-xs font-normal text-muted-foreground"
          title={
            isDesktopApp()
              ? "导入 GeoJSON / SHP / GeoTIFF / CSV"
              : "导入 GeoJSON / CSV"
          }
          onClick={() => void onImportClick()}
        >
          <Upload className="h-3.5 w-3.5" />
          导入
        </Button>
      </div>
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
              {pending.kind === "raster" && pending.estimatedCells != null
                ? ` · 当前级约 ${pending.estimatedCells} 格`
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
                {pending.kind === "raster"
                  ? "（栅格仅桌面端，单次最多约 4000 格）"
                  : pending.kind === "csv"
                    ? "（CSV：同格多点取均值）"
                    : ""}
              </p>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/30 px-2.5 py-2">
              <div className="min-w-0">
                <Label htmlFor="with-semantic">同时生成语义向量</Label>
                <p className="text-[10px] text-muted-foreground">
                  入格后写入 semantic: 图层，供语义检索使用
                </p>
              </div>
              <Switch
                id="with-semantic"
                checked={withSemantic}
                onCheckedChange={setWithSemantic}
              />
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
      </div>
      <OverlayScrollArea className="min-h-0 flex-1" contentClassName="pb-2">
        {dataLayers.length === 0 ? (
          <p className="text-xs text-muted-foreground">暂无图层</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {dataLayers.map((layer) => {
            const isRaster =
              layer.type === "dem" || layer.type === "raster"
            const hasSemantic = semanticReady.has(
              semanticSourceName(layer.source)
            )
            return (
              <li key={layer.id} className="space-y-2 py-3 first:pt-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium leading-tight">
                      {layer.name}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {layer.count.toLocaleString()} 格 · L{layer.levelMin}
                      {layer.levelMax !== layer.levelMin
                        ? `-${layer.levelMax}`
                        : ""}
                      <span className="mx-1.5 text-border">·</span>
                      {layer.type === "field" ? "标量场" : layer.type}
                    </p>
                  </div>
                  <span
                    className={
                      hasSemantic
                        ? "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-emerald-500/40"
                        : "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-border/70"
                    }
                    title={
                      hasSemantic
                        ? "已生成语义向量，可用于工具栏语义检索"
                        : "尚未语义处理；可勾选导入时生成，或重新导入并开启"
                    }
                  >
                    {hasSemantic ? "已语义" : "未语义"}
                  </span>
                </div>
                <div className="flex gap-0.5">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    title={layer.visible ? "隐藏" : "显示"}
                    onClick={() => {
                      void (async () => {
                        const nextVisible = !layer.visible
                        useAppStore.getState().patchLayer(layer.id, {
                          visible: nextVisible,
                        })
                        // 场数据层：切换 fieldSources
                        if (layer.type === "field") {
                          const s = useAppStore.getState()
                          if (nextVisible) {
                            s.addFieldSource(layer.source)
                          } else {
                            s.removeFieldSource(layer.source)
                          }
                          return
                        }
                        // 常规数据层：刷新 dataOverlay
                        const codes = await refreshDataOverlay()
                        const rows = (await getWarehouse().list({
                          source: layer.source,
                        })) as GridCellRecord[]
                        if (nextVisible && rows.length > 0) {
                          flyToCodes(rows.map((r) => r.gridId))
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
                  {layer.type === "field" && (
                    <FieldStylePopover
                      source={layer.source}
                      label={layer.name}
                    />
                  )}
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    title={
                      isRaster
                        ? "栅格无矢量要素显示"
                        : layer.featuresVisible
                          ? "隐藏 GIS 要素"
                          : "显示 GIS 要素"
                    }
                    disabled={isRaster}
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
                    title="定位到图层范围"
                    onClick={async () => {
                      const wh = getWarehouse()
                      const rows = (await wh.list({
                        source: layer.source,
                      })) as GridCellRecord[]
                      if (!layer.visible) {
                        useAppStore.getState().patchLayer(layer.id, {
                          visible: true,
                        })
                        if (layer.type === "field") {
                          useAppStore.getState().addFieldSource(layer.source)
                          getMapRuntime()?.rebuildFieldView?.()
                        } else {
                          await refreshDataOverlay()
                        }
                      }
                      if (rows.length > 0) {
                        flyToCodes(rows.map((r) => r.gridId))
                      }
                    }}
                  >
                    <LocateFixed className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    title="删除该图层"
                    onClick={() => {
                      void (async () => {
                        const ok = await confirmAction({
                          title: "删除图层",
                          message: `确定删除图层「${layer.name}」？`,
                          detail:
                            "将移除该 source 的全部入格记录，此操作不可撤销。",
                        })
                        if (!ok) return
                        await deleteSourceLayer(layer.source)
                      })()
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            )
          })}
          </ul>
        )}
      </OverlayScrollArea>
    </div>
  )
}

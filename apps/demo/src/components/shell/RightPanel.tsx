import { useEffect, useState, type ReactNode } from "react"
import { geosot } from "@dggs/grid-core"
import { Copy, LocateFixed, Map, PanelRightClose } from "lucide-react"
import {
  fragmentPreviewKey,
  useAppStore,
} from "@/state/store"
import { Button } from "@/components/ui/button"
import { getWarehouse } from "@/data/warehouseBoot"
import { flyToCode, getMapRuntime } from "@/map/useCesiumMap"
import type { GridCellRecord } from "@dggs/grid-ingest"

export function RightPanel() {
  const open = useAppStore((s) => s.rightPanelOpen)
  const gridSet = useAppStore((s) => s.gridSet)
  const analysis = useAppStore((s) => s.analysisResult)
  const [records, setRecords] = useState<GridCellRecord[]>([])
  const previews = useAppStore((s) => s.cellFragmentPreviews)
  const previewKeys = new Set(previews.map(fragmentPreviewKey))

  useEffect(() => {
    if (!gridSet || gridSet.from !== "pick" || gridSet.codes.length !== 1) {
      setRecords([])
      return
    }
    const code = gridSet.codes[0]!
    void getWarehouse()
      .getByCell(code)
      .then((rows) => setRecords(rows as GridCellRecord[]))
  }, [gridSet])

  if (!open) return null

  if (analysis?.kind === "intersect") {
    return (
      <PanelShell title="碰撞检测" sub={`发现 ${analysis.conflicts.length} 处冲突`}>
        {analysis.conflicts.length === 0 ? (
          <p className="text-xs text-muted-foreground">未发现与障碍层相交的网格。</p>
        ) : (
          <ul className="max-h-[55vh] space-y-2 overflow-y-auto">
            {analysis.conflicts.map((c) => (
              <li
                key={c.gridId}
                className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2 py-1.5 text-xs"
              >
                <div className="min-w-0">
                  <p className="truncate font-mono">{c.gridId}</p>
                  {c.label && <p className="text-muted-foreground">{c.label}</p>}
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => flyToCode(c.gridId)}
                >
                  <LocateFixed className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </PanelShell>
    )
  }

  if (analysis?.kind === "aggregate") {
    return (
      <PanelShell title="区域聚合" sub={`${analysis.cellCount} 格`}>
        <div className="grid grid-cols-2 gap-2">
          {analysis.metrics.map((m) => (
            <div
              key={m.key}
              className="rounded-md border border-border/60 bg-muted/30 px-2 py-2"
            >
              <p className="text-[10px] text-muted-foreground">{m.key}</p>
              <p className="font-mono text-sm font-semibold">{m.value}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 space-y-1">
          {analysis.buckets.map((b) => (
            <div key={b.name} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{b.name}</span>
              <span className="font-mono">{b.count}</span>
            </div>
          ))}
        </div>
      </PanelShell>
    )
  }

  if (analysis?.kind === "buffer") {
    return (
      <PanelShell title="网格缓冲" sub={`半径 ${analysis.radiusM} m`}>
        <dl className="space-y-2 text-xs">
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">中心网格</dt>
            <dd className="max-w-[60%] break-all text-right font-mono">
              {analysis.centerCode}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">覆盖格数</dt>
            <dd className="font-mono">{analysis.codes.length}</dd>
          </div>
        </dl>
      </PanelShell>
    )
  }

  if (!gridSet || gridSet.codes.length === 0) {
    return (
      <PanelShell title="详情" sub="点选或绘制后显示网格信息">
        <p className="text-base font-medium text-foreground/90">同码融合 · 视窗落格</p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          使用左侧「查询」点选 / 画线 / 画面；分析工具在「分析」Tab。
        </p>
      </PanelShell>
    )
  }

  const code = gridSet.codes[0]!
  const bbox = geosot.bboxFromCode(code)
  const previewable = records.filter((r) => r.fragment)
  const cellPreviewKeys = new Set(previewable.map(fragmentPreviewKey))
  const previewOnCount = previewable.filter((r) =>
    previewKeys.has(fragmentPreviewKey(r))
  ).length
  const allPreviewsOn =
    previewable.length > 0 && previewOnCount === previewable.length
  const somePreviewsOn = previewOnCount > 0 && !allPreviewsOn

  const applyCellFragmentPreviews = () => {
    const rt = getMapRuntime()
    if (rt?.applyCellFragments) {
      rt.applyCellFragments()
      return true
    }
    useAppStore.getState().setStatusText("地图未就绪，请刷新桌面端后再上图")
    return false
  }

  const toggleAllPreviews = () => {
    const on = !allPreviewsOn
    useAppStore
      .getState()
      .setCellFragmentPreviewsForKeys(cellPreviewKeys, on ? previewable : [])
    if (!applyCellFragmentPreviews()) return
    useAppStore
      .getState()
      .setStatusText(
        on
          ? `已全部上图 ${previewable.length} 条（格内片段）`
          : "已取消本格全部上图"
      )
  }

  return (
    <PanelShell
      title={gridSet.from === "pick" ? "网格详情" : "查询结果"}
      sub={`${gridSet.codes.length} 格 · ${gridSet.from}`}
    >
      {gridSet.from === "pick" ? (
        <>
          <div className="mb-1 flex items-start justify-between gap-2">
            <p className="break-all font-mono text-base font-semibold leading-snug">
              {code}
            </p>
            <div className="flex shrink-0">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                title="定位"
                onClick={() => flyToCode(code)}
              >
                <LocateFixed className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                title="复制"
                onClick={() => void navigator.clipboard.writeText(code)}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">Level {gridSet.level}</p>
          <dl className="mb-3 space-y-2 text-xs">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">中心位置</dt>
              <dd className="font-mono text-right">
                {((bbox.west + bbox.east) / 2).toFixed(5)},{" "}
                {((bbox.south + bbox.north) / 2).toFixed(5)}
              </dd>
            </div>
          </dl>
          <div className="flex max-h-[40vh] flex-col gap-1.5 overflow-y-auto">
            {records.length === 0 ? (
              <span className="text-xs text-muted-foreground">暂无入格记录</span>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] text-muted-foreground">
                    本格入格 {records.length} 条 · 上图仅画入库剪裁片段
                    {somePreviewsOn
                      ? ` · 已上图 ${previewOnCount}/${previewable.length}`
                      : ""}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className={
                      allPreviewsOn
                        ? "h-7 shrink-0 gap-1 px-2 text-[11px] bg-amber-500/20 text-amber-300"
                        : somePreviewsOn
                          ? "h-7 shrink-0 gap-1 px-2 text-[11px] text-amber-400/80"
                          : "h-7 shrink-0 gap-1 px-2 text-[11px]"
                    }
                    disabled={previewable.length === 0}
                    title={
                      previewable.length === 0
                        ? "无可上图片段"
                        : allPreviewsOn
                          ? "取消本格全部上图"
                          : "本格全部上图"
                    }
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      toggleAllPreviews()
                    }}
                  >
                    <Map className="h-3.5 w-3.5" />
                    {allPreviewsOn ? "取消全部" : "全部上图"}
                  </Button>
                </div>
                {records.map((r, i) => {
                  const key = fragmentPreviewKey(r)
                  const on = previewKeys.has(key)
                  const sameCell = r.gridId === code
                  const canPreview = Boolean(r.fragment)
                  return (
                    <div
                      key={`${key}-${i}`}
                      className="flex items-start gap-1 rounded-md border border-border/70 bg-muted/40 px-2 py-1.5 text-[11px] leading-snug"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-foreground/90">
                          {r.label || r.source}
                          {r.featureId ? (
                            <span className="ml-1 font-normal text-muted-foreground">
                              #{r.featureId}
                            </span>
                          ) : null}
                        </p>
                        <p className="truncate text-muted-foreground">
                          {r.source}
                          {r.ref?.kind ? ` · ${r.ref.kind}` : ""}
                          {Object.entries(r.attrs)
                            .slice(0, 2)
                            .map(([k, v]) => ` · ${k} ${v}`)
                            .join("")}
                          {!sameCell ? " · 卷级" : ""}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className={
                          on
                            ? "h-7 w-7 shrink-0 bg-amber-500/20 text-amber-300"
                            : canPreview
                              ? "h-7 w-7 shrink-0"
                              : "h-7 w-7 shrink-0 opacity-40"
                        }
                        aria-disabled={!canPreview}
                        title={
                          !r.fragment
                            ? "无格内片段（请按新契约重新导入）"
                            : on
                              ? "取消上图"
                              : sameCell
                                ? "上图（仅格内片段）"
                                : "上图（卷级：画该条入库剪裁片段）"
                        }
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          if (!canPreview) {
                            useAppStore
                              .getState()
                              .setStatusText("无法上图：无格内片段，请重新导入")
                            return
                          }
                          useAppStore.getState().toggleCellFragmentPreview(r)
                          if (!applyCellFragmentPreviews()) return
                          const nowOn = useAppStore
                            .getState()
                            .cellFragmentPreviews.some(
                              (x) => fragmentPreviewKey(x) === key
                            )
                          useAppStore
                            .getState()
                            .setStatusText(
                              nowOn
                                ? `已上图 ${r.featureId ?? r.label ?? r.source}（格内片段）`
                                : `已取消上图 ${r.featureId ?? r.label ?? r.source}`
                            )
                        }}
                      >
                        <Map
                          className={
                            on ? "h-3.5 w-3.5 text-amber-400" : "h-3.5 w-3.5"
                          }
                        />
                      </Button>
                    </div>
                  )
                })}
              </>
            )}
          </div>
        </>
      ) : (
        <ul className="max-h-[55vh] space-y-1 overflow-y-auto text-[11px] font-mono text-muted-foreground">
          {gridSet.codes.slice(0, 80).map((c) => (
            <li key={c} className="flex items-center justify-between gap-2">
              <span className="truncate">{c}</span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => flyToCode(c, 25_000)}
              >
                <LocateFixed className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
          {gridSet.codes.length > 80 && (
            <li>… 另有 {gridSet.codes.length - 80} 格</li>
          )}
        </ul>
      )}
    </PanelShell>
  )
}

function PanelShell({
  title,
  sub,
  children,
}: {
  title: string
  sub: string
  children: ReactNode
}) {
  return (
    <aside className="glass-panel pointer-events-auto absolute bottom-9 right-0 top-0 z-20 flex w-[340px] flex-col overflow-hidden rounded-none border-y-0 border-r-0">
      <header className="flex shrink-0 items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground">{sub}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0"
          title="隐藏右侧面板"
          onClick={() => useAppStore.getState().setRightPanelOpen(false)}
        >
          <PanelRightClose className="h-4 w-4" />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
    </aside>
  )
}

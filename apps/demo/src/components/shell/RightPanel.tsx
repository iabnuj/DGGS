import { useEffect, useMemo, useState, type ReactNode } from "react"
import { fangli, geosot } from "@dggs/grid-core"
import { Copy, LocateFixed, Map, PanelRightClose } from "lucide-react"
import {
  coarsenSelection,
  refineSelection,
} from "@/selection/scale"
import {
  fragmentPreviewKey,
  useAppStore,
} from "@/state/store"
import { Button } from "@/components/ui/button"
import { getWarehouse } from "@/data/warehouseBoot"
import { flyToCode, getMapRuntime } from "@/map/useCesiumMap"
import type { GridCellRecord } from "@dggs/grid-ingest"

const MULTI_CELL_LIMIT = 120

type CellGroup = {
  code: string
  records: GridCellRecord[]
}

function applyCellFragmentPreviews(): boolean {
  const rt = getMapRuntime()
  if (rt?.applyCellFragments) {
    rt.applyCellFragments()
    return true
  }
  useAppStore.getState().setStatusText("地图未就绪，请刷新桌面端后再上图")
  return false
}

function RecordRow({
  r,
  cellCode,
  previewKeys,
}: {
  r: GridCellRecord
  cellCode: string
  previewKeys: Set<string>
}) {
  const key = fragmentPreviewKey(r)
  const on = previewKeys.has(key)
  const sameCell = r.gridId === cellCode
  const canPreview = Boolean(r.fragment)

  return (
    <div className="flex items-start gap-1 rounded-md border border-border/70 bg-muted/40 px-2 py-1.5 text-[11px] leading-snug">
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
          {r.attrs.modality === "dem" &&
          typeof r.attrs.zMin === "number" &&
          typeof r.attrs.zMax === "number"
            ? ` · z ${r.attrs.zMin}~${r.attrs.zMax}m`
            : ""}
          {r.fragment?.kind === "raster" ? " · chip" : ""}
          {Object.entries(r.attrs)
            .filter(
              ([k]) =>
                !["modality", "bands", "zMin", "zMax", "zMean", "nodata"].includes(
                  k
                )
            )
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
            .cellFragmentPreviews.some((x) => fragmentPreviewKey(x) === key)
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
          className={on ? "h-3.5 w-3.5 text-amber-400" : "h-3.5 w-3.5"}
        />
      </Button>
    </div>
  )
}

/** 编码尺度工具：改当前选中集合，不是分析结果。 */
function SelectionScaleToolbar() {
  const gridSet = useAppStore((s) => s.gridSet)
  const hasSel = !!gridSet && gridSet.codes.length > 0
  const level = gridSet?.level ?? 0
  const canCoarsen = hasSel && level > 0
  const canRefine = hasSel && level < 32

  const apply = (mode: "coarsen" | "refine") => {
    const s = useAppStore.getState()
    const gs = s.gridSet
    if (!gs?.codes.length) return
    const result =
      mode === "coarsen"
        ? coarsenSelection(gs.codes)
        : refineSelection(gs.codes)
    if (!result) {
      s.setStatusText(
        mode === "coarsen" ? "无法再卷粗（已到最粗）" : "无法再细化"
      )
      return
    }
    s.setGridSet({
      codes: result.codes,
      level: result.level,
      from: gs.from,
    })
    getMapRuntime()?.applyHighlights()
    s.setStatusText(
      mode === "coarsen"
        ? `已卷粗到 L${result.level} · ${result.codes.length} 格`
        : `已细化到 L${result.level} · ${result.codes.length} 格`
    )
  }

  return (
    <div className="space-y-1.5 rounded-md border border-border/60 bg-muted/30 px-2 py-2">
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        尺度（改选中编码，非整图缩放）
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-7 text-[11px]"
          disabled={!canCoarsen}
          title="选中格升到父级（L−1）"
          onClick={() => apply("coarsen")}
        >
          卷粗一级
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-7 text-[11px]"
          disabled={!canRefine}
          title="选中格拆到子级（L+1）"
          onClick={() => apply("refine")}
        >
          细化一级
        </Button>
      </div>
    </div>
  )
}

function PreviewToolbar({
  records,
  previewKeys,
}: {
  records: GridCellRecord[]
  previewKeys: Set<string>
}) {
  const previewable = records.filter((r) => r.fragment)
  const cellPreviewKeys = new Set(previewable.map(fragmentPreviewKey))
  const previewOnCount = previewable.filter((r) =>
    previewKeys.has(fragmentPreviewKey(r))
  ).length
  const allPreviewsOn =
    previewable.length > 0 && previewOnCount === previewable.length
  const somePreviewsOn = previewOnCount > 0 && !allPreviewsOn

  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-[10px] text-muted-foreground">
        入格 {records.length} 条 · 上图仅画入库剪裁片段
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
              ? "取消全部上图"
              : "全部上图"
        }
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          const on = !allPreviewsOn
          useAppStore
            .getState()
            .setCellFragmentPreviewsForKeys(
              cellPreviewKeys,
              on ? previewable : []
            )
          if (!applyCellFragmentPreviews()) return
          useAppStore
            .getState()
            .setStatusText(
              on
                ? `已全部上图 ${previewable.length} 条（格内片段）`
                : "已取消全部上图"
            )
        }}
      >
        <Map className="h-3.5 w-3.5" />
        {allPreviewsOn ? "取消全部" : "全部上图"}
      </Button>
    </div>
  )
}

export function RightPanel() {
  const open = useAppStore((s) => s.rightPanelOpen)
  const gridSet = useAppStore((s) => s.gridSet)
  const [groups, setGroups] = useState<CellGroup[]>([])
  const previews = useAppStore((s) => s.cellFragmentPreviews)
  const previewKeys = useMemo(
    () => new Set(previews.map(fragmentPreviewKey)),
    [previews]
  )

  useEffect(() => {
    if (!gridSet || gridSet.codes.length === 0) {
      setGroups([])
      return
    }
    const codes = gridSet.codes.slice(0, MULTI_CELL_LIMIT)
    let cancelled = false
    void (async () => {
      const wh = getWarehouse()
      const rows = await Promise.all(
        codes.map(async (code) => ({
          code,
          records: (await wh.getByCell(code)) as GridCellRecord[],
        }))
      )
      if (!cancelled) setGroups(rows)
    })()
    return () => {
      cancelled = true
    }
  }, [gridSet])

  if (!open) return null

  if (!gridSet || gridSet.codes.length === 0) {
    return (
      <PanelShell title="详情" sub="用地图工具选格后显示">
        <p className="text-sm font-medium text-foreground/90">格网选择</p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          使用地图顶部工具条选格；入格内容与尺度升降在此查看。
        </p>
      </PanelShell>
    )
  }

  const allRecords = groups.flatMap((g) => g.records)
  const isSinglePick =
    gridSet.from === "pick" && gridSet.codes.length === 1
  const code = gridSet.codes[0]!
  const bbox = geosot.bboxFromCode(code)
  const fromLabel =
    gridSet.from === "pick"
      ? "点选"
      : gridSet.from === "line"
        ? "画线"
        : "画面"

  if (isSinglePick) {
    const records = groups[0]?.records ?? []
    const centerLon = (bbox.west + bbox.east) / 2
    const centerLat = (bbox.south + bbox.north) / 2
    const fl = fangli.fangliFromLonLat(centerLon, centerLat, { zoneWidth: 6 })
    const flId = fangli.formatFangliId(fl)
    return (
      <PanelShell title="网格详情" sub={`1 格 · ${fromLabel}`}>
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
              title="复制 GeoSOT 码"
              onClick={() => void navigator.clipboard.writeText(code)}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">Level {gridSet.level}</p>
        <div className="mb-3">
          <SelectionScaleToolbar />
        </div>
        <dl className="mb-3 space-y-2 text-xs">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">经纬度</dt>
            <dd className="font-mono text-right">
              {centerLon.toFixed(5)}, {centerLat.toFixed(5)}
            </dd>
          </div>
          <div className="flex items-start justify-between gap-3">
            <dt className="shrink-0 text-muted-foreground">方里网</dt>
            <dd className="min-w-0 text-right">
              <button
                type="button"
                className="font-mono text-foreground/90 hover:underline"
                title="复制方里编号"
                onClick={() => void navigator.clipboard.writeText(flId)}
              >
                {flId}
              </button>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                6°带 {fl.zone} · 北 {fl.northingKm} km · 东 {fl.eastingKm} km
              </p>
            </dd>
          </div>
        </dl>
        <div className="flex flex-col gap-1.5">
          {records.length === 0 ? (
            <span className="text-xs text-muted-foreground">暂无入格记录</span>
          ) : (
            <>
              <PreviewToolbar records={records} previewKeys={previewKeys} />
              {records.map((r, i) => (
                <RecordRow
                  key={`${fragmentPreviewKey(r)}-${i}`}
                  r={r}
                  cellCode={code}
                  previewKeys={previewKeys}
                />
              ))}
            </>
          )}
        </div>
      </PanelShell>
    )
  }

  const shown = groups.length
  const totalCodes = gridSet.codes.length
  const truncated = totalCodes > shown

  return (
    <PanelShell
      title="选中格网"
      sub={`${totalCodes} 格 · ${fromLabel} · 入格 ${allRecords.length} 条`}
    >
      <div className="mb-2">
        <SelectionScaleToolbar />
      </div>
      <div className="mb-2">
        <PreviewToolbar records={allRecords} previewKeys={previewKeys} />
      </div>
      {truncated && (
        <p className="mb-2 text-[10px] text-muted-foreground">
          仅加载前 {MULTI_CELL_LIMIT} 格的入格内容
        </p>
      )}
      <div className="flex flex-col gap-3">
        {groups.map((g) => (
          <section key={g.code} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate font-mono text-[11px] font-semibold text-foreground/90">
                {g.code}
              </p>
              <div className="flex shrink-0 items-center gap-0.5">
                <span className="mr-1 text-[10px] text-muted-foreground">
                  {g.records.length} 条
                </span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  title="定位"
                  onClick={() => flyToCode(g.code, 25_000)}
                >
                  <LocateFixed className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            {g.records.length === 0 ? (
              <p className="text-[10px] text-muted-foreground">暂无入格记录</p>
            ) : (
              g.records.map((r, i) => (
                <RecordRow
                  key={`${fragmentPreviewKey(r)}-${i}`}
                  r={r}
                  cellCode={g.code}
                  previewKeys={previewKeys}
                />
              ))
            )}
          </section>
        ))}
      </div>
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

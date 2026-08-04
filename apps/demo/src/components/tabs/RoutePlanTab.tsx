import { useEffect, useState } from "react"
import {
  Crosshair,
  GitCompare,
  LocateFixed,
  PackageOpen,
  Route,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import {
  DEFAULT_CORRIDOR,
  DEFAULT_TOGGLES,
  ELEV_SOURCES,
  EM_SOURCES,
  RADAR_SOURCES,
  WIND_SOURCES,
  fieldSourceAvailable,
  noflySourceAvailable,
  runAssaultCorridor,
  type ConstraintToggles,
  type CorridorConstraints,
} from "@/analysis/assaultCorridor"
import { listDrawnFieldSources } from "@/data/drawnData"
import {
  getCachedAssaultManifest,
  loadAssaultDemoPackage,
} from "@/data/loadAssaultDemo"
import { flyToCode, getMapRuntime } from "@/map/useCesiumMap"
import { useAppStore } from "@/state/store"
import { OverlayScrollArea } from "@/components/ui/overlay-scroll-area"

const ROUTE_LABELS = new Set([
  "禁行区",
  "航线通路",
  "空中路线",
  "突击通道",
  "对比通道",
])

function shortCode(code: string | null): string {
  if (!code) return "未设置"
  if (code.length <= 18) return code
  return `…${code.slice(-14)}`
}

function stripRouteOverlays(
  results: { label: string; codes: string[]; color: string }[]
) {
  return results.filter((r) => !ROUTE_LABELS.has(r.label))
}

export function RoutePlanTab() {
  const start = useAppStore((s) => s.routeStart)
  const goal = useAppStore((s) => s.routeGoal)
  const pickMode = useAppStore((s) => s.routePickMode)
  const gridSet = useAppStore((s) => s.gridSet)

  const [constraints, setConstraints] =
    useState<CorridorConstraints>(DEFAULT_CORRIDOR)
  const [enabled, setEnabled] = useState<ConstraintToggles>(DEFAULT_TOGGLES)
  const [diagonal, setDiagonal] = useState(true)
  const [busy, setBusy] = useState(false)
  const [lastReason, setLastReason] = useState<string | null>(null)
  const [demoLoaded, setDemoLoaded] = useState(
    () => !!getCachedAssaultManifest()
  )
  const [avail, setAvail] = useState({
    elevation: false,
    wind: false,
    em: false,
    radar: false,
    nofly: false,
  })

  const layers = useAppStore((s) => s.layers)
  useEffect(() => {
    void (async () => {
      const [drawnElev, drawnWind, drawnEm, drawnRadar] = await Promise.all([
        listDrawnFieldSources("elevation"),
        listDrawnFieldSources("wind"),
        listDrawnFieldSources("em"),
        listDrawnFieldSources("radar"),
      ])
      const [elevation, wind, em, radar, nofly] = await Promise.all([
        fieldSourceAvailable([...ELEV_SOURCES, ...drawnElev]),
        fieldSourceAvailable([...WIND_SOURCES, ...drawnWind]),
        fieldSourceAvailable([...EM_SOURCES, ...drawnEm]),
        fieldSourceAvailable([...RADAR_SOURCES, ...drawnRadar]),
        noflySourceAvailable(),
      ])
      setAvail({ elevation, wind, em, radar, nofly })
    })()
  }, [layers])

  const beginPick = (which: "start" | "goal") => {
    useAppStore.getState().setToolMode("pick")
    useAppStore.getState().setRoutePickMode(which)
    useAppStore
      .getState()
      .setStatusText(
        which === "start"
          ? "请在地图上点选出发网格"
          : "请在地图上点选突击目标网格"
      )
  }

  const fromSelection = () => {
    const gs = useAppStore.getState().gridSet
    if (!gs || gs.codes.length < 2) {
      useAppStore
        .getState()
        .setStatusText("请先选中至少 2 个网格（首尾作为起终点）")
      return
    }
    useAppStore.getState().setRouteStart(gs.codes[0]!)
    useAppStore.getState().setRouteGoal(gs.codes[gs.codes.length - 1]!)
    useAppStore.getState().setRoutePickMode(null)
    useAppStore
      .getState()
      .setStatusText(
        `已用选中首尾格：出发 / 目标（共 ${gs.codes.length} 格）`
      )
  }

  const clearRouteOverlays = () => {
    const kept = stripRouteOverlays(useAppStore.getState().analysisResults)
    useAppStore.getState().setAnalysisResults(kept)
    getMapRuntime()?.applyAnalysisOverlays()
  }

  const applyEnabled = (toggles: ConstraintToggles): ConstraintToggles => ({
    elevation: toggles.elevation && avail.elevation,
    wind: toggles.wind && avail.wind,
    em: toggles.em && avail.em,
    radar: toggles.radar && avail.radar,
    nofly: toggles.nofly && avail.nofly,
  })

  const runPlan = (opts?: {
    toggles?: ConstraintToggles
    pathLabel?: string
    pathColor?: string
    keepPreviousPath?: boolean
  }) => {
    void (async () => {
      const s = useAppStore.getState().routeStart
      const g = useAppStore.getState().routeGoal
      if (!s || !g) {
        useAppStore.getState().setStatusText("请先设置出发点与突击目标")
        return
      }
      setBusy(true)
      useAppStore.getState().setStatusText("突击通道计算中…")
      try {
        const toggles = applyEnabled(opts?.toggles ?? enabled)
        const result = await runAssaultCorridor(s, g, {
          constraints,
          enabled: toggles,
          diagonal,
        })
        let next = useAppStore.getState().analysisResults
        if (opts?.keepPreviousPath) {
          next = next.filter((r) => r.label !== "对比通道" && r.label !== "禁行区")
        } else {
          next = stripRouteOverlays(next)
        }
        if (result.blocked.length > 0) {
          next.push({
            codes: result.blocked,
            label: "禁行区",
            color: "#64748b",
          })
        }
        if (result.path.length > 0) {
          next.push({
            codes: result.path,
            label: opts?.pathLabel ?? "突击通道",
            color: opts?.pathColor ?? "#f97316",
          })
        }
        useAppStore.getState().setAnalysisResults(next)
        getMapRuntime()?.applyAnalysisOverlays()
        setLastReason(result.reason)
        useAppStore.getState().setStatusText(result.reason)
        if (result.path[0]) flyToCode(result.path[0], 60_000)
      } catch (err) {
        useAppStore.getState().setStatusText(
          `计算失败: ${err instanceof Error ? err.message : String(err)}`
        )
      } finally {
        setBusy(false)
      }
    })()
  }

  const loadDemo = () => {
    void (async () => {
      setBusy(true)
      try {
        const { manifest } = await loadAssaultDemoPackage()
        setConstraints({ ...manifest.constraints })
        setEnabled({ ...manifest.toggles })
        setLastReason(null)
        setDemoLoaded(true)
        clearRouteOverlays()
        const [drawnElev, drawnWind, drawnEm, drawnRadar] = await Promise.all([
          listDrawnFieldSources("elevation"),
          listDrawnFieldSources("wind"),
          listDrawnFieldSources("em"),
          listDrawnFieldSources("radar"),
        ])
        const [elevation, wind, em, radar, nofly] = await Promise.all([
          fieldSourceAvailable([...ELEV_SOURCES, ...drawnElev]),
          fieldSourceAvailable([...WIND_SOURCES, ...drawnWind]),
          fieldSourceAvailable([...EM_SOURCES, ...drawnEm]),
          fieldSourceAvailable([...RADAR_SOURCES, ...drawnRadar]),
          noflySourceAvailable(),
        ])
        setAvail({ elevation, wind, em, radar, nofly })
      } catch (err) {
        useAppStore.getState().setStatusText(
          `加载演训态势失败: ${err instanceof Error ? err.message : String(err)}`
        )
      } finally {
        setBusy(false)
      }
    })()
  }

  /** 保留全约束通道，关闭地形后再算一条对比通道 */
  const compareWithoutElevation = () => {
    void (async () => {
      const s = useAppStore.getState().routeStart
      const g = useAppStore.getState().routeGoal
      if (!s || !g) {
        useAppStore.getState().setStatusText("请先设置出发点与突击目标")
        return
      }
      setBusy(true)
      try {
        // 先算全约束突击通道
        const full = await runAssaultCorridor(s, g, {
          constraints,
          enabled: applyEnabled(enabled),
          diagonal,
        })
        // 再算关闭地形
        const alt = await runAssaultCorridor(s, g, {
          constraints,
          enabled: applyEnabled({ ...enabled, elevation: false }),
          diagonal,
        })
        const next = stripRouteOverlays(useAppStore.getState().analysisResults)
        if (full.blocked.length > 0) {
          next.push({
            codes: full.blocked,
            label: "禁行区",
            color: "#64748b",
          })
        }
        if (full.path.length > 0) {
          next.push({
            codes: full.path,
            label: "突击通道",
            color: "#f97316",
          })
        }
        if (alt.path.length > 0) {
          next.push({
            codes: alt.path,
            label: "对比通道",
            color: "#22d3ee",
          })
        }
        useAppStore.getState().setAnalysisResults(next)
        getMapRuntime()?.applyAnalysisOverlays()
        const same =
          full.path.length > 0 &&
          alt.path.length > 0 &&
          full.path.join("|") === alt.path.join("|")
        const reason = same
          ? `对比完成：关闭地形后通路未变（全约束 ${full.path.length} 格）`
          : `对比完成：全约束 ${full.path.length} 格（橙）· 关地形 ${alt.path.length} 格（青）`
        setLastReason(reason)
        useAppStore.getState().setStatusText(reason)
        if (full.path[0]) flyToCode(full.path[0], 60_000)
      } catch (err) {
        useAppStore.getState().setStatusText(
          `对比失败: ${err instanceof Error ? err.message : String(err)}`
        )
      } finally {
        setBusy(false)
      }
    })()
  }

  const constraintRow = (
    key: keyof ConstraintToggles,
    title: string,
    unit: string,
    value: number,
    min: number,
    max: number,
    step: number,
    available: boolean,
    onValue: (n: number) => void
  ) => (
    <div
      key={key}
      className={`space-y-1.5 rounded border border-border/50 px-2 py-1.5 ${
        !available ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <Label className="text-[11px]">
          {title}
          {!available && (
            <span className="ml-1 text-[9px] text-muted-foreground">
              未导入
            </span>
          )}
        </Label>
        <Switch
          checked={enabled[key] && available}
          disabled={!available}
          onCheckedChange={(v) =>
            setEnabled((e) => ({ ...e, [key]: v }))
          }
        />
      </div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>阈值</span>
        <span className="font-mono">
          {value}
          {unit}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={!available || !enabled[key]}
        onValueChange={([v]) => {
          if (v != null) onValue(v)
        }}
      />
    </div>
  )

  const demoHint = demoLoaded

  return (
    <OverlayScrollArea className="h-full" contentClassName="space-y-3 pb-2">
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        综合地形 / 气象 / 电磁 / 雷达约束，在剖分格上生成空中突击通道（A*）。
      </p>

      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="h-8 w-full text-[11px]"
        disabled={busy}
        onClick={loadDemo}
      >
        <PackageOpen className="mr-1.5 h-3.5 w-3.5" />
        {busy ? "加载中…" : "加载演训态势（一键数据包）"}
      </Button>
      {demoHint && (
        <p className="text-[9px] text-muted-foreground">
          已载入合静演训包 · 起终点与威胁场已就绪
        </p>
      )}

      <div className="space-y-1.5">
        <Label className="text-[11px]">出发 / 突击目标</Label>
        <div className="rounded border border-border/60 bg-muted/20 px-2 py-1.5 font-mono text-[10px]">
          <div className="flex items-center justify-between gap-1">
            <span className="text-muted-foreground">出发</span>
            <span className="truncate" title={start ?? undefined}>
              {shortCode(start)}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-1">
            <span className="text-muted-foreground">目标</span>
            <span className="truncate" title={goal ?? undefined}>
              {shortCode(goal)}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={pickMode === "start" ? "default" : "secondary"}
            className="h-7 text-[11px]"
            onClick={() => beginPick("start")}
          >
            <Crosshair className="mr-1 h-3 w-3" />
            拾取出发
          </Button>
          <Button
            type="button"
            size="sm"
            variant={pickMode === "goal" ? "default" : "secondary"}
            className="h-7 text-[11px]"
            onClick={() => beginPick("goal")}
          >
            <Crosshair className="mr-1 h-3 w-3" />
            拾取目标
          </Button>
        </div>
        <div className="flex gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 flex-1 text-[11px]"
            disabled={!gridSet || gridSet.codes.length < 2}
            onClick={fromSelection}
          >
            用选中首尾格
          </Button>
          {start && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              title="定位出发"
              onClick={() => flyToCode(start, 50_000)}
            >
              <LocateFixed className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-[11px]">威胁与环境约束</Label>
        <div
          className={`flex items-center justify-between gap-2 rounded border border-border/50 px-2 py-1.5 ${
            !avail.nofly ? "opacity-50" : ""
          }`}
        >
          <Label className="text-[11px]">
            禁飞 / 禁入
            {!avail.nofly && (
              <span className="ml-1 text-[9px] text-muted-foreground">
                未另存
              </span>
            )}
          </Label>
          <Switch
            checked={enabled.nofly && avail.nofly}
            disabled={!avail.nofly}
            onCheckedChange={(v) => setEnabled((e) => ({ ...e, nofly: v }))}
          />
        </div>
        {constraintRow(
          "elevation",
          "地形·撞山上限",
          " m",
          constraints.maxElevation,
          1000,
          5000,
          50,
          avail.elevation,
          (n) => setConstraints((c) => ({ ...c, maxElevation: n }))
        )}
        {constraintRow(
          "wind",
          "气象·强对流上限",
          " km/h",
          constraints.maxWind,
          5,
          80,
          1,
          avail.wind,
          (n) => setConstraints((c) => ({ ...c, maxWind: n }))
        )}
        {constraintRow(
          "em",
          "电磁威胁上限",
          " dBm",
          constraints.maxEm,
          -90,
          -20,
          1,
          avail.em,
          (n) => setConstraints((c) => ({ ...c, maxEm: n }))
        )}
        {constraintRow(
          "radar",
          "敌雷达探测上限",
          " dB",
          constraints.maxRadar,
          -85,
          5,
          1,
          avail.radar,
          (n) => setConstraints((c) => ({ ...c, maxRadar: n }))
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="route-diag" className="text-[11px]">
          对角邻域（八向）
        </Label>
        <Switch
          id="route-diag"
          checked={diagonal}
          onCheckedChange={setDiagonal}
        />
      </div>

      {lastReason && (
        <div className="rounded border border-border/60 bg-muted/25 px-2 py-1.5 text-[10px] leading-relaxed text-foreground/90">
          {lastReason}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Button
          type="button"
          size="sm"
          className="h-8 w-full text-[11px]"
          disabled={busy || !start || !goal}
          onClick={() => runPlan()}
        >
          <Route className="mr-1 h-3.5 w-3.5" />
          {busy ? "计算中…" : "计算突击通道"}
        </Button>
        <div className="flex gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-8 flex-1 text-[11px]"
            disabled={busy || !start || !goal || !avail.elevation}
            title="橙=全约束，青=关闭地形后"
            onClick={compareWithoutElevation}
          >
            <GitCompare className="mr-1 h-3.5 w-3.5" />
            对比：关地形
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-[11px] text-red-400"
            title="清除通路与禁行叠加"
            onClick={() => {
              clearRouteOverlays()
              setLastReason(null)
              useAppStore.getState().setStatusText("已清除突击通道结果")
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </OverlayScrollArea>
  )
}

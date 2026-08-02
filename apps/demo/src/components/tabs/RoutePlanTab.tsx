import { useEffect, useState } from "react"
import { Crosshair, LocateFixed, Route, Trash2 } from "lucide-react"
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
  runAssaultCorridor,
  type ConstraintToggles,
  type CorridorConstraints,
} from "@/analysis/assaultCorridor"
import { flyToCode, getMapRuntime } from "@/map/useCesiumMap"
import { useAppStore } from "@/state/store"

function shortCode(code: string | null): string {
  if (!code) return "未设置"
  if (code.length <= 18) return code
  return `…${code.slice(-14)}`
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
  const [avail, setAvail] = useState({
    elevation: false,
    wind: false,
    em: false,
    radar: false,
  })

  const layers = useAppStore((s) => s.layers)
  useEffect(() => {
    void (async () => {
      const [elevation, wind, em, radar] = await Promise.all([
        fieldSourceAvailable(ELEV_SOURCES),
        fieldSourceAvailable(WIND_SOURCES),
        fieldSourceAvailable(EM_SOURCES),
        fieldSourceAvailable(RADAR_SOURCES),
      ])
      setAvail({ elevation, wind, em, radar })
    })()
  }, [layers])

  const beginPick = (which: "start" | "goal") => {
    useAppStore.getState().setToolMode("pick")
    useAppStore.getState().setRoutePickMode(which)
    useAppStore
      .getState()
      .setStatusText(
        which === "start"
          ? "请在地图上点选起点网格"
          : "请在地图上点选终点网格"
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
        `已用选中首尾格：起点 / 终点（共 ${gs.codes.length} 格）`
      )
  }

  const clearRouteOverlays = () => {
    const kept = useAppStore
      .getState()
      .analysisResults.filter(
        (r) =>
          r.label !== "禁行区" &&
          r.label !== "航线通路" &&
          r.label !== "空中路线" &&
          r.label !== "突击通道"
      )
    useAppStore.getState().setAnalysisResults(kept)
    getMapRuntime()?.applyAnalysisOverlays()
  }

  const runPlan = () => {
    void (async () => {
      const s = useAppStore.getState().routeStart
      const g = useAppStore.getState().routeGoal
      if (!s || !g) {
        useAppStore.getState().setStatusText("请先设置起点和终点")
        return
      }
      setBusy(true)
      useAppStore.getState().setStatusText("A* 规划中…")
      try {
        const result = await runAssaultCorridor(s, g, {
          constraints,
          enabled: {
            elevation: enabled.elevation && avail.elevation,
            wind: enabled.wind && avail.wind,
            em: enabled.em && avail.em,
            radar: enabled.radar && avail.radar,
          },
          diagonal,
        })
        const next = useAppStore
          .getState()
          .analysisResults.filter(
            (r) =>
              r.label !== "禁行区" &&
              r.label !== "航线通路" &&
              r.label !== "空中路线" &&
              r.label !== "突击通道"
          )
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
            label: "航线通路",
            color: "#f97316",
          })
        }
        useAppStore.getState().setAnalysisResults(next)
        getMapRuntime()?.applyAnalysisOverlays()
        useAppStore.getState().setStatusText(result.reason)
        if (result.path[0]) flyToCode(result.path[0], 60_000)
      } catch (err) {
        useAppStore.getState().setStatusText(
          `规划失败: ${err instanceof Error ? err.message : String(err)}`
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

  return (
    <div className="h-full min-h-0 space-y-3 overflow-y-auto pb-2">
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        基于网格场数据的航线通路规划（A*）。设置起终点与约束后计算可行通路。
      </p>

      <div className="space-y-1.5">
        <Label className="text-[11px]">起终点</Label>
        <div className="rounded border border-border/60 bg-muted/20 px-2 py-1.5 font-mono text-[10px]">
          <div className="flex items-center justify-between gap-1">
            <span className="text-muted-foreground">起点</span>
            <span className="truncate" title={start ?? undefined}>
              {shortCode(start)}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-1">
            <span className="text-muted-foreground">终点</span>
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
            拾取起点
          </Button>
          <Button
            type="button"
            size="sm"
            variant={pickMode === "goal" ? "default" : "secondary"}
            className="h-7 text-[11px]"
            onClick={() => beginPick("goal")}
          >
            <Crosshair className="mr-1 h-3 w-3" />
            拾取终点
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
              title="定位起点"
              onClick={() => flyToCode(start, 50_000)}
            >
              <LocateFixed className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-[11px]">约束条件</Label>
        {constraintRow(
          "elevation",
          "地形高程上限",
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
          "风速上限",
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
          "电磁强度上限",
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
          "雷达回波上限",
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

      <div className="flex gap-1.5">
        <Button
          type="button"
          size="sm"
          className="h-8 flex-1 text-[11px]"
          disabled={busy || !start || !goal}
          onClick={runPlan}
        >
          <Route className="mr-1 h-3.5 w-3.5" />
          {busy ? "计算中…" : "计算通路"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 px-2 text-[11px] text-red-400"
          title="清除通路与禁行叠加"
          onClick={() => {
            clearRouteOverlays()
            useAppStore.getState().setStatusText("已清除航线通路结果")
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

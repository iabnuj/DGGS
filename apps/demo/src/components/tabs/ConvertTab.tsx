import { useState } from "react"
import { ArrowRightLeft, Copy, LocateFixed } from "lucide-react"
import { convert, geosot } from "@dggs/grid-core"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { OverlayScrollArea } from "@/components/ui/overlay-scroll-area"
import { useAppStore } from "@/state/store"
import { flyToCode, getMapRuntime } from "@/map/useCesiumMap"

type SourceKind = "geosot" | "beidou" | "lonlat" | "fangli"

const SOURCE_LABEL: Record<SourceKind, string> = {
  geosot: "GeoSOT",
  beidou: "北斗格码",
  lonlat: "经纬度",
  fangli: "方里网",
}

/** 天安门附近同一位置的各制式示例（便于对照换算） */
const EXAMPLES: Record<
  SourceKind,
  { input: string; geosotLevel: number; beidouLevel: number; hint: string }
> = {
  lonlat: {
    input: "116.3974, 39.9093",
    geosotLevel: 12,
    beidouLevel: 6,
    hint: "经度,纬度",
  },
  geosot: {
    input: "G001310322-230",
    geosotLevel: 12,
    beidouLevel: 6,
    hint: "四进制编码，以 G 开头",
  },
  beidou: {
    input: "N50J47584C81",
    geosotLevel: 12,
    beidouLevel: 6,
    hint: "二维格码，以 N/S 开头",
  },
  fangli: {
    input: "FL6-20-4419-20448",
    geosotLevel: 12,
    beidouLevel: 6,
    hint: "FL带宽-带号-北向km-东向km",
  },
}

function copyText(text: string, label: string) {
  void navigator.clipboard.writeText(text).then(
    () => useAppStore.getState().setStatusText(`已复制${label}`),
    () => useAppStore.getState().setStatusText("复制失败")
  )
}

export function ConvertTab() {
  const gridSet = useAppStore((s) => s.gridSet)
  const [kind, setKind] = useState<SourceKind>("lonlat")
  const [input, setInput] = useState(EXAMPLES.lonlat.input)
  const [geosotLevel, setGeosotLevel] = useState(EXAMPLES.lonlat.geosotLevel)
  const [beidouLevel, setBeidouLevel] = useState(EXAMPLES.lonlat.beidouLevel)
  const [result, setResult] = useState<convert.ConvertResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const applyExample = (k: SourceKind) => {
    const ex = EXAMPLES[k]
    setKind(k)
    setInput(ex.input)
    setGeosotLevel(ex.geosotLevel)
    setBeidouLevel(ex.beidouLevel)
    setError(null)
    setResult(null)
  }

  const runConvert = () => {
    setError(null)
    try {
      let source: convert.ConvertSource
      if (kind === "lonlat") {
        const { lon, lat } = convert.parseLonLatText(input)
        source = { kind: "lonlat", lon, lat }
      } else if (kind === "geosot") {
        source = { kind: "geosot", code: input }
      } else if (kind === "beidou") {
        source = { kind: "beidou", code: input }
      } else {
        source = { kind: "fangli", id: input }
      }
      const r = convert.convertAll(source, { geosotLevel, beidouLevel })
      setResult(r)
      useAppStore
        .getState()
        .setStatusText(
          `已换算 · GeoSOT L${r.geosotLevel} · 北斗 L${r.beidouLevel}`
        )
    } catch (e) {
      setResult(null)
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const fillFromSelection = () => {
    const code = gridSet?.codes[0]
    if (!code) {
      useAppStore.getState().setStatusText("请先点选一个网格")
      return
    }
    setKind("geosot")
    setInput(code)
    setGeosotLevel(geosot.getLevel(code))
    setError(null)
    try {
      const r = convert.convertAll(
        { kind: "geosot", code },
        { geosotLevel: geosot.getLevel(code), beidouLevel }
      )
      setResult(r)
      useAppStore.getState().setStatusText("已从选中格填入并换算")
    } catch (e) {
      setResult(null)
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const flyResult = () => {
    if (!result) return
    useAppStore.getState().setGridSet({
      codes: [result.geosot],
      level: result.geosotLevel,
      from: "pick",
    })
    flyToCode(result.geosot)
    getMapRuntime()?.applyHighlights()
  }

  const placeholder = EXAMPLES[kind].hint + "  例 " + EXAMPLES[kind].input

  return (
    <OverlayScrollArea className="h-full" contentClassName="space-y-3 pb-2">
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        北斗格码 ↔ GeoSOT ↔ 经纬度 ↔ 方里网（经格心对齐）。
      </p>

      <div className="flex flex-wrap gap-1">
        {(Object.keys(SOURCE_LABEL) as SourceKind[]).map((k) => (
          <Button
            key={k}
            type="button"
            size="sm"
            variant={kind === k ? "secondary" : "ghost"}
            className="h-7 px-2 text-[11px]"
            onClick={() => {
              setKind(k)
              setError(null)
            }}
          >
            {SOURCE_LABEL[k]}
          </Button>
        ))}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="convert-in">输入（{SOURCE_LABEL[kind]}）</Label>
        <input
          id="convert-in"
          className="h-8 w-full rounded-md border border-border bg-background px-2 font-mono text-[11px]"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
        />
        <p className="text-[10px] text-muted-foreground">
          {EXAMPLES[kind].hint} · 示例{" "}
          <button
            type="button"
            className="font-mono text-foreground/80 underline-offset-2 hover:underline"
            onClick={() => applyExample(kind)}
          >
            {EXAMPLES[kind].input}
          </button>
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>GeoSOT 层级</Label>
          <span className="font-mono text-xs">L{geosotLevel}</span>
        </div>
        <Slider
          value={[geosotLevel]}
          min={0}
          max={32}
          step={1}
          onValueChange={([v]) => v != null && setGeosotLevel(v)}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>北斗层级</Label>
          <span className="font-mono text-xs">L{beidouLevel}</span>
        </div>
        <Slider
          value={[beidouLevel]}
          min={1}
          max={10}
          step={1}
          onValueChange={([v]) => v != null && setBeidouLevel(v)}
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Button
          type="button"
          size="sm"
          className="gap-1"
          onClick={runConvert}
        >
          <ArrowRightLeft className="h-3.5 w-3.5" />
          换算
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={fillFromSelection}
        >
          选中格
        </Button>
      </div>

      {error ? (
        <p className="text-[11px] text-destructive">{error}</p>
      ) : null}

      {result ? (
        <div className="space-y-2 border-t border-border/60 pt-3">
          <ResultRow
            label="经纬度"
            value={`${result.lon.toFixed(6)}, ${result.lat.toFixed(6)}`}
          />
          <ResultRow label={`GeoSOT · L${result.geosotLevel}`} value={result.geosot} />
          <ResultRow
            label={`北斗 · L${result.beidouLevel}`}
            value={result.beidou}
          />
          <ResultRow label="方里网" value={result.fangli} />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="w-full gap-1"
            onClick={flyResult}
          >
            <LocateFixed className="h-3.5 w-3.5" />
            定位到地图
          </Button>
        </div>
      ) : null}
    </OverlayScrollArea>
  )
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          title="复制"
          onClick={() => copyText(value, label)}
        >
          <Copy className="h-3 w-3" />
        </Button>
      </div>
      <p className="break-all font-mono text-[11px] leading-snug">{value}</p>
    </div>
  )
}

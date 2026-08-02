import { BarChart3, Thermometer, Wind } from "lucide-react"
import type { SourceStats, NumericStat } from "@/data/computeCellStats"

const SOURCE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  landsat: Thermometer,
  sentinel: Thermometer,
  weather: Wind,
  dem: BarChart3,
  temperature: Thermometer,
  wind: Wind,
  default: BarChart3,
}

function fmt(n: number, decimals = 1): string {
  if (!isFinite(n)) return "—"
  return n.toFixed(decimals)
}

function StatRow({ name, stat, unit }: { name: string; stat: NumericStat; unit?: string }) {
  return (
    <div className="rounded border border-border/60 bg-muted/20 px-2 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-foreground/90">{name}</span>
        <span className="text-[10px] text-muted-foreground">n={stat.count}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[10px]">
        <span className="text-blue-400">min {fmt(stat.min)}{unit ?? ""}</span>
        <span className="text-red-400">max {fmt(stat.max)}{unit ?? ""}</span>
        <span className="text-foreground/80">avg {fmt(stat.mean)}{unit ?? ""}</span>
        <span className="text-muted-foreground">σ ±{fmt(stat.std)}{unit ?? ""}</span>
      </div>
    </div>
  )
}

export function StatsCard({ sourceStats }: { sourceStats: SourceStats }) {
  const Icon = SOURCE_ICONS[sourceStats.source] ?? SOURCE_ICONS.default
  const attrEntries = Object.entries(sourceStats.stats)

  if (attrEntries.length === 0) return null

  return (
    <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-2.5">
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4 text-blue-400" />
        <span className="text-xs font-semibold text-foreground/90">
          {sourceStats.label}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {sourceStats.cellCount} 格 · {sourceStats.recordCount} 条
        </span>
      </div>
      <div className="space-y-1.5">
        {attrEntries.map(([name, stat]) => (
          <StatRow key={name} name={name} stat={stat} />
        ))}
      </div>
    </div>
  )
}

export function StatsGroup({ stats }: { stats: SourceStats[] }) {
  if (stats.length === 0) {
    return (
      <p className="text-[10px] text-muted-foreground">
        暂无入格数据，无法计算统计。导入数据后自动统计。
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {stats.map((s) => (
        <StatsCard key={s.source} sourceStats={s} />
      ))}
    </div>
  )
}

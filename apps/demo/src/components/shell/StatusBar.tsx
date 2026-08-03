import { useAppStore } from "@/state/store"

function Stat({
  label,
  value,
  className = "",
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <span className={`inline-flex items-baseline gap-1.5 ${className}`}>
      <span className="text-[11px] font-sans font-medium uppercase tracking-wide text-zinc-400">
        {label}
      </span>
      <span className="font-mono text-[13px] font-semibold tabular-nums text-zinc-100">
        {value}
      </span>
    </span>
  )
}

export function StatusBar() {
  const cursor = useAppStore((s) => s.cursor)
  const level = useAppStore((s) => s.level)
  const autoLevel = useAppStore((s) => s.autoLevel)
  const tileZoom = useAppStore((s) => s.tileZoom)
  const gridCount = useAppStore((s) => s.gridCount)
  const fps = useAppStore((s) => s.fps)
  const statusText = useAppStore((s) => s.statusText)

  return (
    <footer className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 flex h-9 items-center justify-between gap-4 border-t border-white/15 bg-[#070b12]/0.92 px-4 shadow-[0_-8px_24px_rgba(0,0,0,0.35)] backdrop-blur-md">
      <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-1">
        <Stat
          label="经度"
          value={cursor.lng == null ? "—" : cursor.lng.toFixed(3)}
        />
        <Stat
          label="纬度"
          value={cursor.lat == null ? "—" : cursor.lat.toFixed(3)}
        />
        <Stat
          label="格网"
          value={cursor.gridCode ?? "—"}
          className="min-w-0"
        />
        <span className="hidden max-w-[28rem] truncate border-l border-white/15 pl-4 text-[12px] font-medium text-sky-300/95 sm:inline">
          {statusText}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-5">
        <Stat
          label="网格"
          value={autoLevel ? `L${level}·自动` : `L${level}`}
        />
        <Stat label="瓦片" value={tileZoom >= 0 ? `Z${tileZoom}` : "—"} />
        <Stat label="FPS" value={fps ? String(fps) : "—"} />
        <Stat label="格数" value={gridCount.toLocaleString()} />
      </div>
    </footer>
  )
}

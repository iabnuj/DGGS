import { useAppStore } from "@/state/store"

export function StatusBar() {
  const cursor = useAppStore((s) => s.cursor)
  const gridCount = useAppStore((s) => s.gridCount)
  const fps = useAppStore((s) => s.fps)
  const statusText = useAppStore((s) => s.statusText)

  return (
    <footer className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 flex h-[30px] items-center justify-between border-t border-border/60 bg-[#0b1017]/0.85 px-4 text-[11px] text-muted-foreground backdrop-blur-md">
      <div className="flex min-w-0 gap-4 font-mono">
        <span>
          Lng: {cursor.lng == null ? "—" : cursor.lng.toFixed(3)}
        </span>
        <span>
          Lat: {cursor.lat == null ? "—" : cursor.lat.toFixed(3)}
        </span>
        <span className="truncate">
          Grid: {cursor.gridCode ?? "—"}
        </span>
        <span className="hidden text-muted-foreground/80 sm:inline">{statusText}</span>
      </div>
      <div className="flex shrink-0 gap-4 font-mono">
        <span>{fps || "—"} FPS</span>
        <span>Grids: {gridCount.toLocaleString()}</span>
      </div>
    </footer>
  )
}

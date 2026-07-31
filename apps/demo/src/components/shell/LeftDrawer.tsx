import { PanelLeftClose } from "lucide-react"
import { Accordion } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { DisplayTab } from "@/components/tabs/DisplayTab"
import { DataTab } from "@/components/tabs/DataTab"
import { MapTab } from "@/components/tabs/MapTab"
import { useAppStore } from "@/state/store"

export function LeftDrawer() {
  const open = useAppStore((s) => s.leftPanelOpen)
  if (!open) return null

  return (
    <aside className="glass-panel pointer-events-auto absolute bottom-9 left-0 top-0 z-20 flex w-[320px] flex-col overflow-hidden rounded-none border-y-0 border-l-0">
      <header className="flex shrink-0 items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <img
            src={`${import.meta.env.BASE_URL}logo.svg`}
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 shrink-0 rounded-full"
          />
          <div className="min-w-0">
            <p className="text-lg font-semibold tracking-wide text-foreground">格网引擎</p>
            <p className="text-xs text-muted-foreground">GeoSOT</p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0"
          title="隐藏左侧面板"
          onClick={() => useAppStore.getState().setLeftPanelOpen(false)}
        >
          <PanelLeftClose className="h-4 w-4" />
        </Button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">
        <Accordion
          defaultOpen="data"
          className="gap-0"
          items={[
            { id: "data", title: "格网数据", content: <DataTab /> },
            { id: "display", title: "格网显示", content: <DisplayTab /> },
            { id: "map", title: "地图显示", content: <MapTab /> },
          ]}
        />
      </div>
    </aside>
  )
}

import { PanelLeftClose } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { DisplayTab } from "@/components/tabs/DisplayTab"
import { DataTab } from "@/components/tabs/DataTab"
import { QueryTab } from "@/components/tabs/QueryTab"
import { AnalysisTab } from "@/components/tabs/AnalysisTab"
import { MapTab } from "@/components/tabs/MapTab"
import { useAppStore } from "@/state/store"

export function LeftDrawer() {
  const open = useAppStore((s) => s.leftPanelOpen)
  if (!open) return null

  return (
    <aside className="glass-panel pointer-events-auto absolute left-5 top-5 z-20 flex max-h-[80vh] w-[320px] flex-col overflow-hidden rounded-xl">
      <header className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="text-lg font-semibold tracking-wide text-foreground">DGGS</p>
          <p className="text-xs text-muted-foreground">GeoSOT 网格演示</p>
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
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <Tabs defaultValue="display">
          <TabsList className="grid h-auto grid-cols-5 gap-0.5">
            <TabsTrigger value="display">显示</TabsTrigger>
            <TabsTrigger value="data">数据</TabsTrigger>
            <TabsTrigger value="query">查询</TabsTrigger>
            <TabsTrigger value="analysis">分析</TabsTrigger>
            <TabsTrigger value="map">地图</TabsTrigger>
          </TabsList>
          <TabsContent value="display">
            <DisplayTab />
          </TabsContent>
          <TabsContent value="data">
            <DataTab />
          </TabsContent>
          <TabsContent value="query">
            <QueryTab />
          </TabsContent>
          <TabsContent value="analysis">
            <AnalysisTab />
          </TabsContent>
          <TabsContent value="map">
            <MapTab />
          </TabsContent>
        </Tabs>
      </div>
    </aside>
  )
}

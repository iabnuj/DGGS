import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getMapRuntime, resetChinaView } from "@/map/useCesiumMap"
import { useAppStore, type BasemapId } from "@/state/store"

export function MapTab() {
  const basemap = useAppStore((s) => s.basemap)
  const adminOverlay = useAppStore((s) => s.adminOverlay)
  const terrain = useAppStore((s) => s.terrain)
  const lighting = useAppStore((s) => s.lighting)

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>底图</Label>
        <Select
          value={basemap}
          onValueChange={(v) => useAppStore.getState().setBasemap(v as BasemapId)}
        >
          <SelectTrigger>
            <SelectValue placeholder="选择底图" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sat">卫星影像</SelectItem>
            <SelectItem value="osm">矢量路网</SelectItem>
            <SelectItem value="dark">深色科技风</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Label htmlFor="admin-overlay">中文地名注记</Label>
          <p className="text-[10px] text-muted-foreground">叠加路网与中文地名</p>
        </div>
        <Switch
          id="admin-overlay"
          checked={adminOverlay}
          onCheckedChange={(v) => useAppStore.getState().setAdminOverlay(v)}
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Label htmlFor="terrain">地形高程</Label>
          <p className="text-[10px] text-muted-foreground">
            开启后网格贴地绘制（拉伸暂改平面）
          </p>
        </div>
        <Switch
          id="terrain"
          checked={terrain}
          onCheckedChange={(v) => useAppStore.getState().setTerrain(v)}
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="shadow">光照与阴影</Label>
        <Switch
          id="shadow"
          checked={lighting}
          onCheckedChange={(v) => useAppStore.getState().setLighting(v)}
        />
      </div>
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        onClick={() => {
          resetChinaView()
          window.setTimeout(() => getMapRuntime()?.refresh(), 1300)
        }}
      >
        重置视角（中国）
      </Button>
    </div>
  )
}

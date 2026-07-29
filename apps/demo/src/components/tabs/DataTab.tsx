import { useRef } from "react"
import { Eye, EyeOff, LocateFixed, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getDesktopApi, isDesktopApp } from "@/ipcWarehouse"
import { ingestGeoJsonText } from "@/data/ingestGeoJson"
import {
  getWarehouse,
  importRecords,
  syncLayersFromWarehouse,
} from "@/data/warehouseBoot"
import { useAppStore } from "@/state/store"
import { flyToCode } from "@/map/useCesiumMap"
import type { GridCellRecord } from "@dggs/grid-ingest"

export function DataTab() {
  const layers = useAppStore((s) => s.layers)
  const level = useAppStore((s) => s.level)
  const progress = useAppStore((s) => s.importProgress)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleText = async (name: string, text: string) => {
    try {
      useAppStore.getState().setStatusText(`正在入格 ${name}…`)
      const source = name.replace(/\.(geo)?json$/i, "") || "import"
      const records = ingestGeoJsonText(text, { level, source, label: name })
      if (records.length === 0) throw new Error("未解析到可入格要素")
      await importRecords(records)
      useAppStore.getState().setStatusText(`已导入 ${records.length} 条记录`)
    } catch (err) {
      useAppStore.getState().setStatusText(
        `导入失败: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  const onPickFile = async (file: File) => {
    const text = await file.text()
    await handleText(file.name, text)
  }

  const onImportClick = async () => {
    const desktop = getDesktopApi()
    if (desktop?.pickImportFile) {
      const picked = await desktop.pickImportFile()
      if (picked) await handleText(picked.name, picked.text)
      return
    }
    fileRef.current?.click()
  }

  return (
    <div className="space-y-3">
      <input
        ref={fileRef}
        type="file"
        accept=".json,.geojson,application/geo+json,application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void onPickFile(f)
          e.target.value = ""
        }}
      />
      <Button type="button" className="w-full" onClick={() => void onImportClick()}>
        导入数据 {isDesktopApp() ? "(本地文件)" : "(GeoJSON)"}
      </Button>
      {progress != null && (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        一期支持 GeoJSON / 网格 JSON；Shapefile 后续接入。
      </p>
      <div className="max-h-[42vh] space-y-2 overflow-y-auto">
        {layers.length === 0 ? (
          <p className="text-xs text-muted-foreground">暂无图层</p>
        ) : (
          layers.map((layer) => (
            <Card key={layer.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between gap-2">
                  <span className="truncate">{layer.name}</span>
                  <span className="shrink-0 text-[10px] font-normal text-muted-foreground">
                    {layer.type}
                  </span>
                </CardTitle>
                <CardDescription>
                  {layer.count.toLocaleString()} 格 · L{layer.levelMin}
                  {layer.levelMax !== layer.levelMin ? `-${layer.levelMax}` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  title={layer.visible ? "隐藏" : "显示"}
                  onClick={() =>
                    useAppStore.getState().patchLayer(layer.id, {
                      visible: !layer.visible,
                    })
                  }
                >
                  {layer.visible ? (
                    <Eye className="h-4 w-4" />
                  ) : (
                    <EyeOff className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  title="定位"
                  onClick={async () => {
                    const rows = (await getWarehouse().list({
                      source: layer.source,
                    })) as GridCellRecord[]
                    if (rows[0]) flyToCode(rows[0].gridId)
                  }}
                >
                  <LocateFixed className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  title="删除该 source"
                  onClick={async () => {
                    const wh = getWarehouse()
                    const rows = (await wh.list({
                      source: layer.source,
                    })) as GridCellRecord[]
                    if (wh.delete) await wh.delete(rows)
                    await syncLayersFromWarehouse()
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}

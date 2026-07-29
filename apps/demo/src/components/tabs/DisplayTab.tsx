import { useRef } from "react"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { getMapRuntime } from "@/map/useCesiumMap"
import { useAppStore } from "@/state/store"

function ColorField({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (css: string) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] text-muted-foreground uppercase">
          {value}
        </span>
        <input
          id={id}
          type="color"
          value={value}
          className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent p-0.5"
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  )
}

export function DisplayTab() {
  const gridVisible = useAppStore((s) => s.gridVisible)
  const level = useAppStore((s) => s.level)
  const autoLevel = useAppStore((s) => s.autoLevel)
  const extrudeByAttr = useAppStore((s) => s.extrudeByAttr)
  const drawOptions = useAppStore((s) => s.drawOptions)
  const opacityTimer = useRef<number | undefined>(undefined)

  const bump = () => getMapRuntime()?.refresh()

  const patchStyle = (patch: Partial<typeof drawOptions>, refreshNow = true) => {
    useAppStore.getState().setDrawOptions(patch)
    if (refreshNow) bump()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="show-grid">显示网格底座</Label>
        <Switch
          id="show-grid"
          checked={gridVisible}
          onCheckedChange={(v) => {
            useAppStore.getState().setGridVisible(v)
            bump()
          }}
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="auto-level">随相机自动调级</Label>
        <Switch
          id="auto-level"
          checked={autoLevel}
          onCheckedChange={(v) => {
            useAppStore.getState().setAutoLevel(v)
            bump()
          }}
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>网格层级</Label>
          <span className="font-mono text-xs text-foreground">{level}</span>
        </div>
        <Slider
          value={[level]}
          min={8}
          max={15}
          step={1}
          onValueChange={([v]) => {
            useAppStore.getState().setAutoLevel(false)
            useAppStore.getState().setLevel(v)
            bump()
          }}
        />
      </div>

      <div className="space-y-3 border-t border-border/60 pt-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          样式
        </p>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="outline">显示边框</Label>
          <Switch
            id="outline"
            checked={drawOptions.showOutline}
            onCheckedChange={(v) => patchStyle({ showOutline: v })}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="faces">显示填充面</Label>
          <Switch
            id="faces"
            checked={drawOptions.showFaces}
            onCheckedChange={(v) => patchStyle({ showFaces: v })}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="show-code">显示编码</Label>
          <Switch
            id="show-code"
            checked={drawOptions.showCode}
            onCheckedChange={(v) => patchStyle({ showCode: v })}
          />
        </div>
        <ColorField
          id="outline-color"
          label="边框颜色"
          value={drawOptions.outlineColor}
          onChange={(outlineColor) => patchStyle({ outlineColor })}
        />
        <ColorField
          id="fill-color"
          label="填充颜色"
          value={drawOptions.fillColor}
          onChange={(fillColor) => patchStyle({ fillColor })}
        />
        <ColorField
          id="hi-color"
          label="高亮颜色"
          value={drawOptions.highlightColor}
          onChange={(highlightColor) => patchStyle({ highlightColor })}
        />
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>整体透明度</Label>
            <span className="font-mono text-xs text-foreground">
              {drawOptions.opacity}%
            </span>
          </div>
          <Slider
            value={[drawOptions.opacity]}
            min={0}
            max={100}
            step={1}
            onValueChange={([v]) => {
              patchStyle({ opacity: v }, false)
              window.clearTimeout(opacityTimer.current)
              opacityTimer.current = window.setTimeout(() => bump(), 80)
            }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
        <Label htmlFor="extrude">按属性拉伸高度</Label>
        <Switch
          id="extrude"
          checked={extrudeByAttr}
          onCheckedChange={(v) => {
            useAppStore.getState().setExtrudeByAttr(v)
            bump()
          }}
        />
      </div>
      {extrudeByAttr && (
        <p className="text-[10px] text-muted-foreground">
          开启地形贴地时拉伸暂不生效，会按平面贴地绘制。
        </p>
      )}
    </div>
  )
}

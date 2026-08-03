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

  const debounceBump = () => {
    window.clearTimeout(opacityTimer.current)
    opacityTimer.current = window.setTimeout(() => bump(), 80)
  }

  return (
    <div className="h-full min-h-0 space-y-4 overflow-y-auto">
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
          min={0}
          max={32}
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
          网格样式
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
              debounceBump()
            }}
          />
        </div>
      </div>

      <div className="space-y-3 border-t border-border/60 pt-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          格网编号
        </p>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="show-code">显示编号</Label>
          <Switch
            id="show-code"
            checked={drawOptions.showCode}
            onCheckedChange={(v) => patchStyle({ showCode: v })}
          />
        </div>
        {drawOptions.showCode && (
          <>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="code-short">缩写显示</Label>
              <Switch
                id="code-short"
                checked={drawOptions.codeShort}
                onCheckedChange={(v) => patchStyle({ codeShort: v })}
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              开启后只显示编码末尾几段，减少遮挡。
            </p>
            <ColorField
              id="code-color"
              label="文字颜色"
              value={drawOptions.codeColor}
              onChange={(codeColor) => patchStyle({ codeColor })}
            />
            <ColorField
              id="code-outline-color"
              label="描边颜色"
              value={drawOptions.codeOutlineColor}
              onChange={(codeOutlineColor) => patchStyle({ codeOutlineColor })}
            />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>字号</Label>
                <span className="font-mono text-xs text-foreground">
                  {drawOptions.codeFontSize}px
                </span>
              </div>
              <Slider
                value={[drawOptions.codeFontSize]}
                min={8}
                max={24}
                step={1}
                onValueChange={([v]) => {
                  patchStyle({ codeFontSize: v }, false)
                  debounceBump()
                }}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="code-bg">文字底衬</Label>
              <Switch
                id="code-bg"
                checked={drawOptions.codeBackground}
                onCheckedChange={(v) => patchStyle({ codeBackground: v })}
              />
            </div>
            {drawOptions.codeBackground && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>底衬透明度</Label>
                  <span className="font-mono text-xs text-foreground">
                    {drawOptions.codeBgOpacity}%
                  </span>
                </div>
                <Slider
                  value={[drawOptions.codeBgOpacity]}
                  min={0}
                  max={100}
                  step={5}
                  onValueChange={([v]) => {
                    patchStyle({ codeBgOpacity: v }, false)
                    debounceBump()
                  }}
                />
              </div>
            )}
          </>
        )}
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
      <p className="text-[10px] text-muted-foreground">
        {extrudeByAttr
          ? "开启后网格立体拉伸；地形贴地时仍按平面绘制。"
          : "关闭时网格平面绘制。"}
      </p>
    </div>
  )
}

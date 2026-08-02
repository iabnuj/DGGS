import { useEffect, useRef, useState } from "react"
import { Palette } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  defaultFieldStyle,
  getRampById,
  listRampPresets,
  RAMP_PRESETS,
  rampGradientCss,
} from "@/data/fieldRenderer"
import { useAppStore } from "@/state/store"

/** 标量场图层：眼睛旁的色带 / 透明度配置弹层（按类型 source） */
export function FieldStylePopover({
  source,
  label,
}: {
  source: string
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const saved = useAppStore((s) => s.fieldStyles[source])
  const base = defaultFieldStyle(source)
  const rampId =
    saved?.rampId && saved.rampId in RAMP_PRESETS ? saved.rampId : base.rampId
  const opacity = saved?.opacity ?? base.opacity
  const presets = listRampPresets()
  const currentRamp = getRampById(rampId)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDoc)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <Button
        type="button"
        size="icon"
        variant="ghost"
        title="渲染样式（色带 / 透明度）"
        onClick={() => setOpen((v) => !v)}
      >
        <Palette
          className={`h-4 w-4 ${open ? "text-primary" : ""}`}
        />
      </Button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-md">
          <p className="mb-2 text-[11px] font-medium text-foreground">
            {label ?? source}
            <span className="ml-1 font-normal text-muted-foreground">
              · 类型样式
            </span>
          </p>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-[11px]">色带</Label>
              <Select
                value={rampId}
                onValueChange={(id) => {
                  useAppStore.getState().setFieldStyle(source, { rampId: id })
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {presets.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-10 shrink-0 rounded-sm border border-border/60"
                          style={{ background: rampGradientCss(p.ramp) }}
                        />
                        {p.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div
                className="mt-1 h-2 w-full rounded-sm border border-border/50"
                style={{ background: rampGradientCss(currentRamp) }}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-[11px]">透明度</Label>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {opacity}%
                </span>
              </div>
              <Slider
                value={[opacity]}
                min={10}
                max={100}
                step={5}
                onValueChange={([v]) => {
                  if (v == null) return
                  useAppStore.getState().setFieldStyle(source, { opacity: v })
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

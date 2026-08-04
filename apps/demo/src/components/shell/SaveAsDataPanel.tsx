import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { Save, X } from "lucide-react"
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
  DRAWN_PRESETS,
  getDrawnPreset,
  saveSelectionAsData,
  type DrawnDataType,
} from "@/data/drawnData"
import { useAppStore } from "@/state/store"

/**
 * 选中格「另存为数据」：按钮 + 弹框（新建 / 追加上次同类型图层）。
 */
export function SaveAsDataPanel() {
  const gridSet = useAppStore((s) => s.gridSet)
  const lastDrawnSave = useAppStore((s) => s.lastDrawnSave)
  const [open, setOpen] = useState(false)
  const [drawnType, setDrawnType] = useState<DrawnDataType>("nofly")
  const [name, setName] = useState("")
  const [fieldValue, setFieldValue] = useState(0)
  const [busy, setBusy] = useState(false)

  const preset = useMemo(() => getDrawnPreset(drawnType), [drawnType])
  const canAppend =
    !!lastDrawnSave && lastDrawnSave.drawnType === drawnType

  useEffect(() => {
    if (!open) return
    const p = getDrawnPreset(drawnType)
    setName(p.defaultName)
    if (typeof p.defaultValue === "number") setFieldValue(p.defaultValue)
  }, [drawnType, open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, busy])

  if (!gridSet?.codes.length) return null

  const commit = (mode: "create" | "append") => {
    void (async () => {
      setBusy(true)
      try {
        await saveSelectionAsData({
          codes: gridSet.codes,
          level: gridSet.level,
          drawnType,
          name,
          fieldValue: preset.isField ? fieldValue : undefined,
          mode,
        })
        setOpen(false)
      } catch (err) {
        useAppStore.getState().setStatusText(
          `另存失败: ${err instanceof Error ? err.message : String(err)}`
        )
      } finally {
        setBusy(false)
      }
    })()
  }

  const dialog =
    open &&
    createPortal(
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        role="presentation"
      >
        <button
          type="button"
          aria-label="关闭"
          className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
          disabled={busy}
          onClick={() => {
            if (!busy) setOpen(false)
          }}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="save-as-data-title"
          className="glass-panel relative z-10 w-full max-w-[360px] rounded-lg border border-border shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
            <div className="min-w-0">
              <h2
                id="save-as-data-title"
                className="text-sm font-semibold text-foreground"
              >
                另存为数据
              </h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                选中 {gridSet.codes.length} 格 · L{gridSet.level}
              </p>
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0"
              disabled={busy}
              title="关闭"
              onClick={() => setOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </header>

          <div className="space-y-3 px-4 py-3">
            <div className="space-y-1.5">
              <Label className="text-[11px]">数据类型</Label>
              <Select
                value={drawnType}
                onValueChange={(v) => setDrawnType(v as DrawnDataType)}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[110]">
                  {DRAWN_PRESETS.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                {preset.description}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px]" htmlFor="drawn-name">
                图层名称
              </Label>
              <input
                id="drawn-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background/60 px-3 text-xs outline-none focus:ring-2 focus:ring-ring"
                autoFocus
              />
            </div>

            {preset.isField && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <Label>{preset.valueLabel ?? "场值"}</Label>
                  <span className="font-mono text-muted-foreground">
                    {fieldValue}
                    {preset.unit ? ` ${preset.unit}` : ""}
                  </span>
                </div>
                <Slider
                  value={[fieldValue]}
                  min={
                    drawnType === "em"
                      ? -90
                      : drawnType === "radar"
                        ? -85
                        : 0
                  }
                  max={
                    drawnType === "em"
                      ? -20
                      : drawnType === "radar"
                        ? 10
                        : 100
                  }
                  step={1}
                  onValueChange={([v]) => {
                    if (v != null) setFieldValue(v)
                  }}
                />
              </div>
            )}
          </div>

          <footer className="flex flex-col gap-2 border-t border-border px-4 py-3">
            <Button
              type="button"
              size="sm"
              className="h-9 w-full text-xs"
              disabled={busy}
              onClick={() => commit("create")}
            >
              {busy ? "保存中…" : "新建图层"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-9 w-full text-xs"
              disabled={busy || !canAppend}
              title={
                canAppend
                  ? `追加到「${lastDrawnSave!.label}」`
                  : lastDrawnSave
                    ? `上次为「${getDrawnPreset(lastDrawnSave.drawnType as DrawnDataType).label}」，类型不一致`
                    : "尚无上次图层"
              }
              onClick={() => commit("append")}
            >
              {canAppend
                ? `追加到「${lastDrawnSave!.label}」`
                : "追加到上次图层"}
            </Button>
          </footer>
        </div>
      </div>,
      document.body
    )

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="h-7 w-full text-[11px]"
        onClick={() => setOpen(true)}
      >
        <Save className="mr-1 h-3.5 w-3.5" />
        另存为数据…
      </Button>
      {dialog}
    </>
  )
}

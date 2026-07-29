import { PanelLeft, PanelRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAppStore } from "@/state/store"

/** Edge toggles to reopen collapsed panels. */
export function PanelToggles() {
  const leftOpen = useAppStore((s) => s.leftPanelOpen)
  const rightOpen = useAppStore((s) => s.rightPanelOpen)

  return (
    <>
      {!leftOpen && (
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="pointer-events-auto absolute left-5 top-5 z-20 h-9 w-9 rounded-lg border border-border/60 bg-[#0b1017]/0.75 shadow-md backdrop-blur-md"
          title="显示左侧面板"
          onClick={() => useAppStore.getState().setLeftPanelOpen(true)}
        >
          <PanelLeft className="h-4 w-4" />
        </Button>
      )}
      {!rightOpen && (
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="pointer-events-auto absolute right-5 top-5 z-20 h-9 w-9 rounded-lg border border-border/60 bg-[#0b1017]/0.75 shadow-md backdrop-blur-md"
          title="显示右侧面板"
          onClick={() => useAppStore.getState().setRightPanelOpen(true)}
        >
          <PanelRight className="h-4 w-4" />
        </Button>
      )}
    </>
  )
}

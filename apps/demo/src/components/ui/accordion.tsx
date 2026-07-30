import { useState, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

export type AccordionItemDef = {
  id: string
  title: string
  content: ReactNode
}

type AccordionProps = {
  items: AccordionItemDef[]
  /** Initially open section id (single-expand). */
  defaultOpen?: string
  className?: string
  /** Allow collapsing the open section so none are open. Default true. */
  collapsible?: boolean
}

export function Accordion({
  items,
  defaultOpen,
  className,
  collapsible = true,
}: AccordionProps) {
  const [openId, setOpenId] = useState<string | null>(defaultOpen ?? null)

  const toggle = (id: string) => {
    setOpenId((prev) => {
      if (prev === id) return collapsible ? null : prev
      return id
    })
  }

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      {items.map((item) => {
        const open = openId === item.id
        return (
          <div
            key={item.id}
            className={cn(
              "flex flex-col overflow-hidden border-b border-border/80 last:border-b-0",
              "transition-[flex-grow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
              open ? "min-h-0 flex-1" : "shrink-0 flex-none"
            )}
          >
            <button
              type="button"
              className={cn(
                "flex w-full shrink-0 items-center justify-between gap-2 border-l-2 px-3 py-2.5 text-left text-sm tracking-wide",
                "transition-colors duration-200",
                open
                  ? "border-l-primary bg-primary/15 font-semibold text-foreground hover:bg-primary/20"
                  : "border-l-transparent bg-transparent font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground/85"
              )}
              aria-expanded={open}
              onClick={() => toggle(item.id)}
            >
              <span className={cn(open && "text-primary")}>{item.title}</span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                  open
                    ? "rotate-180 text-primary"
                    : "text-muted-foreground/70"
                )}
              />
            </button>

            {/* grid 0fr → 1fr：高度折叠动画；打开节再靠 flex-1 吃满剩余高度 */}
            <div
              className={cn(
                "grid min-h-0 transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                open
                  ? "flex-1 grid-rows-[1fr] opacity-100"
                  : "grid-rows-[0fr] opacity-0"
              )}
              aria-hidden={!open}
            >
              <div className="min-h-0 overflow-hidden">
                <div
                  className={cn(
                    "flex h-full min-h-0 flex-col overflow-hidden border-t border-border/60 bg-background/40 px-3 py-3",
                    "transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                    open ? "translate-y-0" : "-translate-y-1"
                  )}
                >
                  {item.content}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

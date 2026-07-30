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
    <div className={cn("flex min-h-0 flex-1 flex-col gap-1.5", className)}>
      {items.map((item) => {
        const open = openId === item.id
        return (
          <div
            key={item.id}
            className={cn(
              "flex flex-col overflow-hidden border-b border-border/80 last:border-b-0",
              open ? "min-h-0 flex-1" : "shrink-0"
            )}
          >
            <button
              type="button"
              className={cn(
                "flex w-full shrink-0 items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-semibold tracking-wide transition-colors",
                open
                  ? "bg-secondary text-foreground hover:bg-secondary/90"
                  : "bg-muted/80 text-foreground/90 hover:bg-muted"
              )}
              aria-expanded={open}
              onClick={() => toggle(item.id)}
            >
              <span>{item.title}</span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
                  open && "rotate-180 text-primary"
                )}
              />
            </button>
            <div
              className={cn(
                "min-h-0 flex-1 overflow-y-auto border-t border-border/60 bg-background/40 px-3 py-3",
                !open && "hidden"
              )}
              hidden={!open}
            >
              {item.content}
            </div>
          </div>
        )
      })}
    </div>
  )
}

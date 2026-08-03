import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type UIEvent,
} from "react"
import { cn } from "@/lib/utils"

type Props = {
  children: ReactNode
  className?: string
  /** Applied to the inner scrolling element (spacing etc.). */
  contentClassName?: string
}

/**
 * 滚动条不占布局宽度：隐藏原生条，悬停时在内容上方画浮动滑块。
 */
export function OverlayScrollArea({
  children,
  className,
  contentClassName,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState(false)
  const [thumb, setThumb] = useState({ top: 0, height: 0, show: false })

  const syncThumb = useCallback(() => {
    const el = ref.current
    if (!el) return
    const { scrollTop, scrollHeight, clientHeight } = el
    if (scrollHeight <= clientHeight + 1) {
      setThumb({ top: 0, height: 0, show: false })
      return
    }
    const track = clientHeight
    const height = Math.max(28, (clientHeight / scrollHeight) * track)
    const maxTop = track - height
    const top =
      maxTop <= 0
        ? 0
        : (scrollTop / (scrollHeight - clientHeight)) * maxTop
    setThumb({ top, height, show: true })
  }, [])

  useEffect(() => {
    syncThumb()
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => syncThumb())
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    return () => ro.disconnect()
  }, [syncThumb, children])

  const onScroll = (_e: UIEvent<HTMLDivElement>) => {
    syncThumb()
  }

  return (
    <div
      className={cn("relative min-h-0", className)}
      onMouseEnter={() => {
        setHover(true)
        syncThumb()
      }}
      onMouseLeave={() => setHover(false)}
    >
      <div
        ref={ref}
        className={cn(
          "h-full min-h-0 overflow-x-hidden overflow-y-auto",
          "[scrollbar-width:none] [-ms-overflow-style:none]",
          "[&::-webkit-scrollbar]:hidden [&::-webkit-scrollbar]:w-0",
          contentClassName
        )}
        onScroll={onScroll}
      >
        {children}
      </div>
      {hover && thumb.show ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-1 right-0.5 w-1.5"
        >
          <div
            className="w-full rounded-full bg-foreground/25 transition-colors"
            style={{
              height: thumb.height,
              transform: `translateY(${thumb.top}px)`,
            }}
          />
        </div>
      ) : null}
    </div>
  )
}

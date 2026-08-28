/** A small anchored menu, used for the toolbar's audio and handout pickers. */
import { useEffect, useRef, useState, type ReactNode } from 'react'

export function Popover({
  label,
  active,
  children,
}: {
  label: string
  active?: boolean
  children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="menu-wrap" ref={wrap}>
      <button aria-pressed={active ?? open} onClick={() => setOpen((v) => !v)}>
        {label} ▾
      </button>
      {open && <div className="menu">{children(() => setOpen(false))}</div>}
    </div>
  )
}

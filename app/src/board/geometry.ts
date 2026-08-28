/** Fitting the grid to the map art without cropping it. */
import { useLayoutEffect, useState, type RefObject } from 'react'

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

export interface Natural {
  w: number
  h: number
}

/**
 * The rectangle the image actually occupies inside `ref` under `object-fit:
 * contain`. The grid is laid over this box, not the container, so squares stay
 * aligned with the art whatever the window shape.
 */
export function useContainBox(
  ref: RefObject<HTMLElement | null>,
  natural: Natural | null,
): Box {
  const [box, setBox] = useState<Box>({ left: 0, top: 0, width: 0, height: 0 })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const cw = el.clientWidth
      const ch = el.clientHeight
      if (!natural?.w || !natural?.h) {
        setBox({ left: 0, top: 0, width: cw, height: ch })
        return
      }
      const scale = Math.min(cw / natural.w, ch / natural.h)
      const width = natural.w * scale
      const height = natural.h * scale
      setBox({ left: (cw - width) / 2, top: (ch - height) / 2, width, height })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, natural?.w, natural?.h])

  return box
}

export interface CellMetrics {
  w: number
  h: number
  size: number
}

export const cellMetrics = (box: Box, cols: number, rows: number): CellMetrics => {
  const w = cols > 0 ? box.width / cols : 0
  const h = rows > 0 ? box.height / rows : 0
  return { w, h, size: Math.min(w, h) }
}

/** Pointer position → grid coordinates, in continuous cell units. */
export function pointToCell(
  clientX: number,
  clientY: number,
  el: HTMLElement,
  box: Box,
  cols: number,
  rows: number,
): { x: number; y: number } {
  const rect = el.getBoundingClientRect()
  const cell = cellMetrics(box, cols, rows)
  if (!cell.w || !cell.h) return { x: 0, y: 0 }
  return {
    x: (clientX - rect.left - box.left) / cell.w,
    y: (clientY - rect.top - box.top) / cell.h,
  }
}

/** Continuous cell units → the square containing that point. */
export const snap = (x: number, y: number, cols: number, rows: number) => ({
  x: Math.max(0, Math.min(cols - 1, Math.floor(x))),
  y: Math.max(0, Math.min(rows - 1, Math.floor(y))),
})

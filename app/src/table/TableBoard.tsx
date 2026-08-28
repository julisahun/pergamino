/** The board as the players see it: no tools, opaque fog, no hidden tokens. */
import { useMemo } from 'react'
import type { TableView } from '../../../shared/types.ts'
import { Board } from '../board/Board.tsx'

export function TableBoard({ view }: { view: TableView }) {
  const pieces = useMemo(
    () =>
      view.combatants.map((c) => ({
        ref: c.ref,
        name: c.name,
        portrait: c.portrait,
        dead: c.dead,
        active: c.ref === view.activeRef,
        hidden: false,
      })),
    [view.combatants, view.activeRef],
  )

  if (!view.grid) return null
  return (
    <Board
      mapUrl={view.map?.src ?? view.scene?.artUrl ?? null}
      cols={view.grid.cols}
      rows={view.grid.rows}
      tokens={view.tokens}
      pieces={pieces}
      fog={view.fog}
      templates={view.templates}
    />
  )
}

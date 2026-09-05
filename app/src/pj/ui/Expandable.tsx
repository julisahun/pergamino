import type { ReactNode } from 'react'

/** A row that opens: a spell, a feat, an item's text. */
export function Expandable({ title, meta, children }: { title: string; meta?: string; children: ReactNode }) {
  return (
    <details className="pj-exp">
      <summary>
        <span className="pj-exp-title">{title}</span>
        {meta && <span className="pj-exp-meta">{meta}</span>}
      </summary>
      <div className="pj-exp-body">{children}</div>
    </details>
  )
}

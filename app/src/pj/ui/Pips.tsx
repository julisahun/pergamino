/**
 * A row of things to spend — spell slots, charges — tapped one at a time.
 *
 * Tapping a spent pip un-spends down to it; tapping a free one spends up to
 * it. The same rule the console's slot row uses, at a size a thumb can hit.
 */
export function Pips({
  total,
  used,
  onChange,
  label,
}: {
  total: number
  used: number
  onChange: (used: number) => void
  label: string
}) {
  return (
    <div className="pj-pips" role="group" aria-label={label}>
      {Array.from({ length: total }, (_, i) => (
        <button
          key={i}
          type="button"
          className={`pj-pip${i < used ? ' spent' : ''}`}
          aria-pressed={i < used}
          onClick={() => onChange(i < used ? i : i + 1)}
        />
      ))}
    </div>
  )
}

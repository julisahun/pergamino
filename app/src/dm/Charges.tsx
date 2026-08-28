/**
 * An object's charges, spent by clicking them.
 *
 * A charge is a spell slot by another name — a row of pips and no separate
 * verb — so it is the same gesture: a lit pip spends one, an unlit pip puts
 * the row back up to there. The `Usar` button that used to sit beside them is
 * gone, along with the `object/use` action behind it.
 */
import { es } from '../strings/es.ts'

export function Charges({
  total,
  left,
  onSet,
}: {
  total: number
  left: number
  onSet: (uses: number) => void
}) {
  return (
    <span className="uses">
      {Array.from({ length: total }, (_, i) => {
        const lit = i < left
        return (
          <button
            key={i}
            className={`use-pip${lit ? ' on' : ''}`}
            title={`${left}/${total} ${es.usos}`}
            onClick={() => onSet(lit ? left - 1 : i + 1)}
          />
        )
      })}
    </span>
  )
}

/**
 * What whoever is up can do, listed under their row in the rail.
 *
 * A list, and nothing more. Every line is read out of the prose that already
 * describes the creature — `pnj/bandido.md` says «+3 al ataque, 1d6+1 de daño
 * cortante» and this shows `Cimitarra +3 · 1d6+1` — so the numbers are in
 * front of the DM without the app claiming to know what happens next.
 *
 * **It used to resolve one against a target and apply the result, and that was
 * removed on purpose.** Judging an attack needs the target's AC, which a pnj
 * note states; judging a *save* needs the target's save bonus, which a pnj
 * note has never had a field for. So the console compared a bare d20 against
 * the DC and every PNJ in the campaign saved at +0 — a number the app had
 * invented, presented in the same voice as one it had read. Hit points move
 * from the ∓ on the rail row now, by the DM, who is the only one here who
 * knows what a save was worth.
 */
import type { Attack } from '../../../shared/combat/attacks.ts'
import { formatDice } from '../../../shared/combat/dice.ts'
import { formatMod } from '../../../shared/vault/sheet.ts'
import { es } from '../strings/es.ts'
import type { Combatant } from './combat.ts'

/**
 * `Cimitarra +3 · 1d6+1`, `Manos Ardientes · nivel 1 · CD 13 Destreza · mitad · 3d6`.
 *
 * The level is there because spending the slot is the DM's to do by hand now,
 * and a list that says `3d6` without saying what it costs would be hiding the
 * half that has to be written down.
 */
function subtitle(attack: Attack): string {
  const bits: string[] = []
  if (attack.kind === 'attack' && attack.mod !== null) bits.push(formatMod(attack.mod))
  if (attack.level !== null && attack.level > 0) bits.push(`${es.nivel.toLowerCase()} ${attack.level}`)
  if (attack.save) {
    bits.push(`CD ${attack.save.dc} ${attack.save.ability}`)
    if (attack.save.half) bits.push(es.mitad)
  }
  bits.push(formatDice(attack.dice))
  return bits.join(' · ')
}

export function ActionBar({ actor }: { actor: Combatant }) {
  if (actor.attacks.length === 0) {
    return <div className="act-bar empty">{es.sinAcciones}</div>
  }

  return (
    <div className="act-bar">
      {actor.attacks.map((attack) => (
        <div className="act-item" key={attack.id}>
          <b>{attack.name}</b>
          <span className="muted">{subtitle(attack)}</span>
        </div>
      ))}
    </div>
  )
}

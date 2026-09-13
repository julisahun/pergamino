/** Shared by the server's tests: a partida in memory and a sheet to upload. */
import type { CampaignSession } from './campaign.ts'
import { Db } from './db.ts'
import { Registry } from './registry.ts'
import { Store } from './store.ts'

export const TOLMO = `<?xml version='1.0' encoding='UTF-8'?>
<pc version="5">
 <character>
  <name>Tolmo</name>
  <race><name>Enano</name><speed>30</speed></race>
  <class><name>Guerrero</name><level>1</level><proficiency>0</proficiency><proficiency>103</proficiency></class>
  <item><name>Hacha</name><type>5</type><slot>3</slot><damage1H>1d8</damage1H><text>Ataque +5, daño 1d8 +3 cortante.</text></item>
  <note><text>Enano guerrero de nivel 1 (Guardia).

CA 19 · PG 13 · Iniciativa +2 · Percepción pasiva 14 · Competencia +2</text></note>
  <abilities>17,10,14,8,14,12,</abilities>
  <hpMax>13</hpMax>
 </character>
</pc>`

export const NEL = TOLMO.replace('Tolmo', 'Nel').replace('<hpMax>13</hpMax>', '<hpMax>9</hpMax>')

export function memoryWorld(now: () => number = () => 1_000) {
  const db = new Db(':memory:')
  const store = new Store(db)
  const registry = new Registry(store, now)
  return { db, store, registry }
}

/**
 * A campaign with a mesa sitting at it — the pair a partida is. Tests that
 * only care about one table say `partida(registry)` and get the session back;
 * the ids are there for the ones that open a second campaign for the same
 * group, which is the case the whole design exists for.
 */
export function partida(
  registry: Registry,
  title = 'Marea Baja',
  ids: { campaign?: string; mesa?: string } = {},
): CampaignSession {
  const campaign = registry.registerCampaign(title, ids.campaign)
  const mesa = registry.registerMesa(ids.mesa ? titleOf(ids.mesa) : 'Last', ids.mesa)
  const session = registry.get(campaign.id, mesa.id)!
  // What the console does when it opens one: this is the table now, which is
  // where a phone with the mesa's link lands.
  session.takeTheTable()
  return session
}

const titleOf = (name: string): string => name.charAt(0).toUpperCase() + name.slice(1)

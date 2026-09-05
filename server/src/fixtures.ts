/** Shared by the server's tests: a campaign in memory and a sheet to upload. */
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

/**
 * A small campaign held in memory, for the shells that used to be tested
 * against a temporary directory.
 *
 * It is deliberately a *world* (`campaigns/marea-chica/`), because that is the
 * shape with a run buried two levels down — the one where getting the writable
 * scope wrong would go unnoticed in a flat campaign.
 */
import { CampaignVault } from '../shared/vault/binding.ts'
import { MemoryVault, type MemoryTree } from '../shared/vault/memory.ts'

const monster = (id: string, name: string) =>
  JSON.stringify({ id, name, ac: 12, hpMax: 11, initMod: 1, file: `monsters/${id}.json` })

const scene = (id: string, name: string) =>
  JSON.stringify({ kind: 'dnd-dm-scene', scene: { id, name, art: { src: `assets/${id}.jpg` }, note: `Nota de ${name}.` } })

export const ESTADO = `# Estado de la mesa

## Gente

Quién anda por aquí.

<!-- - [[vann]] — vivo, sesión 1. -->

## Lugares

- [[faro]] — en pie.

## Objetos

## Decisiones

`

export const PLANTILLA = `---
sesion:
fecha:
---

# Sesión N — título

> Plantilla. Se copia y se rellena al cerrar.

## Qué pasó

En pasado y en corto.

## Decisiones

## Cambios de mundo

## Pendiente para la próxima
`

/** A v3 `session.json`, so the migration has something real to chew on. */
export const V3_SESSION = {
  version: 3,
  play: { 'pj-tal': { hp: 7, temp: 0, conditions: [], objects: [] } },
  npcs: [
    {
      id: 'n1',
      name: 'Bandido',
      ac: 12,
      hpMax: 11,
      hp: 11,
      file: 'monsters/bandido.json',
      abilities: [{ id: 'a1', name: 'Cimitarra', desc: '1d6' }],
    },
  ],
  encounter: { on: true, round: 2, members: ['pc:pj-tal', 'npc:n1'], init: {} },
  field: {
    mode: 'tablero',
    cols: 16,
    rows: 9,
    sceneId: 'faro',
    tokens: { 'pc:pj-tal': { x: 1, y: 1 }, 'npc:n1': { x: 4, y: 4 } },
    // v3 keys reveal by bare NPC id — the thing the migration normalises.
    reveal: { n1: { on: true, hp: 'bar' } },
  },
}

export function exampleTree(): MemoryTree {
  return {
    mundo: { 'talasia.md': '# Talasia\n\nEl mundo. Ver [[faro]].\n' },
    campaigns: {
      'marea-chica': {
        monsters: {
          'bandido.json': monster('bandido', 'Bandido'),
          'ossian.json': monster('ossian', 'Ossian'),
        },
        objects: {
          'anillo.json': JSON.stringify({ id: 'obj-anillo', name: 'Anillo', usos: 3 }),
        },
        scenarios: {
          'faro.json': scene('faro', 'El faro'),
          'taberna.json': scene('taberna', 'La taberna'),
        },
        // The shared party. `runs/guils/players/` shadows it by id.
        players: {
          'tal.json': JSON.stringify({ character: { id: 'pj-tal', name: 'Tal (campaña)' } }),
          'nel.json': JSON.stringify({ character: { id: 'pj-nel', name: 'Nel' } }),
        },
        assets: {
          'faro.jpg': new Uint8Array([1, 2, 3]),
          'plano.pdf': new Uint8Array([4, 5]),
          'olas.mp3': new Uint8Array([6]),
          'notas.txt': 'no es un asset del juego',
        },
        story: {
          'README.md': '# Marea Chica\n\n#sequia\n\nEl [[faro]] y [[Ossian]].\n',
          'faro.md': '---\nficha: El faro\n---\n\n# El faro\n\n#lugar\n',
          'ossian.md': '# Ossian\n\n#npc\n',
        },
        runs: {
          'README.md': '# runs/\n\nUna carpeta por mesa.\n',
          guils: {
            'session.json': JSON.stringify(V3_SESSION, null, 2),
            'estado.md': ESTADO,
            bitacora: { '00-plantilla.md': PLANTILLA },
            players: {
              'tal.json': JSON.stringify({ character: { id: 'pj-tal', name: 'Tal' } }),
              'tal-fc5.xml': '<character><hpMax>9</hpMax><level>1</level><abilities>10,16,12,10,10,10</abilities><slots>2,2</slots></character>',
            },
          },
        },
      },
    },
  }
}

export interface MemoryFixture {
  vault: CampaignVault
  memory: MemoryVault
}

export async function openMemoryVault(tree: MemoryTree = exampleTree()): Promise<MemoryFixture> {
  const memory = new MemoryVault(tree)
  const vault = await CampaignVault.open(memory.writableRoot(), { campaign: 'marea-chica' })
  return { vault, memory }
}

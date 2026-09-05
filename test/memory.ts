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

const pnj = (id: string, name: string) =>
  `---\nid: ${id}\nac: 12\nhpMax: 11\ninitMod: 1\nabilities:\n  - name: Cimitarra\n    desc: 1d6\n---\n\n# ${name}\n\n#npc\n\nNota de preparación de ${name}.\n`

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

export function exampleTree(): MemoryTree {
  return {
    mundo: { 'talasia.md': '# Talasia\n\nEl mundo. Ver [[faro]].\n' },
    campaigns: {
      'marea-chica': {
        pnj: {
          'bandido.md': pnj('bandido', 'Bandido'),
          'ossian.md': pnj('ossian', 'Ossian'),
        },
        objects: {
          'anillo.md': '---\nid: obj-anillo\nusos: 3\n---\n\n# Anillo\n\nUn aro de plata.\n',
        },
        scenarios: {
          'faro.json': scene('faro', 'El faro'),
          'taberna.json': scene('taberna', 'La taberna'),
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
        },
        runs: {
          'README.md': '# runs/\n\nUna carpeta por mesa.\n',
          guils: {
            'estado.md': ESTADO,
            bitacora: { '00-plantilla.md': PLANTILLA },
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

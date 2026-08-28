/**
 * The bundled example campaign, as a `MemoryVault`.
 *
 * Dev-only: `?fixture=example` opens the app on this instead of on a folder,
 * because the native directory picker cannot be driven from a script. The
 * production build never imports this module — see `dmStore.start()`.
 */
import { CampaignVault } from '../../../shared/vault/binding.ts'
import { MemoryVault, type MemoryTree } from '../../../shared/vault/memory.ts'
import snapshot from './example.json'

interface Snapshot {
  name: string
  tree: SnapshotTree
}
type SnapshotNode = string | { b64: string } | SnapshotTree
interface SnapshotTree {
  [name: string]: SnapshotNode
}

const decodeB64 = (b64: string): Uint8Array => {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function toTree(node: SnapshotTree): MemoryTree {
  const out: MemoryTree = {}
  for (const [name, child] of Object.entries(node)) {
    if (typeof child === 'string') out[name] = child
    else if (typeof (child as { b64?: string }).b64 === 'string') {
      out[name] = decodeB64((child as { b64: string }).b64)
    } else out[name] = toTree(child as SnapshotTree)
  }
  return out
}

export interface Fixture {
  vault: CampaignVault
  memory: MemoryVault
}

/** A fresh copy each time, so one script's writes cannot leak into the next. */
export async function openFixture(): Promise<Fixture> {
  const data = snapshot as Snapshot
  const memory = new MemoryVault({ [data.name]: toTree(data.tree) })
  // The snapshot is a flat campaign; wrapping it in a folder of its own is
  // what gives the vault a root to be the campaign.
  const root = await memory.writableRoot().createDir(data.name)
  const vault = await CampaignVault.open(root)
  return { vault, memory }
}

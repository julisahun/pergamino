/**
 * The two ends of the asset channel.
 *
 * The DM window reads bytes from the folder it was granted. The table window
 * has no handle at all, so it asks — and only ever for keys the view it was
 * sent actually named. That is the whole of what it can reach.
 */
import type { Pnj, Npc, Portrait } from '../../../shared/types.ts'
import { resolveNpcPortrait } from '../../../shared/session/portraits.ts'
import type { CampaignVault } from '../../../shared/vault/binding.ts'
import type { TableTransport } from '../transport/index.ts'
import type { AssetSource } from './cache.ts'
import { decodeDataUri, parseKey, typed } from './keys.ts'

export interface PortraitLookup {
  npcs: () => Npc[]
  pnjs: () => Map<string, Pnj>
  pcPortrait: (id: string) => Portrait | null | undefined
}

/** DM side: the vault, plus the portraits that live inside the session data. */
export class VaultAssetSource implements AssetSource {
  constructor(
    private vault: CampaignVault,
    private portraits: PortraitLookup,
  ) {}

  async blobFor(key: string): Promise<Blob | null> {
    const parsed = parseKey(key)
    if (!parsed) return null
    if (parsed.kind === 'vault') return this.#fromVault(parsed.path)

    const portrait =
      parsed.who === 'pc'
        ? this.portraits.pcPortrait(parsed.id)
        : resolveNpcPortrait(
            this.portraits.npcs().find((n) => n.id === parsed.id) ?? {
              id: parsed.id,
              file: '',
              portrait: null,
            },
            this.portraits.pnjs(),
          )
    if (!portrait) return null
    // The vault stores portraits inline as `data:` URIs; some point at a file.
    if (portrait.stamp) {
      const blob = decodeDataUri(portrait.stamp)
      if (blob) return blob
    }
    return portrait.src ? this.#fromVault(portrait.src) : null
  }

  async #fromVault(path: string): Promise<Blob | null> {
    const file = await this.vault.asset(path)
    return file ? typed(await file.blob(), path) : null
  }
}

/** Table side: ask the DM window, and wait for the answer. */
export class TransportAssetSource implements AssetSource {
  #waiting = new Map<string, ((blob: Blob | null) => void)[]>()
  #off: () => void

  constructor(
    private transport: TableTransport,
    private timeoutMs = 8000,
  ) {
    this.#off = transport.subscribe((msg) => {
      if (msg.type !== 'asset') return
      const waiters = this.#waiting.get(msg.key)
      if (!waiters) return
      this.#waiting.delete(msg.key)
      for (const resolve of waiters) resolve(msg.blob)
    })
  }

  blobFor(key: string): Promise<Blob | null> {
    return new Promise((resolve) => {
      const waiters = this.#waiting.get(key)
      if (waiters) {
        waiters.push(resolve)
        return
      }
      this.#waiting.set(key, [resolve])
      this.transport.need(key)
      // A DM window that is closed or busy must not leave the screen hanging
      // on a promise that never settles.
      setTimeout(() => {
        const still = this.#waiting.get(key)
        if (!still) return
        this.#waiting.delete(key)
        for (const fn of still) fn(null)
      }, this.timeoutMs)
    })
  }

  close(): void {
    this.#off()
    this.#waiting.clear()
  }
}

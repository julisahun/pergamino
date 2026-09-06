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
  #fallback: AssetSource | null = null

  constructor(
    private vault: CampaignVault,
    private portraits: PortraitLookup,
  ) {}

  /**
   * Where to ask when the folder has nothing.
   *
   * A player's own face is the one portrait the vault can never answer for: it
   * arrives as an upload and lives in the server's `character` row, so the
   * `src` the row names — `pc/<id>` — is a row key and not a path. The console
   * holds the players' link, so it can ask the endpoint the phones ask.
   */
  setFallback(source: AssetSource | null): void {
    this.#fallback = source
  }

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
    // The vault stores portraits inline as `data:` URIs; some point at a file.
    if (portrait?.stamp) {
      const blob = decodeDataUri(portrait.stamp)
      if (blob) return blob
    }
    const fromVault = portrait?.src ? await this.#fromVault(portrait.src) : null
    return fromVault ?? (await this.#fallback?.blobFor(key)) ?? null
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

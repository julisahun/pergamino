/**
 * Bytes for a player's phone: a portrait by key, fetched through the link.
 *
 * The keys are the ones every projection names — `/api/portrait/pc/<id>` —
 * and a `/vault/…` key resolves to nothing here, because scene art never
 * reaches the server. The browser caches what the server ETags.
 */
import type { AssetSource } from './cache.ts'
import { parseKey } from './keys.ts'

export class HttpAssetSource implements AssetSource {
  constructor(private readonly link: string) {}

  async blobFor(key: string): Promise<Blob | null> {
    const parsed = parseKey(key)
    if (!parsed || parsed.kind !== 'portrait') return null
    const url = `/api/pj/${encodeURIComponent(this.link)}/portrait/${parsed.who}/${encodeURIComponent(parsed.id)}`
    try {
      const res = await fetch(url)
      return res.ok ? await res.blob() : null
    } catch {
      return null
    }
  }
}

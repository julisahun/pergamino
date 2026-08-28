/**
 * `key → objectURL`, resolved once and held.
 *
 * Both windows have one of these. On the DM side the source reads the
 * directory handle; on the table side it asks the DM window over the
 * transport. Components do not know which — they call `useAsset(key)` and get
 * a URL when there is one.
 */
import { useEffect, useState } from 'react'

export interface AssetSource {
  /** The bytes behind a key, or null when there are none. */
  blobFor(key: string): Promise<Blob | null>
}

type Listener = (url: string | null) => void

export class AssetCache {
  #source: AssetSource | null = null
  #urls = new Map<string, string | null>()
  #pending = new Map<string, Promise<string | null>>()
  #listeners = new Map<string, Set<Listener>>()

  /** Swap the source — a new vault, or a table window that reconnected. */
  setSource(source: AssetSource | null): void {
    this.#source = source
    this.clear()
  }

  /** Forget everything, revoking the URLs the browser is holding open. */
  clear(): void {
    for (const url of this.#urls.values()) if (url) URL.revokeObjectURL(url)
    this.#urls.clear()
    this.#pending.clear()
    for (const [key, set] of this.#listeners) {
      for (const fn of set) fn(null)
      if (set.size === 0) this.#listeners.delete(key)
    }
  }

  /** What we already have, without asking for it. */
  peek(key: string | null): string | null {
    return key ? (this.#urls.get(key) ?? null) : null
  }

  /** Push bytes in from outside — how the table side answers its own requests. */
  put(key: string, blob: Blob | null): void {
    const previous = this.#urls.get(key)
    if (previous) URL.revokeObjectURL(previous)
    const url = blob ? URL.createObjectURL(blob) : null
    this.#urls.set(key, url)
    this.#pending.delete(key)
    this.#emit(key, url)
  }

  async resolve(key: string): Promise<string | null> {
    const known = this.#urls.get(key)
    if (known !== undefined) return known
    const inflight = this.#pending.get(key)
    if (inflight) return inflight

    const source = this.#source
    if (!source) return null
    const promise = source
      .blobFor(key)
      .catch(() => null)
      .then((blob) => {
        // `put` may already have run — a table window's answer arriving first.
        if (this.#urls.has(key)) return this.#urls.get(key) ?? null
        const url = blob ? URL.createObjectURL(blob) : null
        this.#urls.set(key, url)
        this.#pending.delete(key)
        this.#emit(key, url)
        return url
      })
    this.#pending.set(key, promise)
    return promise
  }

  subscribe(key: string, fn: Listener): () => void {
    const set = this.#listeners.get(key) ?? new Set<Listener>()
    set.add(fn)
    this.#listeners.set(key, set)
    return () => {
      set.delete(fn)
      if (set.size === 0) this.#listeners.delete(key)
    }
  }

  #emit(key: string, url: string | null): void {
    for (const fn of this.#listeners.get(key) ?? []) fn(url)
  }
}

/**
 * The URL for an asset key, resolving it on first use.
 *
 * Returns null while it is being read, and stays null when there is nothing
 * behind the key — every caller already had a fallback for missing art.
 */
export function useAsset(cache: AssetCache, key: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(() => cache.peek(key ?? null))

  useEffect(() => {
    if (!key) {
      setUrl(null)
      return
    }
    let live = true
    setUrl(cache.peek(key))
    const off = cache.subscribe(key, (next) => {
      if (live) setUrl(next)
    })
    void cache.resolve(key).then((next) => {
      if (live) setUrl(next)
    })
    return () => {
      live = false
      off()
    }
  }, [cache, key])

  return url
}

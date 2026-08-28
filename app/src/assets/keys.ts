/**
 * Asset keys.
 *
 * `projectTable` names the things a view refers to as `/vault/assets/faro.jpg`
 * and `/api/portrait/npc/<id>`. Those used to be URLs a server answered. They
 * are now *names*: the DM window resolves one against its directory handle,
 * and the table window asks for it over the transport. The strings kept their
 * shape because the projection is asserted against them, and because a name
 * the table cannot turn into a path of its own is exactly what we want.
 */

export type AssetKey =
  | { kind: 'vault'; path: string }
  | { kind: 'portrait'; who: 'npc' | 'pc'; id: string }

const VAULT = '/vault/'
const PORTRAIT = /^\/api\/portrait\/(npc|pc)\/(.+)$/

export function parseKey(key: string): AssetKey | null {
  if (key.startsWith(VAULT)) {
    const path = decodeURIComponent(key.slice(VAULT.length))
    return path ? { kind: 'vault', path } : null
  }
  const m = PORTRAIT.exec(key)
  if (m) return { kind: 'portrait', who: m[1] as 'npc' | 'pc', id: decodeURIComponent(m[2]!) }
  return null
}

/** `data:image/jpeg;base64,…` → a Blob, or null when it is not one. */
export function decodeDataUri(uri: string): Blob | null {
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(uri)
  if (!m) return null
  try {
    const binary = atob(m[2]!)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new Blob([bytes], { type: m[1]! })
  } catch {
    return null
  }
}

const MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
}

/**
 * A `File` from a directory handle usually carries a type already; a `Blob`
 * built from bytes does not, and an `<iframe>` showing a PDF or an `<audio>`
 * playing an mp3 both care.
 */
export function typed(blob: Blob, path: string): Blob {
  if (blob.type) return blob
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  const type = MIME[ext]
  return type ? blob.slice(0, blob.size, type) : blob
}

/** Every asset key a view names, so the table can fetch them up front. */
export function keysOf(view: {
  scene: { artUrl: string | null } | null
  map: { src: string } | null
  audio: { src: string } | null
  handout: { src: string } | null
  combatants: { portrait: string | null }[]
}): string[] {
  const keys = [
    view.scene?.artUrl,
    view.map?.src,
    view.audio?.src,
    view.handout?.src,
    ...view.combatants.map((c) => c.portrait),
  ]
  return [...new Set(keys.filter((k): k is string => Boolean(k) && parseKey(k!) !== null))]
}

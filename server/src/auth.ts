/**
 * Who is asking.
 *
 * Two credentials and no accounts: the DM's bearer token from `.env`, and a
 * campaign's link secret, which is what a player has. A link says which
 * campaign; which character is the player's own claim, made in `hello`.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage } from 'node:http'

export function randomSecret(): string {
  return randomBytes(15).toString('base64url')
}

export function tokenMatches(given: string | undefined, expected: string): boolean {
  if (!given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** The bearer token on a request, if any. */
export function bearer(req: IncomingMessage): string | undefined {
  const header = req.headers.authorization
  if (!header) return undefined
  const m = /^Bearer\s+(.+)$/i.exec(header)
  return m ? m[1]!.trim() : undefined
}

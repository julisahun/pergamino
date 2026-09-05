/** Every campaign the server knows, loaded on first use. */
import { randomUUID } from 'node:crypto'
import { CampaignSession } from './campaign.ts'
import { randomSecret } from './auth.ts'
import type { Store } from './store.ts'

export class Registry {
  readonly #open = new Map<string, CampaignSession>()
  readonly #store: Store
  readonly #now: () => number

  constructor(store: Store, now: () => number = Date.now) {
    this.#store = store
    this.#now = now
  }
  private get store(): Store {
    return this.#store
  }
  private get now(): () => number {
    return this.#now
  }

  get(id: string): CampaignSession | null {
    const open = this.#open.get(id)
    if (open) return open
    const session = CampaignSession.load(this.store, id, this.now)
    if (session) this.#open.set(id, session)
    return session
  }

  byLink(secret: string): CampaignSession | null {
    const row = this.store.campaignByLink(secret)
    return row ? this.get(row.id) : null
  }

  list(): CampaignSession[] {
    return this.store.campaigns().map((row) => this.get(row.id)!)
  }

  /**
   * A new campaign: a fresh id, or the one the console already holds in
   * `.pergamino/` — and, after a wiped database, the DM secret it holds too, so
   * the folder goes on being the credential. The caller has checked the secret
   * when the id is already here; this only updates the title.
   */
  register(title: string, id: string = randomUUID(), dmSecret: string = randomSecret()): CampaignSession {
    const existing = this.get(id)
    if (existing) {
      if (title && title !== existing.title) existing.setTitle(title)
      return existing
    }
    this.store.insertCampaign({
      id,
      title: title || id,
      link_secret: randomSecret(),
      dm_secret: dmSecret,
      created_at: this.now(),
    })
    return this.get(id)!
  }

  delete(id: string): void {
    this.store.deleteCampaign(id)
    this.#open.delete(id)
  }
}

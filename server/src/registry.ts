/**
 * Every partida the server knows, loaded on first use.
 *
 * A partida is a **mesa at a campaign**, so that pair is the key. The same
 * mesa opens as many partidas as campaigns it plays, and they all share its
 * party and its live layer — which is the whole point: the group is the thing
 * that lasts, the adventure is what it happens to be playing.
 */
import { randomUUID } from 'node:crypto'
import { CampaignSession } from './campaign.ts'
import { randomSecret } from './auth.ts'
import type { PrepBody } from '../../shared/protocol.ts'
import type { CampaignRow, MesaRow, Store } from './store.ts'

const key = (campaign: string, mesa: string): string => `${campaign}::${mesa}`

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

  get(campaign: string, mesa: string): CampaignSession | null {
    const open = this.#open.get(key(campaign, mesa))
    if (open) return open
    const session = CampaignSession.load(this.store, campaign, mesa, this.now)
    if (session) this.#open.set(key(campaign, mesa), session)
    return session
  }

  /**
   * What a player's link opens: their mesa, at whatever campaign it has on the
   * table. The link belongs to the group, so it goes on working when the group
   * starts something new — the phone follows them.
   */
  byLink(secret: string): CampaignSession | null {
    const mesa = this.store.mesaByLink(secret)
    if (!mesa?.playing) return null
    return this.get(mesa.playing, mesa.id)
  }

  campaign(id: string): CampaignRow | undefined {
    return this.store.campaign(id)
  }

  campaigns(): CampaignRow[] {
    return this.store.campaigns()
  }

  mesa(id: string): MesaRow | undefined {
    return this.store.mesa(id)
  }

  mesas(): MesaRow[] {
    return this.store.mesas()
  }

  /**
   * A new campaign: a fresh id, or the one the console already holds in
   * `.pergamino/` — and, after a wiped database, the DM secret it holds too, so
   * the folder goes on being the credential. The caller has checked the secret
   * when the id is already here; this only updates the title.
   */
  registerCampaign(
    title: string,
    id: string = randomUUID(),
    dmSecret: string = randomSecret(),
  ): CampaignRow {
    const existing = this.store.campaign(id)
    if (existing) {
      if (title && title !== existing.title) {
        this.store.setTitle(id, title)
        for (const session of this.#open.values()) if (session.id === id) session.setTitle(title)
        return { ...existing, title }
      }
      return existing
    }
    this.store.insertCampaign({ id, title: title || id, dm_secret: dmSecret, created_at: this.now() })
    return this.store.campaign(id)!
  }

  /**
   * A new mesa, or the one the console holds in `partidas/<mesa>/.pergamino/`.
   * It is minted with its own link, which is what the players get and what
   * follows them from campaign to campaign.
   */
  registerMesa(title: string, id: string = randomUUID()): MesaRow {
    const existing = this.store.mesa(id)
    if (existing) {
      if (title && title !== existing.title) {
        this.store.setMesaTitle(id, title)
        return { ...existing, title }
      }
      return existing
    }
    this.store.insertMesa({
      id,
      title: title || id,
      link_secret: randomSecret(),
      playing: null,
      created_at: this.now(),
    })
    return this.store.mesa(id)!
  }

  /**
   * Prep, published once for the campaign and handed to every mesa at it.
   * Returns the revision of the partida that asked, which is the one the
   * console is waiting on.
   */
  setPrep(campaign: string, prep: PrepBody, asking: string): number {
    const now = this.now()
    this.store.setPrep(campaign, prep, now)
    let rev = 0
    for (const session of this.#open.values()) {
      if (session.id !== campaign) continue
      const bumped = session.adoptPrep(prep, now)
      if (session.mesaId === asking) rev = bumped
    }
    return rev
  }

  /** A new DM secret; the console rewrites `.pergamino/campaign.json` with it. */
  rotateDmSecret(campaign: string): string {
    const secret = randomSecret()
    this.store.setDmSecret(campaign, secret)
    for (const session of this.#open.values()) {
      if (session.id === campaign) session.adoptDmSecret(secret)
    }
    return secret
  }

  deleteCampaign(id: string): void {
    this.store.deleteCampaign(id)
    for (const k of [...this.#open.keys()]) if (k.startsWith(`${id}::`)) this.#open.delete(k)
  }

  deleteMesa(id: string): void {
    this.store.deleteMesa(id)
    for (const k of [...this.#open.keys()]) if (k.endsWith(`::${id}`)) this.#open.delete(k)
  }
}

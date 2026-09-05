/**
 * Rows, typed. Nothing here decides anything; `CampaignSession` does.
 */
import type { Character, SessionState } from '../../shared/types.ts'
import type { PrepBody } from '../../shared/protocol.ts'
import type { Db } from './db.ts'

export interface CampaignRow {
  id: string
  title: string
  link_secret: string
  /** The DM's credential for this campaign alone; `.pergamino/campaign.json` holds the copy. */
  dm_secret: string
  created_at: number
}

export interface CharacterRow {
  id: string
  campaign: string
  name: string
  player: string
  sheet_xml: string
  portrait_mime: string | null
  portrait: Uint8Array | null
  created_at: number
  updated_at: number
}

export interface PortraitRow {
  mime: string
  bytes: Uint8Array
  etag: string
}

export const toCharacter = (row: CharacterRow): Character => ({
  id: row.id,
  name: row.name,
  player: row.player,
  portrait: row.portrait ? { src: `pc/${row.id}`, stamp: null } : null,
})

export class Store {
  readonly #db: Db
  constructor(db: Db) {
    this.#db = db
  }
  private get db(): Db {
    return this.#db
  }

  // --- campaigns --------------------------------------------------------------

  campaigns(): CampaignRow[] {
    return this.db.all<CampaignRow>('SELECT * FROM campaign ORDER BY created_at')
  }

  campaign(id: string): CampaignRow | undefined {
    return this.db.get<CampaignRow>('SELECT * FROM campaign WHERE id = ?', id)
  }

  campaignByLink(secret: string): CampaignRow | undefined {
    return this.db.get<CampaignRow>('SELECT * FROM campaign WHERE link_secret = ?', secret)
  }

  insertCampaign(row: CampaignRow): void {
    this.db.run(
      'INSERT INTO campaign (id, title, link_secret, dm_secret, created_at) VALUES (?, ?, ?, ?, ?)',
      row.id,
      row.title,
      row.link_secret,
      row.dm_secret,
      row.created_at,
    )
  }

  setTitle(id: string, title: string): void {
    this.db.run('UPDATE campaign SET title = ? WHERE id = ?', title, id)
  }

  setLink(id: string, secret: string): void {
    this.db.run('UPDATE campaign SET link_secret = ? WHERE id = ?', secret, id)
  }

  setDmSecret(id: string, secret: string): void {
    this.db.run('UPDATE campaign SET dm_secret = ? WHERE id = ?', secret, id)
  }

  deleteCampaign(id: string): void {
    this.db.run('DELETE FROM campaign WHERE id = ?', id)
  }

  // --- characters -------------------------------------------------------------

  characters(campaign: string): CharacterRow[] {
    return this.db.all<CharacterRow>(
      'SELECT * FROM character WHERE campaign = ? ORDER BY created_at, id',
      campaign,
    )
  }

  character(id: string): CharacterRow | undefined {
    return this.db.get<CharacterRow>('SELECT * FROM character WHERE id = ?', id)
  }

  insertCharacter(row: Omit<CharacterRow, 'portrait_mime' | 'portrait'>): void {
    this.db.run(
      `INSERT INTO character (id, campaign, name, player, sheet_xml, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      row.id,
      row.campaign,
      row.name,
      row.player,
      row.sheet_xml,
      row.created_at,
      row.updated_at,
    )
  }

  setSheet(id: string, xml: string, name: string, now: number): void {
    this.db.run(
      'UPDATE character SET sheet_xml = ?, name = ?, updated_at = ? WHERE id = ?',
      xml,
      name,
      now,
      id,
    )
  }

  setPortrait(id: string, mime: string, bytes: Uint8Array, now: number): void {
    this.db.run(
      'UPDATE character SET portrait_mime = ?, portrait = ?, updated_at = ? WHERE id = ?',
      mime,
      bytes,
      now,
      id,
    )
  }

  deleteCharacter(id: string): void {
    this.db.run('DELETE FROM character WHERE id = ?', id)
  }

  // --- prep -------------------------------------------------------------------

  prep(campaign: string): { prep: PrepBody; publishedAt: number } | null {
    const row = this.db.get<{ pnjs: string; objects: string; scenes: string; published_at: number }>(
      'SELECT pnjs, objects, scenes, published_at FROM prep WHERE campaign = ?',
      campaign,
    )
    if (!row) return null
    return {
      prep: {
        pnjs: JSON.parse(row.pnjs),
        objects: JSON.parse(row.objects),
        scenes: JSON.parse(row.scenes),
      },
      publishedAt: row.published_at,
    }
  }

  setPrep(campaign: string, prep: PrepBody, now: number): void {
    this.db.run(
      `INSERT INTO prep (campaign, pnjs, objects, scenes, published_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(campaign) DO UPDATE SET pnjs = excluded.pnjs, objects = excluded.objects,
         scenes = excluded.scenes, published_at = excluded.published_at`,
      campaign,
      JSON.stringify(prep.pnjs),
      JSON.stringify(prep.objects),
      JSON.stringify(prep.scenes),
      now,
    )
  }

  pnjPortrait(campaign: string, pnj: string): PortraitRow | undefined {
    return this.db.get<PortraitRow>(
      'SELECT mime, bytes, etag FROM pnj_portrait WHERE campaign = ? AND pnj = ?',
      campaign,
      pnj,
    )
  }

  setPnjPortrait(campaign: string, pnj: string, row: PortraitRow): void {
    this.db.run(
      `INSERT INTO pnj_portrait (campaign, pnj, mime, bytes, etag) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(campaign, pnj) DO UPDATE SET mime = excluded.mime, bytes = excluded.bytes, etag = excluded.etag`,
      campaign,
      pnj,
      row.mime,
      row.bytes,
      row.etag,
    )
  }

  // --- live state -------------------------------------------------------------

  session(campaign: string): { rev: number; state: SessionState } | null {
    const row = this.db.get<{ rev: number; state: string }>(
      'SELECT rev, state FROM session WHERE campaign = ?',
      campaign,
    )
    return row ? { rev: row.rev, state: JSON.parse(row.state) as SessionState } : null
  }

  /** The state and the action that produced it, in one transaction. */
  saveSession(
    campaign: string,
    rev: number,
    state: SessionState,
    actor: string,
    action: unknown,
    now: number,
  ): void {
    this.db.transaction(() => {
      this.db.run(
        `INSERT INTO session (campaign, rev, state, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(campaign) DO UPDATE SET rev = excluded.rev, state = excluded.state, updated_at = excluded.updated_at`,
        campaign,
        rev,
        JSON.stringify(state),
        now,
      )
      this.db.run(
        'INSERT OR REPLACE INTO action_log (campaign, rev, at, actor, action) VALUES (?, ?, ?, ?, ?)',
        campaign,
        rev,
        now,
        actor,
        JSON.stringify(action),
      )
    })
  }

  archiveSession(campaign: string, now: number): void {
    this.db.run(
      `INSERT INTO session_archive (campaign, archived_at, rev, state)
       SELECT campaign, ?, rev, state FROM session WHERE campaign = ?`,
      now,
      campaign,
    )
  }

  log(campaign: string, since: number): { rev: number; at: number; actor: string; action: unknown }[] {
    return this.db
      .all<{ rev: number; at: number; actor: string; action: string }>(
        'SELECT rev, at, actor, action FROM action_log WHERE campaign = ? AND rev > ? ORDER BY rev',
        campaign,
        since,
      )
      .map((r) => ({ ...r, action: JSON.parse(r.action) as unknown }))
  }

  /** Keep the last `keep` entries per campaign; the state itself is the truth. */
  pruneLog(keep = 5000): void {
    for (const { id } of this.campaigns()) {
      const top = this.db.get<{ rev: number }>('SELECT rev FROM session WHERE campaign = ?', id)
      if (top) this.db.run('DELETE FROM action_log WHERE campaign = ? AND rev < ?', id, top.rev - keep)
    }
  }
}

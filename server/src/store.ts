/**
 * Rows, typed. Nothing here decides anything; `Partida` does.
 *
 * Two owners, not one. A **campaign** owns the prep and the DM's credential; a
 * **mesa** owns the party, the players' link and the live layer of each PJ —
 * because a group outlives the adventure it is playing. What belongs to the
 * pair of them is the `partida`: the NPCs on the table, the encounter, the
 * scene, the log. `savePartida` is where a `SessionState` is cut along that
 * seam and `partida()` is where it is sewn back together; nothing above this
 * file ever sees the halves.
 */
import type { Character, LiveState, SessionState } from '../../shared/types.ts'
import type { PrepBody } from '../../shared/protocol.ts'
import type { Db } from './db.ts'

export interface CampaignRow {
  id: string
  title: string
  /** The DM's credential for this campaign alone; `.pergamino/campaign.json` holds the copy. */
  dm_secret: string
  created_at: number
}

export interface MesaRow {
  id: string
  title: string
  /** What a player has. It follows the group from one campaign to the next. */
  link_secret: string
  /** The campaign this mesa has on the table, so a phone can find its partida. */
  playing: string | null
  created_at: number
}

export interface CharacterRow {
  id: string
  mesa: string
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

  insertCampaign(row: CampaignRow): void {
    this.db.run(
      'INSERT INTO campaign (id, title, dm_secret, created_at) VALUES (?, ?, ?, ?)',
      row.id,
      row.title,
      row.dm_secret,
      row.created_at,
    )
  }

  setTitle(id: string, title: string): void {
    this.db.run('UPDATE campaign SET title = ? WHERE id = ?', title, id)
  }

  setDmSecret(id: string, secret: string): void {
    this.db.run('UPDATE campaign SET dm_secret = ? WHERE id = ?', secret, id)
  }

  deleteCampaign(id: string): void {
    this.db.run('DELETE FROM campaign WHERE id = ?', id)
  }

  // --- mesas ------------------------------------------------------------------

  mesas(): MesaRow[] {
    return this.db.all<MesaRow>('SELECT * FROM mesa ORDER BY created_at')
  }

  mesa(id: string): MesaRow | undefined {
    return this.db.get<MesaRow>('SELECT * FROM mesa WHERE id = ?', id)
  }

  mesaByLink(secret: string): MesaRow | undefined {
    return this.db.get<MesaRow>('SELECT * FROM mesa WHERE link_secret = ?', secret)
  }

  insertMesa(row: MesaRow): void {
    this.db.run(
      'INSERT INTO mesa (id, title, link_secret, playing, created_at) VALUES (?, ?, ?, ?, ?)',
      row.id,
      row.title,
      row.link_secret,
      row.playing,
      row.created_at,
    )
  }

  setMesaTitle(id: string, title: string): void {
    this.db.run('UPDATE mesa SET title = ? WHERE id = ?', title, id)
  }

  setMesaLink(id: string, secret: string): void {
    this.db.run('UPDATE mesa SET link_secret = ? WHERE id = ?', secret, id)
  }

  /** What this mesa has on the table now — the campaign a phone with its link lands in. */
  setPlaying(id: string, campaign: string): void {
    this.db.run('UPDATE mesa SET playing = ? WHERE id = ?', campaign, id)
  }

  deleteMesa(id: string): void {
    this.db.run('DELETE FROM mesa WHERE id = ?', id)
  }

  // --- characters -------------------------------------------------------------

  characters(mesa: string): CharacterRow[] {
    return this.db.all<CharacterRow>(
      'SELECT * FROM character WHERE mesa = ? ORDER BY created_at, id',
      mesa,
    )
  }

  character(id: string): CharacterRow | undefined {
    return this.db.get<CharacterRow>('SELECT * FROM character WHERE id = ?', id)
  }

  insertCharacter(row: Omit<CharacterRow, 'portrait_mime' | 'portrait'>): void {
    this.db.run(
      `INSERT INTO character (id, mesa, name, player, sheet_xml, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      row.id,
      row.mesa,
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

  /**
   * What the party has on it: PG, oro, inventario, objetos, espacios. Theirs,
   * not the campaign's, so it lives here and not in the partida — and so it is
   * still there when the same people sit down to the next adventure.
   */
  play(mesa: string): Record<string, LiveState> {
    const row = this.db.get<{ play: string }>('SELECT play FROM mesa_play WHERE mesa = ?', mesa)
    return row ? (JSON.parse(row.play) as Record<string, LiveState>) : {}
  }

  /** The session, sewn back together: the table's half plus the party's. */
  partida(campaign: string, mesa: string): { rev: number; state: SessionState } | null {
    const row = this.db.get<{ rev: number; state: string }>(
      'SELECT rev, state FROM partida WHERE campaign = ? AND mesa = ?',
      campaign,
      mesa,
    )
    if (!row) return null
    const table = JSON.parse(row.state) as SessionState
    return { rev: row.rev, state: { ...table, play: this.play(mesa) } }
  }

  /** The state and the action that produced it, in one transaction. */
  savePartida(
    campaign: string,
    mesa: string,
    rev: number,
    state: SessionState,
    actor: string,
    action: unknown,
    now: number,
  ): void {
    const { play, ...table } = state
    this.db.transaction(() => {
      this.db.run(
        `INSERT INTO partida (campaign, mesa, rev, state, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(campaign, mesa) DO UPDATE SET rev = excluded.rev, state = excluded.state, updated_at = excluded.updated_at`,
        campaign,
        mesa,
        rev,
        JSON.stringify(table),
        now,
      )
      this.db.run(
        `INSERT INTO mesa_play (mesa, play, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(mesa) DO UPDATE SET play = excluded.play, updated_at = excluded.updated_at`,
        mesa,
        JSON.stringify(play),
        now,
      )
      this.db.run(
        'INSERT OR REPLACE INTO action_log (campaign, mesa, rev, at, actor, action) VALUES (?, ?, ?, ?, ?, ?)',
        campaign,
        mesa,
        rev,
        now,
        actor,
        JSON.stringify(action),
      )
    })
  }

  /**
   * Put this partida away. Only the table's half is archived: what the players
   * carry is not something a new session undoes, so `mesa_play` is left alone.
   */
  archivePartida(campaign: string, mesa: string, now: number): void {
    this.db.run(
      `INSERT INTO session_archive (campaign, mesa, archived_at, rev, state)
       SELECT campaign, mesa, ?, rev, state FROM partida WHERE campaign = ? AND mesa = ?`,
      now,
      campaign,
      mesa,
    )
  }

  log(
    campaign: string,
    mesa: string,
    since: number,
  ): { rev: number; at: number; actor: string; action: unknown }[] {
    return this.db
      .all<{ rev: number; at: number; actor: string; action: string }>(
        'SELECT rev, at, actor, action FROM action_log WHERE campaign = ? AND mesa = ? AND rev > ? ORDER BY rev',
        campaign,
        mesa,
        since,
      )
      .map((r) => ({ ...r, action: JSON.parse(r.action) as unknown }))
  }

  /** Keep the last `keep` entries per partida; the state itself is the truth. */
  pruneLog(keep = 5000): void {
    for (const row of this.db.all<{ campaign: string; mesa: string; rev: number }>(
      'SELECT campaign, mesa, rev FROM partida',
    )) {
      this.db.run(
        'DELETE FROM action_log WHERE campaign = ? AND mesa = ? AND rev < ?',
        row.campaign,
        row.mesa,
        row.rev - keep,
      )
    }
  }
}

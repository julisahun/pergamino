/**
 * The link between the DM window and the table window.
 *
 * Today the two are windows on the same machine, so they talk over a
 * `BroadcastChannel` — same origin, no network hop, and nothing to configure.
 * The interface exists so that stops being an assumption: a relay for a table
 * screen in another room fills the same four methods, and no panel changes.
 *
 * The boundary keeps the meaning it had when a server sat here. The table
 * window has no directory handle, so it cannot read the vault even in
 * principle — a stronger guarantee than the old server, which at least had a
 * `/vault/*` route. What crosses is `TableView` (already stripped of stat
 * blocks, DM notes and unrevealed combatants by `projectTable`) plus the blobs
 * of the assets that view names, on request.
 */
import type { TableView } from '../../../shared/types.ts'

/** Sent by the DM window. */
export type DmMessage =
  | { type: 'view'; view: TableView }
  /** Answer to a `need`. `blob` is null when the DM could not read the file. */
  | { type: 'asset'; key: string; blob: Blob | null }
  /** The DM window is here; a table that was waiting can ask again. */
  | { type: 'hello' }

/** Sent by the table window. */
export type TableMessage =
  | { type: 'need'; key: string }
  /** A table window opened or reloaded and has nothing to show. */
  | { type: 'join' }

export type TransportMessage = DmMessage | TableMessage

export interface TableTransport {
  /** DM side: push the current projection. */
  publish(view: TableView): void
  /** DM side: answer requests for asset bytes. */
  onNeed(fn: (key: string) => void): () => void
  /** DM side: hand over the bytes for a key. */
  sendAsset(key: string, blob: Blob | null): void

  /** Table side: ask for an asset the view named. */
  need(key: string): void
  /** Table side: say a window is here and wants the current frame. */
  join(): void

  /** Both sides: everything arriving on the channel. */
  subscribe(fn: (msg: TransportMessage) => void): () => void

  close(): void
}

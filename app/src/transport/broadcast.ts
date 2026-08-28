/**
 * `BroadcastChannel` — two windows of the same origin, on the same machine.
 *
 * Blobs go across as-is: the structured clone algorithm carries them, so the
 * scene art never becomes base64 on the way. Portraits stop riding inline in
 * the projection for the same reason — they are a key the table asks for once
 * and then caches.
 */
import type { DmMessage, TableMessage, TableTransport, TransportMessage } from './index.ts'
import type { TableView } from '../../../shared/types.ts'

const CHANNEL = 'pantalla-dm'

export class BroadcastChannelTransport implements TableTransport {
  #channel: BroadcastChannel
  #listeners = new Set<(msg: TransportMessage) => void>()

  constructor(channel = CHANNEL) {
    this.#channel = new BroadcastChannel(channel)
    this.#channel.onmessage = (ev: MessageEvent<TransportMessage>) => {
      for (const fn of this.#listeners) fn(ev.data)
    }
  }

  publish(view: TableView): void {
    this.#post({ type: 'view', view })
  }

  sendAsset(key: string, blob: Blob | null): void {
    this.#post({ type: 'asset', key, blob })
  }

  onNeed(fn: (key: string) => void): () => void {
    return this.subscribe((msg) => {
      if (msg.type === 'need') fn(msg.key)
    })
  }

  need(key: string): void {
    this.#post({ type: 'need', key })
  }

  join(): void {
    this.#post({ type: 'join' })
  }

  subscribe(fn: (msg: TransportMessage) => void): () => void {
    this.#listeners.add(fn)
    return () => this.#listeners.delete(fn)
  }

  close(): void {
    this.#listeners.clear()
    this.#channel.close()
  }

  #post(msg: DmMessage | TableMessage): void {
    this.#channel.postMessage(msg)
  }
}

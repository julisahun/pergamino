/**
 * Table screen state: nothing but the projection the DM window sends.
 *
 * This window has no directory handle. It cannot read the vault even in
 * principle — it holds a `TableView` and a cache of the blobs it asked for by
 * the keys that view named, and there is no other door.
 */
import { create } from 'zustand'
import type { TableView } from '../../../shared/types.ts'
import { AssetCache } from '../assets/cache.ts'
import { keysOf } from '../assets/keys.ts'
import { TransportAssetSource } from '../assets/sources.ts'
import { BroadcastChannelTransport } from '../transport/broadcast.ts'
import type { TableTransport } from '../transport/index.ts'

/** Whether a DM window has been heard from. */
export type LinkStatus = 'esperando' | 'en-directo'

export const tableAssets = new AssetCache()

let transport: TableTransport | null = null

interface TableStore {
  status: LinkStatus
  view: TableView | null
  start: () => void
}

export const useTable = create<TableStore>((set) => ({
  status: 'esperando',
  view: null,
  start: () => {
    if (transport) return
    const channel = new BroadcastChannelTransport()
    transport = channel
    tableAssets.setSource(new TransportAssetSource(channel))

    channel.subscribe((msg) => {
      if (msg.type === 'view') {
        set({ view: msg.view, status: 'en-directo' })
        // Warm the cache for everything the frame refers to, so a scene change
        // does not show a blank screen while the bytes come across.
        for (const key of keysOf(msg.view)) void tableAssets.resolve(key)
      } else if (msg.type === 'asset') {
        tableAssets.put(msg.key, msg.blob)
      } else if (msg.type === 'hello') {
        channel.join()
      }
    })

    // Say we are here: a DM window that is already running answers with the
    // current frame, and one that is not will when it starts.
    channel.join()
  },
}))

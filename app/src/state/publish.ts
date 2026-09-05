/**
 * What the folder sends the server, and how little that is.
 *
 * The reducer needs a pnj's statblock to seat it, an object's `usos` to start
 * its charges, a scene's roster to load it. It does not need the pnj's prose,
 * the object's description or the scene's reading note — and the player's
 * page must never be able to see them — so they are cut here, before the
 * bytes leave the machine. Portraits go separately, as bytes with a key.
 */
import type { PrepBody, PublishedObject, PublishedPnj, PublishedScene } from '../../../shared/protocol.ts'
import type { CampaignVault } from '../../../shared/vault/binding.ts'
import type { CampaignData } from '../../../shared/vault/campaign.ts'
import { decodeDataUri } from '../assets/keys.ts'
import { api } from '../net/api.ts'

export function prepOf(campaign: CampaignData): PrepBody {
  const pnjs: PublishedPnj[] = campaign.pnjs.map(({ lead: _lead, ...pnj }) => ({
    ...pnj,
    portrait: pnj.portrait ? { src: pnj.portrait.src, stamp: null } : null,
  }))
  const objects: PublishedObject[] = campaign.objects.map(({ description: _d, ...o }) => o)
  const scenes: PublishedScene[] = campaign.scenes.map(({ note: _n, ...s }) => ({
    ...s,
    art: s.art ? { src: s.art.src, stamp: null } : null,
  }))
  return { pnjs, objects, scenes }
}

/** The bytes of a pnj's portrait, wherever the note keeps them. */
async function portraitBlob(vault: CampaignVault, src: string | null, stamp: string | null): Promise<Blob | null> {
  if (stamp) return decodeDataUri(stamp)
  if (!src) return null
  const file = await vault.asset(src)
  return file ? file.blob() : null
}

/** Prep to the server, then every pnj portrait, a few at a time. */
export async function publishPrep(
  token: string,
  campaignId: string,
  vault: CampaignVault,
  campaign: CampaignData,
): Promise<void> {
  await api.prep(token, campaignId, prepOf(campaign))
  const withArt = campaign.pnjs.filter((p) => p.portrait && (p.portrait.stamp || p.portrait.src))
  const queue = [...withArt]
  const worker = async () => {
    for (let pnj = queue.shift(); pnj; pnj = queue.shift()) {
      try {
        const blob = await portraitBlob(vault, pnj.portrait!.src, pnj.portrait!.stamp)
        if (blob) await api.pnjPortrait(token, campaignId, pnj.id, blob)
      } catch (err) {
        // A portrait that does not make it is a face missing, not a failed publish.
        console.warn(`[publish] portrait ${pnj.id}: ${(err as Error).message}`)
      }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()])
}

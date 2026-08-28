import { useState } from 'react'
import { useAssetUrl } from '../assets/context.tsx'
import { initials } from './combat.ts'

/** Portrait with an initials fallback, for missing or broken art. */
export function Face({
  src,
  name,
  className = 'crow-face',
}: {
  /** Asset key, not a URL — the DM window reads the bytes itself. */
  src: string | null
  name: string
  className?: string
}) {
  const [broken, setBroken] = useState(false)
  const url = useAssetUrl(src)
  if (!url || broken) return <div className={className}>{initials(name)}</div>
  return <img className={className} src={url} alt="" onError={() => setBroken(true)} />
}

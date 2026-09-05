import { useState } from 'react'
import { useAssetUrl } from '../../assets/context.tsx'

const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')

/** Portrait with an initials fallback. `src` is an asset key, not a URL. */
export function Face({ src, name, size = 44 }: { src: string | null; name: string; size?: number }) {
  const [broken, setBroken] = useState(false)
  const url = useAssetUrl(src)
  const style = { width: size, height: size }
  if (!url || broken) {
    return (
      <div className="pj-face" style={style}>
        {initials(name)}
      </div>
    )
  }
  return <img className="pj-face" style={style} src={url} alt="" onError={() => setBroken(true)} />
}

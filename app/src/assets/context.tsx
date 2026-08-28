/**
 * Which asset cache the components in this window should ask.
 *
 * `Board`, `SceneLayer` and the portraits are shared between the two windows,
 * and the difference between them is exactly this: the DM's cache reads the
 * folder, the table's asks over the transport. Everything else about those
 * components is the same, so the difference is a provider rather than a prop
 * threaded through every one of them.
 */
import { createContext, useContext, type ReactNode } from 'react'
import { AssetCache, useAsset } from './cache.ts'

const AssetContext = createContext<AssetCache>(new AssetCache())

export function AssetProvider({
  cache,
  children,
}: {
  cache: AssetCache
  children: ReactNode
}) {
  return <AssetContext.Provider value={cache}>{children}</AssetContext.Provider>
}

/** The URL for an asset key, or null while it is being read or missing. */
export function useAssetUrl(key: string | null | undefined): string | null {
  return useAsset(useContext(AssetContext), key)
}

/**
 * An `<img>` addressed by asset key rather than by URL. Renders nothing until
 * the bytes are there, which is what every caller wanted from a broken image
 * anyway.
 */
export function Art({
  src,
  ...rest
}: { src: string | null | undefined } & Omit<
  React.ImgHTMLAttributes<HTMLImageElement>,
  'src'
>) {
  const url = useAssetUrl(src)
  if (!url) return null
  return <img src={url} {...rest} />
}

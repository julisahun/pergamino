/** Cross-fades between scene art by keeping the outgoing image mounted. */
import { useEffect, useRef, useState } from 'react'
import type { TableView } from '../../../shared/types.ts'
import { useAssetUrl } from '../assets/context.tsx'

type Scene = TableView['scene']

/**
 * One layer. The asset key is resolved here rather than by the parent so the
 * outgoing image keeps its own URL while the incoming one is still arriving.
 */
function Layer({ artUrl, visible }: { artUrl: string | null; visible: boolean }) {
  const url = useAssetUrl(artUrl)
  if (!url) return null
  return <img key={url} src={url} alt="" style={{ opacity: visible ? 1 : 0 }} />
}

export function SceneLayer({ scene }: { scene: Scene }) {
  const [current, setCurrent] = useState<Scene>(scene)
  const [previous, setPrevious] = useState<Scene>(null)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    if (scene?.artUrl === current?.artUrl) {
      setCurrent(scene)
      return
    }
    setPrevious(current)
    setCurrent(scene)
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setPrevious(null), 800)
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
    // `current` is intentionally not a dependency: it is the value being replaced.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene?.artUrl])

  return (
    <div className="scene-layer">
      <Layer artUrl={previous?.artUrl ?? null} visible={false} />
      <Layer artUrl={current?.artUrl ?? null} visible />
    </div>
  )
}

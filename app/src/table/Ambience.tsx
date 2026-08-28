/**
 * Ambient audio. Browsers block autoplay until the window has been interacted
 * with, so the first click anywhere on the table screen unlocks it.
 */
import { useEffect, useRef } from 'react'
import type { AudioState } from '../../../shared/types.ts'
import { useAssetUrl } from '../assets/context.tsx'

const FADE_MS = 900

export function Ambience({ audio }: { audio: AudioState | null }) {
  const ref = useRef<HTMLAudioElement | null>(null)
  const fade = useRef<number | null>(null)
  // `audio.src` is an asset key; the bytes arrive over the transport.
  const url = useAssetUrl(audio?.src)

  useEffect(() => {
    const el = ref.current
    if (!el || !audio) return
    el.loop = audio.loop
    if (audio.playing) {
      void el.play().catch(() => {
        const unlock = () => {
          void el.play()
          window.removeEventListener('pointerdown', unlock)
        }
        window.addEventListener('pointerdown', unlock, { once: true })
      })
    } else {
      el.pause()
    }
  }, [audio, url, audio?.playing, audio?.loop])

  // Ramp the volume rather than stepping it, so a scene change is not jarring.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const target = audio?.volume ?? 0
    const from = el.volume
    const started = performance.now()
    if (fade.current) cancelAnimationFrame(fade.current)
    const step = (now: number) => {
      const k = Math.min(1, (now - started) / FADE_MS)
      el.volume = from + (target - from) * k
      if (k < 1) fade.current = requestAnimationFrame(step)
    }
    fade.current = requestAnimationFrame(step)
    return () => {
      if (fade.current) cancelAnimationFrame(fade.current)
    }
  }, [audio?.volume, url])

  if (!audio || !url) return null
  return <audio ref={ref} src={url} preload="auto" />
}

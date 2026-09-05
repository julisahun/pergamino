/**
 * A text field that is typed into locally and committed on blur, on Enter, or
 * after a short pause.
 *
 * Every field that uses this used to dispatch on each keystroke and read its
 * own value straight back out of the store, which was fine while `dispatch`
 * answered synchronously. The store's answer now arrives later — it is a round
 * trip to the server — and a controlled input whose prop lags its keystrokes
 * drops characters and throws the caret around. So while the field has focus
 * the draft is its own, and the store's value is only copied in when it does
 * not.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

export interface Draft {
  value: string
  onChange: (e: { target: { value: string } }) => void
  onFocus: () => void
  onBlur: () => void
  /** Enter commits and drops focus. Spread on an `<input>`, not a `<textarea>`. */
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void
}

export function useDraft(
  value: string | number,
  commit: (text: string) => void,
  delay = 300,
): Draft {
  const [text, setText] = useState(String(value))
  const latest = useRef(String(value))
  const dirty = useRef(false)
  const focused = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const commitRef = useRef(commit)
  commitRef.current = commit

  const flush = () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    if (!dirty.current) return
    dirty.current = false
    commitRef.current(latest.current)
  }

  // The store's value replaces the draft only when nobody is typing in it.
  useEffect(() => {
    if (focused.current || dirty.current) return
    latest.current = String(value)
    setText(String(value))
  }, [value])

  // A field that unmounts mid-edit — a tab switch — still gets its edit in.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => flush(), [])

  return {
    value: text,
    onChange: (e) => {
      latest.current = e.target.value
      dirty.current = true
      setText(e.target.value)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(flush, delay)
    },
    onFocus: () => {
      focused.current = true
    },
    onBlur: () => {
      focused.current = false
      flush()
    },
    onKeyDown: (e) => {
      if (e.key === 'Enter') {
        flush()
        ;(e.target as HTMLElement).blur()
      }
    },
  }
}

/**
 * A daily copy of the database, kept for two weeks.
 *
 * The Pi has no other backup. `VACUUM INTO` produces a consistent file while
 * WAL is live and needs no `sqlite3` binary. One a day is plenty for a table
 * that plays once a week; the check runs hourly so a Pi that was off at four
 * in the morning still makes today's copy when it comes back.
 */
import fs from 'node:fs'
import nodePath from 'node:path'
import type { Db } from './db.ts'

const KEEP_DAYS = 14
const CHECK_MS = 60 * 60 * 1000

const stamp = (d: Date): string => d.toISOString().slice(0, 10)

export function backupIfDue(db: Db, dir: string, today = new Date()): string | null {
  if (!dir) return null
  const file = nodePath.join(dir, `dm-${stamp(today)}.sqlite`)
  if (fs.existsSync(file)) return null
  db.backupTo(file)
  const cutoff = today.getTime() - KEEP_DAYS * 24 * 60 * 60 * 1000
  for (const name of fs.readdirSync(dir)) {
    const m = /^dm-(\d{4}-\d{2}-\d{2})\.sqlite$/.exec(name)
    if (m && new Date(m[1]!).getTime() < cutoff) fs.unlinkSync(nodePath.join(dir, name))
  }
  return file
}

/** Start the schedule; returns what stops it. */
export function scheduleBackups(db: Db, dir: string, log = console.log): () => void {
  if (!dir) return () => {}
  const tick = () => {
    try {
      const made = backupIfDue(db, dir)
      if (made) log(`[backup] ${made}`)
    } catch (err) {
      console.error('[backup] failed:', err)
    }
  }
  tick()
  const timer = setInterval(tick, CHECK_MS)
  return () => clearInterval(timer)
}

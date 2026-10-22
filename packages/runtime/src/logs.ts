// SPDX-License-Identifier: AGPL-3.0-only
// The log on disk (checkpoint 8b, ADR 0047): the logger's JSON lines in `/config/logs/`, a file a
// day by UTC date, kept 14 days (system.md's open question on retention, answered in the plan).
// System › Logs reads the ring buffer (`memorySink`); Download logs streams the files.
import { closeSync, mkdirSync, openSync, readdirSync, rmSync, statSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { jsonLine, LEVELS, type Level, type LogEntry, type LogSink } from '@highsea/core'

export const LOGS_PRUNE_JOB = 'logs.prune'
/** Owner and admins only: the event stream holds it back from everyone else. */
export const LOGS_TOPIC = 'logs.appended'
export const LOG_DAYS = 14
const DAY = 86_400_000
const FILE = /^highsea-(\d{4}-\d{2}-\d{2})\.jsonl$/

const dayOf = (at: number) => new Date(at).toISOString().slice(0, 10)

export type LogFile = { name: string; date: string; size: number }

export function createLogFiles(dir: string) {
  mkdirSync(dir, { recursive: true })
  let open: { date: string; fd: number } | null = null

  const close = () => {
    if (open) closeSync(open.fd)
    open = null
  }

  /** Synchronous writes, as stdout's are to a file: a line written before a crash is on disk. */
  const sink: LogSink = (entry) => {
    const date = dayOf(entry.at)
    try {
      if (open?.date !== date) {
        close()
        open = { date, fd: openSync(join(dir, `highsea-${date}.jsonl`), 'a') }
      }
      writeSync(open.fd, jsonLine(entry))
    } catch {
      // a full or missing disk can't be logged to; stdout still has the line
      close()
    }
  }

  /** Oldest first. */
  function files(): LogFile[] {
    try {
      return readdirSync(dir)
        .map((name) => ({ name, match: FILE.exec(name) }))
        .filter((f) => f.match)
        .map((f) => ({
          name: f.name,
          date: f.match?.[1] as string,
          size: statSync(join(dir, f.name)).size,
        }))
        .sort((a, b) => a.date.localeCompare(b.date))
    } catch {
      return []
    }
  }

  return {
    sink,
    dir,
    files,
    paths: () => files().map((f) => join(dir, f.name)),
    /** Files older than 14 days. Safe to repeat. */
    prune(now: number) {
      const oldest = dayOf(now - (LOG_DAYS - 1) * DAY)
      const gone = files().filter((f) => f.date < oldest)
      for (const f of gone) {
        if (open?.date === f.date) close()
        rmSync(join(dir, f.name), { force: true })
      }
      return gone.length
    },
    close,
  }
}

export type LogFiles = ReturnType<typeof createLogFiles>

export type LogQuery = {
  /** This level and up. */
  level?: Level
  /** Case-insensitive, in the message, the source and the fields. */
  search?: string
  limit?: number
}

const fieldsText = (fields: LogEntry['fields']) =>
  fields ? JSON.stringify(fields, (_k, v) => (v instanceof Error ? v.message : v)) : ''

const haystack = (e: LogEntry) => `${e.source} ${e.message} ${fieldsText(e.fields)}`.toLowerCase()

/** The ring buffer's entries that match, newest first. */
export function queryLogs(entries: LogEntry[], { level, search, limit = 500 }: LogQuery) {
  const min = level ? LEVELS.indexOf(level) : 0
  const needle = search?.trim().toLowerCase()
  const out: LogEntry[] = []
  for (let i = entries.length - 1; i >= 0 && out.length < limit; i--) {
    const e = entries[i] as LogEntry
    if (LEVELS.indexOf(e.level) < min) continue
    if (needle && !haystack(e).includes(needle)) continue
    out.push(e)
  }
  return out
}

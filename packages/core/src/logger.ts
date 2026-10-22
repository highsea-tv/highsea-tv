// SPDX-License-Identifier: AGPL-3.0-only
// Structured logging: a level, a message, a source and fields. Sinks decide where it goes: JSON
// lines on stdout for Docker, and a ring buffer that System › Logs reads.
import type { Clock } from './clock.ts'
import { systemClock } from './clock.ts'

export const LEVELS = ['debug', 'info', 'warn', 'error'] as const
export type Level = (typeof LEVELS)[number]

export type LogEntry = {
  at: number
  level: Level
  source: string
  message: string
  fields?: Record<string, unknown>
}

export type LogSink = (entry: LogEntry) => void

export type Logger = {
  debug(message: string, fields?: Record<string, unknown>): void
  info(message: string, fields?: Record<string, unknown>): void
  warn(message: string, fields?: Record<string, unknown>): void
  error(message: string, fields?: Record<string, unknown>): void
  /** The same sinks, under another source name. */
  child(source: string): Logger
}

export function createLogger({
  source = 'server',
  level = 'info',
  sinks,
  clock = systemClock,
}: {
  source?: string
  /** A level, or a getter read on every entry, so the level can change while the server runs. */
  level?: Level | (() => Level)
  sinks: LogSink[]
  clock?: Clock
}): Logger {
  const fixed = typeof level === 'function' ? 0 : LEVELS.indexOf(level)
  const min = typeof level === 'function' ? () => LEVELS.indexOf(level()) : () => fixed
  const log = (lvl: Level) => (message: string, fields?: Record<string, unknown>) => {
    if (LEVELS.indexOf(lvl) < min()) return
    const entry: LogEntry = { at: clock.now(), level: lvl, source, message }
    if (fields && Object.keys(fields).length > 0) entry.fields = fields
    for (const sink of sinks) sink(entry)
  }
  return {
    debug: log('debug'),
    info: log('info'),
    warn: log('warn'),
    error: log('error'),
    child: (child) => createLogger({ source: child, level, sinks, clock }),
  }
}

/** An entry as one line of JSON, ended with a newline. Errors become their message and stack. */
export const jsonLine = (entry: LogEntry) =>
  `${JSON.stringify(entry, (_k, v) =>
    v instanceof Error ? { message: v.message, stack: v.stack } : v,
  )}\n`

/** One JSON object per line, for `docker logs`. */
export const jsonSink =
  (write: (line: string) => void = (l) => process.stdout.write(l)): LogSink =>
  (entry) =>
    write(jsonLine(entry))

export type MemorySink = LogSink & { entries(): LogEntry[] }

/** Keeps the last `size` entries, oldest first. */
export function memorySink(size = 2000): MemorySink {
  const buffer: LogEntry[] = []
  const sink = ((entry: LogEntry) => {
    buffer.push(entry)
    if (buffer.length > size) buffer.shift()
  }) as MemorySink
  sink.entries = () => [...buffer]
  return sink
}

/** A logger that drops everything, for tests that don't look at logs. */
export const silentLogger: Logger = createLogger({ sinks: [] })

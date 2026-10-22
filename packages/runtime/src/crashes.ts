// SPDX-License-Identifier: AGPL-3.0-only
// Crash reports (checkpoint 8b, the owner's answer 12): with General › Diagnostics' switch on, an
// unhandled error writes a report to `/config/crashes/`: the error and its stack, the version, the
// platform and the recent log lines without their fields, so nothing personal goes in. System ›
// Logs lists them and the owner downloads one to attach to an issue. Nothing is sent anywhere.
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { AppError, type Clock, type LogEntry, newId } from '@highsea/core'

/** Recent log lines in a report. */
const RECENT = 50
const ID = /^crash-[0-9A-Za-z-]+$/

export type CrashReport = {
  id: string
  at: string
  /** Where it came from: `uncaughtException`, `unhandledRejection` or `api`. */
  origin: string
  version: string
  node: string
  platform: string
  error: { name: string; message: string; stack: string | null }
  recentLog: Pick<LogEntry, 'at' | 'level' | 'source' | 'message'>[]
}

export type CrashSummary = { id: string; at: number; origin: string; message: string; size: number }

export function createCrashReports(deps: {
  dir: string
  version: string
  clock: Clock
  enabled: () => boolean
  recentLog: () => LogEntry[]
}) {
  const { dir } = deps

  return {
    dir,
    /**
     * Writes a report when the switch is on, synchronously, since the process may be about to end
     * (Node's docs on 'uncaughtException'). Returns its id, or null. Never throws.
     */
    record(error: unknown, origin: string): string | null {
      try {
        if (!deps.enabled()) return null
        const e = error instanceof Error ? error : new Error(String(error))
        const at = deps.clock.now()
        const id = `crash-${new Date(at).toISOString().replace(/[:.]/g, '-')}-${newId('c').slice(2, 8)}`
        const report: CrashReport = {
          id,
          at: new Date(at).toISOString(),
          origin,
          version: deps.version,
          node: process.version,
          platform: `${process.platform} ${process.arch}`,
          error: { name: e.name, message: e.message, stack: e.stack ?? null },
          recentLog: deps
            .recentLog()
            .slice(-RECENT)
            .map(({ at, level, source, message }) => ({ at, level, source, message })),
        }
        mkdirSync(dir, { recursive: true })
        writeFileSync(join(dir, `${id}.json`), `${JSON.stringify(report, null, 2)}\n`)
        return id
      } catch {
        return null
      }
    },
    /** Newest first. */
    list(): CrashSummary[] {
      let names: string[]
      try {
        names = readdirSync(dir).filter(
          (n) => ID.test(n.replace(/\.json$/, '')) && n.endsWith('.json'),
        )
      } catch {
        return []
      }
      const out: CrashSummary[] = []
      for (const name of names)
        try {
          const path = join(dir, name)
          const report = JSON.parse(readFileSync(path, 'utf8')) as CrashReport
          out.push({
            id: name.slice(0, -'.json'.length),
            at: Date.parse(report.at),
            origin: report.origin,
            message: `${report.error.name}: ${report.error.message}`.split('\n')[0] ?? '',
            size: statSync(path).size,
          })
        } catch {
          // a report cut short by the crash it describes: skipped
        }
      return out.sort((a, b) => b.at - a.at)
    },
    /** A report's file, for Download report. */
    path(id: string) {
      const path = join(dir, `${id}.json`)
      try {
        if (ID.test(id) && statSync(path).isFile()) return path
      } catch {
        // not there
      }
      throw new AppError('not-found', 'That crash report is gone.')
    },
  }
}

export type CrashReports = ReturnType<typeof createCrashReports>

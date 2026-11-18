// SPDX-License-Identifier: AGPL-3.0-only
// Client reports (Phase 5's A2a, ADR 0066): what the apps signed in here send when an error isn't
// handled or a play fails, kept beside the server's own crash reports (./crashes.ts, ADR 0047) in
// `/config/client-reports/`, a file each. They're always kept (the owner's word of 2026-11-18,
// HT-56): General › Diagnostics' switch is for the server's own crash reports, and a failed play is
// what the owner most needs to read afterwards. The newest `keep` stay and the oldest go as new
// ones arrive.
// System › Logs lists them, the owner downloads one, and Download logs ends with them. Nothing is
// sent anywhere.
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { AppError, type Clock, jsonLine, newId } from '@highsea-tv/core'

const ID = /^client-[0-9A-Za-z-]+$/
/** How many a server keeps; the oldest goes when a new one arrives. */
export const CLIENT_REPORTS_KEPT = 200

/** What a client sent (the contract's `ClientReportInput`, already checked). */
export type ClientReportInput = {
  kind: 'error' | 'play'
  app: string
  version: string
  device: string
  screen: string
  error: { name: string; message: string; stack: string | null; componentStack?: string | null }
  play?: Record<string, unknown>
}

/** A report as it's kept: what was sent, when, by whom, and the server's version. */
export type ClientReportFile = ClientReportInput & {
  id: string
  at: string
  /** The server's version when it arrived. */
  server: string
  /** Who was signed in: their id and nothing else about them. */
  userId: string
  /** A failed play's device profile, as the server would decide from it (ADR 0052). */
  deviceProfile?: unknown
}

export type ClientReportSummary = {
  id: string
  at: number
  kind: 'error' | 'play'
  app: string
  version: string
  device: string
  screen: string
  message: string
  size: number
}

export function createClientReports(deps: {
  dir: string
  version: string
  clock: Clock
  /** How many are kept. */
  keep: number
  /** Called after a report is kept, so System › Logs hears of it. */
  kept?: () => void
}) {
  const { dir } = deps

  /** The reports' file names, oldest first: an id starts with its time, so names sort by it. */
  function names(): string[] {
    try {
      return readdirSync(dir)
        .filter((n) => n.endsWith('.json') && ID.test(n.slice(0, -'.json'.length)))
        .sort()
    } catch {
      return []
    }
  }

  function read(name: string): ClientReportFile | null {
    try {
      return JSON.parse(readFileSync(join(dir, name), 'utf8')) as ClientReportFile
    } catch {
      return null
    }
  }

  return {
    dir,
    /**
     * Keeps a report, and removes the oldest past `keep`. Returns its id, or null when the disk
     * refused. Never throws: a report is never worth
     * failing the app that sent it.
     */
    record(
      input: ClientReportInput,
      from: { userId: string; deviceProfile?: unknown },
    ): string | null {
      try {
        const at = new Date(deps.clock.now()).toISOString()
        const id = `client-${at.replace(/[:.]/g, '-')}-${newId('c').slice(2, 8)}`
        const report: ClientReportFile = {
          id,
          at,
          server: deps.version,
          userId: from.userId,
          ...input,
          ...(from.deviceProfile === undefined ? {} : { deviceProfile: from.deviceProfile }),
        }
        mkdirSync(dir, { recursive: true })
        writeFileSync(join(dir, `${id}.json`), `${JSON.stringify(report, null, 2)}\n`)
        const all = names()
        for (const old of all.slice(0, Math.max(0, all.length - deps.keep)))
          rmSync(join(dir, old), { force: true })
        deps.kept?.()
        return id
      } catch {
        return null
      }
    },
    /** Newest first. */
    list(): ClientReportSummary[] {
      const out: ClientReportSummary[] = []
      for (const name of names()) {
        const r = read(name)
        if (!r) continue
        try {
          out.push({
            id: name.slice(0, -'.json'.length),
            at: Date.parse(r.at),
            kind: r.kind,
            app: r.app,
            version: r.version,
            device: r.device,
            screen: r.screen,
            message: `${r.error.name}: ${r.error.message}`.split('\n')[0] ?? '',
            size: statSync(join(dir, name)).size,
          })
        } catch {
          // a file that isn't a report: skipped
        }
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
      throw new AppError('not-found', 'That report is gone.')
    },
    /**
     * Each report as one of the log's JSON lines, oldest first, for Download logs: an `error` line
     * from `client`, with the whole report in its fields.
     */
    *lines(): Generator<string> {
      for (const name of names()) {
        const r = read(name)
        if (!r?.error) continue
        yield jsonLine({
          at: Date.parse(r.at),
          level: 'error',
          source: 'client',
          message: `${r.error.name}: ${r.error.message}`.split('\n')[0] ?? '',
          fields: { report: r },
        })
      }
    },
  }
}

export type ClientReports = ReturnType<typeof createClientReports>

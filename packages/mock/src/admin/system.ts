// SPDX-License-Identifier: AGPL-3.0-only
// System's tabs besides Status and Health, and Settings › Backups, through the mock's transport
// (one-client-platform-d.md › D3), from the mock's own api in the contract's shapes: Tasks (the
// mock's scheduled jobs under the server's job types), Logs, Crash reports (the mock writes none),
// Backups with making, restoring and deleting one, Updates, and the backup schedule. Downloading a
// backup, the log files or a crash report answers 501: those are files, which the mock doesn't keep.
import {
  type Backup,
  type BackupSettings,
  LOG_LEVELS,
  type LogEntry,
  OPERATIONS_TOPICS,
  type Task,
  type Updates,
} from '@highsea-tv/api-contract'
import { createT, defineMessages } from '@highsea-tv/i18n'
import type { BackupSettings as MockBackupSettings } from '../settings.ts'
import type { Job, Backup as MockBackup } from '../types.ts'
import { type AdminKit, type Answers, type Ctx, refuse } from './kit.ts'

const t = createT(
  defineMessages({
    'system.noTask': 'There’s no scheduled task with that id.',
    'system.noBackup': 'That backup is gone.',
    'system.folder': 'Use a full path, starting with /.',
  }),
)

/** The mock's job kinds under the server's job types (system-messages.ts names each `task.<id>`). */
const TASK_OF: Partial<Record<Job['kind'], string>> = {
  'rss-sync': 'indexers.rss',
  'refresh-movies': 'metadata.sweep',
  'subtitle-search': 'subtitles.wanted',
  'catalog-sync': 'catalog.check',
  backup: 'backups.scheduled',
}

/** The mock's one made before a migration is the server's made before an update. */
const KIND_OF: Record<MockBackup['kind'], Backup['kind']> = {
  scheduled: 'scheduled',
  manual: 'manual',
  'pre-migration': 'before-update',
}

/** What the contract's schedule has that the mock's doesn't: the weekday, Sunday on a new server. */
type Saved = MockBackupSettings & { weekday?: number }

/** The log files on disk, a day each, oldest first (`Logs.files`): the mock keeps none. */
const FILES: never[] = []

export function systemAnswers({ wall, emit }: AdminKit): Answers {
  const taskOf = (j: Job, id: string): Task => ({
    id,
    state: j.state,
    interval: j.interval ?? 0,
    lastRun: j.lastRun && wall(j.lastRun),
    nextRun: j.nextRun && wall(j.nextRun),
    lastError: j.state === 'failed' ? j.message : null,
  })

  const tasksOf = (ctx: Ctx) =>
    ctx.api.system.jobs().flatMap((j) => {
      const id = TASK_OF[j.kind]
      return id && j.interval !== null ? [{ id, job: j }] : []
    })

  const backupOf = (ctx: Ctx, b: MockBackup): Backup => ({
    id: b.id,
    kind: KIND_OF[b.kind],
    createdAt: wall(b.createdAt),
    size: b.size,
    version: ctx.srv.state.server.version,
    schema: null,
    problem: null,
  })

  const scheduleOf = (ctx: Ctx): BackupSettings => {
    const s = ctx.api.settings.get('backups') as Saved
    return {
      schedule: s.schedule,
      time: s.time,
      weekday: s.weekday ?? 0,
      keep: s.keep,
      folder: s.location,
    }
  }

  return {
    system: {
      tasks: (_, ctx) => tasksOf(ctx).map(({ id, job }) => taskOf(job, id)),
      runTask: ({ params }, ctx) => {
        const task = tasksOf(ctx).find((x) => x.id === params.id)
        if (!task) throw refuse('not-found', t('system.noTask'))
        ctx.api.system.runJob(task.job.id)
        return undefined
      },

      logs: ({ query }, ctx) => {
        const from = LOG_LEVELS.indexOf(query.level ?? 'debug')
        const search = query.search?.trim().toLowerCase() ?? ''
        const entries = ctx.api.system
          .logs()
          .map(
            (l): LogEntry => ({
              at: wall(l.time),
              level: l.level,
              source: l.logger.toLowerCase(),
              message: l.message,
            }),
          )
          .filter(
            (l) =>
              LOG_LEVELS.indexOf(l.level) >= from &&
              (!search || l.source.includes(search) || l.message.toLowerCase().includes(search)),
          )
          .slice(0, query.limit ?? 500)
        return { entries, files: FILES }
      },
      crashes: (_, ctx) => {
        // staff only, as the log is; the mock never fails, so it has no reports to give
        ctx.api.system.logs()
        return []
      },

      backups: (_, ctx) => {
        const backups = ctx.api.system.backups().map((b) => backupOf(ctx, b))
        const backupJob = ctx.api.system.jobs().find((j) => j.kind === 'backup')
        const on = scheduleOf(ctx).schedule !== 'off'
        return {
          backups,
          nextRun: on && backupJob?.nextRun ? wall(backupJob.nextRun) : null,
        }
      },
      backupNow: (_, ctx) => {
        const b = ctx.api.system.backupNow()
        emit(OPERATIONS_TOPICS.backups)
        return backupOf(ctx, b)
      },
      restore: ({ params }, ctx) => {
        if (!ctx.api.system.backups().some((b) => b.id === params.id))
          throw refuse('not-found', t('system.noBackup'))
        ctx.api.system.restore(params.id)
        return undefined
      },
      deleteBackup: ({ params }, ctx) => {
        // owner only, as listing them is
        ctx.api.system.backups()
        const list = ctx.srv.state.backups
        const at = list.findIndex((b) => b.id === params.id)
        if (at < 0) throw refuse('not-found', t('system.noBackup'))
        list.splice(at, 1)
        emit(OPERATIONS_TOPICS.backups)
        return undefined
      },

      updates: (_, ctx): Updates => {
        const u = ctx.api.system.updates()
        // checked when the server started, as the catalog check after boot does
        const checked = wall(ctx.srv.state.status.startedAt)
        return {
          current: u.current,
          channel: u.channel,
          latest: {
            version: u.latest,
            channel: u.channel,
            date: checked.slice(0, 10),
            notes: u.notes,
          },
          available: u.latest !== u.current,
          checkedAt: checked,
        }
      },
    },

    settings: {
      backups: (_, ctx) => scheduleOf(ctx),
      saveBackups: ({ body }, ctx) => {
        if (!body.folder.startsWith('/')) throw refuse('invalid', t('system.folder'))
        const saved: Saved = {
          schedule: body.schedule,
          time: body.time,
          weekday: body.weekday,
          keep: body.keep,
          location: body.folder,
        }
        ctx.api.settings.save('backups', saved)
        emit(OPERATIONS_TOPICS.settings)
        emit(OPERATIONS_TOPICS.backups)
        return scheduleOf(ctx)
      },
    },
  }
}

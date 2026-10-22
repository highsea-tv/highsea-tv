// SPDX-License-Identifier: AGPL-3.0-only
// The owner's tools' settings (checkpoint 8b, ADR 0047; settings.md): General's language, time zone,
// update channel, log level and crash reports; Backups' schedule, time, how many to keep and the
// folder, the owner's alone (ADR 0032); and whether /metrics answers.
import { createRoute, z } from '@hono/zod-openapi'
import { API_PREFIX, access, body, errors, json } from './common.ts'
import { LOG_LEVELS } from './system.ts'

export const GeneralSettings = z
  .object({
    /** The server's language, for what it writes: notifications, the calendar feed. */
    language: z
      .string()
      .regex(/^[a-z]{2,3}(-[A-Z]{2})?$/)
      .openapi({ example: 'en' }),
    /** An IANA time zone, for schedules: when the backup runs. */
    timeZone: z.string().max(100).openapi({ example: 'Europe/Lisbon' }),
    updateChannel: z.enum(['stable', 'beta']),
    /** Changes at once, without a restart. */
    logLevel: z.enum(LOG_LEVELS),
    /** Write a crash report to the config folder when something fails. Nothing is sent. */
    crashReports: z.boolean(),
  })
  .openapi('GeneralSettings')

export const BACKUP_SCHEDULES = ['daily', 'weekly', 'off'] as const

export const BackupSettings = z
  .object({
    schedule: z.enum(BACKUP_SCHEDULES),
    /** Local time, in the server's time zone. */
    time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .openapi({ example: '03:30' }),
    /** For a weekly schedule: 0 is Sunday. */
    weekday: z.number().int().min(0).max(6),
    /** Scheduled backups kept; the oldest go first. Others stay until deleted. */
    keep: z.number().int().min(1).max(365),
    /** A full path highsea can write. */
    folder: z.string().min(1).max(4000).openapi({ example: '/config/backups' }),
  })
  .openapi('BackupSettings')

export const MetricsSettings = z.object({ enabled: z.boolean() }).openapi('MetricsSettings')

const SETTINGS = `${API_PREFIX}/settings`

export const operationsSettings = {
  general: createRoute({
    method: 'get',
    path: `${SETTINGS}/general`,
    tags: ['Settings'],
    summary: 'General: language, time zone, update channel, log level and crash reports',
    ...access('staff'),
    responses: {
      200: json(GeneralSettings, 'The settings'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
  saveGeneral: createRoute({
    method: 'put',
    path: `${SETTINGS}/general`,
    tags: ['Settings'],
    summary: 'Save General',
    ...access('owner'),
    request: { ...body(GeneralSettings) },
    responses: {
      200: json(GeneralSettings, 'Saved'),
      ...errors('invalid', 'unauthorized', 'forbidden'),
    },
  }),
  backups: createRoute({
    method: 'get',
    path: `${SETTINGS}/backups`,
    tags: ['Settings'],
    summary: 'Backups: the schedule, how many to keep and the folder',
    ...access('owner'),
    responses: {
      200: json(BackupSettings, 'The settings'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
  saveBackups: createRoute({
    method: 'put',
    path: `${SETTINGS}/backups`,
    tags: ['Settings'],
    summary: 'Save Backups',
    description:
      'The folder is checked first: 400 when it isn’t a full path highsea can write. Scheduled backups beyond the number kept are deleted.',
    ...access('owner'),
    request: { ...body(BackupSettings) },
    responses: {
      200: json(BackupSettings, 'Saved'),
      ...errors('invalid', 'unauthorized', 'forbidden'),
    },
  }),
  metrics: createRoute({
    method: 'get',
    path: `${SETTINGS}/metrics`,
    tags: ['Settings'],
    summary: 'Whether /metrics answers',
    ...access('staff'),
    responses: {
      200: json(MetricsSettings, 'The settings'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
  saveMetrics: createRoute({
    method: 'put',
    path: `${SETTINGS}/metrics`,
    tags: ['Settings'],
    summary: 'Turn /metrics on or off',
    ...access('owner'),
    request: { ...body(MetricsSettings) },
    responses: {
      200: json(MetricsSettings, 'Saved'),
      ...errors('invalid', 'unauthorized', 'forbidden'),
    },
  }),
} as const

export type GeneralSettings = z.infer<typeof GeneralSettings>
export type BackupSettings = z.infer<typeof BackupSettings>
export type MetricsSettings = z.infer<typeof MetricsSettings>

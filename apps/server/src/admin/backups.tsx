'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Backups (settings.md, checkpoint 8b), the owner's alone (ADR 0032): the prototype's
// schedule, time, how many to keep and folder, with the weekday a weekly schedule needs. The server
// checks the folder on Save; its refusal shows on the field. A backup holds the database, never
// secret.key, so a group says so and what a restore on another machine needs (the owner's answer
// 13). Making and restoring backups is System › Backups.
import { BACKUP_SCHEDULES, type BackupSettings, OPERATIONS_TOPICS } from '@highsea-tv/api-contract'
import { useLocale, useT } from '@highsea-tv/i18n/react'
import type { ApiError } from '@highsea-tv/sdk'
import { useAction, useQuery } from '@highsea-tv/sdk/react'
import { Field, Input, Select, toast } from '@highsea-tv/ui-web'
import { useState } from 'react'
import { backups as messages } from './backups-messages.ts'
import { Loadable } from './loadable.tsx'
import { AreaPage, Group, SaveBar } from './settings.tsx'

export function BackupsSettings() {
  const t = useT(messages)
  const data = useQuery('settings:backups', (c) => c.settings.backups(), [
    OPERATIONS_TOPICS.settings,
  ])
  const general = useQuery('settings:general', (c) => c.settings.general(), [
    OPERATIONS_TOPICS.settings,
  ])
  return (
    <AreaPage id="backups">
      <Loadable query={data} what={t('what')}>
        {/* a fresh draft whenever the saved settings change */}
        {(s) => (
          <Form
            key={JSON.stringify(s)}
            loaded={s}
            zone={general.data?.timeZone ?? ''}
            reload={data.refetch}
          />
        )}
      </Loadable>
      <Group title={t('secret.title')}>
        <p className="text-body text-text-2">{t('secret.body')}</p>
      </Group>
      <p className="text-caption text-text-3">
        {t('elsewhereBefore')}{' '}
        <a href="/system/backups" className="text-text underline underline-offset-2">
          {t('elsewhereLink')}
        </a>
        .
      </p>
    </AreaPage>
  )
}

type Draft = Omit<BackupSettings, 'keep'> & { keep: string }

const keepOf = (text: string) => {
  const n = Number(text.trim())
  return /^\d+$/.test(text.trim()) && n >= 1 && n <= 365 ? n : undefined
}
const timeOk = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s)
/** A full path: Unix, or a Windows drive. */
const pathOk = (s: string) => /^(\/|[a-z]:[\\/])/i.test(s.trim())

function Form({
  loaded,
  zone,
  reload,
}: {
  loaded: BackupSettings
  zone: string
  reload: () => void
}) {
  const t = useT(messages)
  const locale = useLocale()
  const initial: Draft = { ...loaded, keep: String(loaded.keep) }
  const [v, setDraft] = useState(initial)
  const [touched, setTouched] = useState(false)
  const [folderError, setFolderError] = useState<string | null>(null)
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
  const save = useAction((c, body: BackupSettings) => c.settings.saveBackups({ body }))
  const dirty = JSON.stringify(v) !== JSON.stringify(initial)
  const keep = keepOf(v.keep)
  const show = (bad: boolean, message: string) => (touched && bad ? message : undefined)
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long' })

  const submit = async () => {
    setTouched(true)
    if (keep === undefined || !timeOk(v.time) || !pathOk(v.folder)) return
    try {
      await save.run({ ...v, keep, folder: v.folder.trim() })
    } catch (e) {
      // the folder is the one thing the server checks beyond the shape
      if ((e as ApiError).code === 'invalid') setFolderError((e as Error).message)
      return toast.error(t('saveError'), { description: (e as Error).message })
    }
    toast.success(t('saved'))
    reload()
  }

  return (
    <>
      <Group title={t('schedule.title')} description={t('schedule.description')}>
        <div className="grid gap-4 medium:grid-cols-2 expanded:grid-cols-4">
          <Field label={t('schedule')}>
            <Select
              value={v.schedule}
              onValueChange={(s) => set({ schedule: s as Draft['schedule'] })}
              options={BACKUP_SCHEDULES.map((s) => ({ value: s, label: t(`schedule.${s}`) }))}
            />
          </Field>
          {v.schedule === 'weekly' && (
            <Field label={t('weekday')}>
              <Select
                value={String(v.weekday)}
                onValueChange={(d) => set({ weekday: Number(d) })}
                // 7 January 2024 was a Sunday, day 0
                options={[0, 1, 2, 3, 4, 5, 6].map((d) => ({
                  value: String(d),
                  label: weekday.format(new Date(2024, 0, 7 + d)),
                }))}
              />
            </Field>
          )}
          <Field
            label={t('time')}
            hint={zone ? t('timeHint', { zone: zone.replaceAll('_', ' ') }) : undefined}
            error={show(!timeOk(v.time), t('timeInvalid'))}
          >
            <Input
              type="time"
              value={v.time}
              disabled={v.schedule === 'off'}
              onChange={(e) => set({ time: e.target.value })}
            />
          </Field>
          <Field
            label={t('keep')}
            hint={t('keepHint')}
            error={show(keep === undefined, t('keepInvalid'))}
          >
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={365}
              value={v.keep}
              onChange={(e) => set({ keep: e.target.value })}
            />
          </Field>
        </div>
        {v.schedule === 'off' && (
          <p className="text-badge-warning text-caption">{t('offWarning')}</p>
        )}
        <Field
          label={t('folder')}
          hint={t('folderHint')}
          error={show(!pathOk(v.folder), t('folderInvalid')) ?? folderError ?? undefined}
        >
          <Input
            value={v.folder}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => {
              setFolderError(null)
              set({ folder: e.target.value })
            }}
            className="font-mono"
          />
        </Field>
      </Group>
      <SaveBar
        dirty={dirty}
        saving={save.pending}
        onDiscard={() => {
          setTouched(false)
          setFolderError(null)
          setDraft(initial)
        }}
        onSave={submit}
      />
    </>
  )
}

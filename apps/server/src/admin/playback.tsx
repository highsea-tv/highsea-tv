'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Playback (playback-settings.md, checkpoint 4.3a), for the owner and admins: the
// prototype's Transcoding, Away from home and Cache groups. Hardware acceleration's group comes with
// 4.3b, with the paths the status lists. The server checks the cache's folder on Save; its refusal
// shows on the field. The cache's use comes from the status, which `playback.updated` refreshes as
// it grows, on Save and on Clear.
import {
  ENCODER_PRESETS,
  type EncoderPreset,
  PLAYBACK_SETTINGS_TOPICS,
  type PlaybackSettings,
  type PlaybackStatus,
  REMOTE_CEILINGS,
} from '@highsea-tv/api-contract'
import { bytes } from '@highsea-tv/core/format'
import { useT } from '@highsea-tv/i18n/react'
import type { ApiError } from '@highsea-tv/sdk'
import { useAction, useQuery } from '@highsea-tv/sdk/react'
import {
  Badge,
  Button,
  cn,
  Field,
  Input,
  SegmentedControl,
  Select,
  toast,
} from '@highsea-tv/ui-web'
import { useState } from 'react'
import { Loadable } from './loadable.tsx'
import { playback as messages } from './playback-messages.ts'
import { AreaPage, Group, SaveBar } from './settings.tsx'

export function PlaybackSettingsPage() {
  const t = useT(messages)
  const data = useQuery('settings:playback', (c) => c.settings.playback(), [
    PLAYBACK_SETTINGS_TOPICS.updated,
  ])
  const status = useQuery('playback:status', (c) => c.playback.status(), [
    PLAYBACK_SETTINGS_TOPICS.updated,
  ])
  return (
    <AreaPage id="playback">
      <Loadable query={data} what={t('what')}>
        {/* a fresh draft whenever the saved settings change */}
        {(s) => (
          <Form key={JSON.stringify(s)} loaded={s} status={status.data} reload={data.refetch} />
        )}
      </Loadable>
    </AreaPage>
  )
}

type Draft = Omit<PlaybackSettings, 'maxTranscodes' | 'cacheLimitGb'> & {
  maxTranscodes: string
  cacheLimitGb: string
}

/** A whole number in a range, from a field's text. */
const whole = (text: string, min: number, max: number) => {
  const n = Number(text.trim())
  return /^\d+$/.test(text.trim()) && n >= min && n <= max ? n : undefined
}
/** A full path: Unix, or a Windows drive. */
const pathOk = (s: string) => /^(\/|[a-z]:[\\/])/i.test(s.trim())

function Form({
  loaded,
  status,
  reload,
}: {
  loaded: PlaybackSettings
  status: PlaybackStatus | undefined
  reload: () => void
}) {
  const t = useT(messages)
  const initial: Draft = {
    ...loaded,
    maxTranscodes: String(loaded.maxTranscodes),
    cacheLimitGb: String(loaded.cacheLimitGb),
  }
  const [v, setDraft] = useState(initial)
  const [touched, setTouched] = useState(false)
  const [folderError, setFolderError] = useState<string | null>(null)
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
  const save = useAction((c, body: PlaybackSettings) => c.settings.savePlayback({ body }))
  const dirty = JSON.stringify(v) !== JSON.stringify(initial)
  const max = whole(v.maxTranscodes, 1, 8)
  const limit = whole(v.cacheLimitGb, 2, 2000)
  const show = (bad: boolean, message: string) => (touched && bad ? message : undefined)

  const submit = async () => {
    setTouched(true)
    if (max === undefined || limit === undefined || !pathOk(v.cachePath)) return
    try {
      await save.run({
        ...v,
        maxTranscodes: max,
        cacheLimitGb: limit,
        cachePath: v.cachePath.trim(),
      })
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
      <Group title={t('transcoding.title')} description={t('transcoding.description')}>
        <div className="grid items-start gap-4 medium:grid-cols-2">
          <Field
            label={t('maxTranscodes')}
            hint={t('maxTranscodesHint')}
            error={show(max === undefined, t('maxTranscodesInvalid'))}
          >
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={8}
              value={v.maxTranscodes}
              onChange={(e) => set({ maxTranscodes: e.target.value })}
            />
          </Field>
          <Field label={t('encoder')} hint={t(`encoder.${v.preset}.hint`)}>
            <SegmentedControl
              aria-label={t('encoder')}
              size="sm"
              value={v.preset}
              onValueChange={(preset) => set({ preset: preset as EncoderPreset })}
              options={ENCODER_PRESETS.map((p) => ({ value: p, label: t(`encoder.${p}`) }))}
              className="justify-self-start"
            />
          </Field>
        </div>
      </Group>

      <Group title={t('remote.title')} description={t('remote.description')}>
        <Field label={t('remote')} hint={t('remoteHint')}>
          <Select
            value={v.remoteMaxMbps === null ? 'none' : String(v.remoteMaxMbps)}
            onValueChange={(m) =>
              set({
                remoteMaxMbps: m === 'none' ? null : (Number(m) as Draft['remoteMaxMbps']),
              })
            }
            options={[
              ...REMOTE_CEILINGS.map((n) => ({ value: String(n), label: t(`remote.${n}`) })),
              { value: 'none', label: t('remote.none') },
            ]}
          />
        </Field>
      </Group>

      <Group title={t('cache.title')} description={t('cache.description')}>
        {status && <CacheUse cache={status.cache} />}
        <div className="grid items-start gap-4 medium:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Field
            label={t('folder')}
            hint={t('folderHint')}
            error={show(!pathOk(v.cachePath), t('folderInvalid')) ?? folderError ?? undefined}
          >
            <Input
              value={v.cachePath}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => {
                setFolderError(null)
                set({ cachePath: e.target.value })
              }}
              className="font-mono"
            />
          </Field>
          <Field label={t('limit')} error={show(limit === undefined, t('limitInvalid'))}>
            <Input
              type="number"
              inputMode="numeric"
              min={2}
              max={2000}
              value={v.cacheLimitGb}
              onChange={(e) => set({ cacheLimitGb: e.target.value })}
            />
          </Field>
        </div>
        <ClearCache disabled={!status || status.cache.transcodeBytes === 0} />
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

function CacheUse({ cache: c }: { cache: PlaybackStatus['cache'] }) {
  const t = useT(messages)
  const share = c.limitBytes > 0 ? Math.min(1, c.transcodeBytes / c.limitBytes) : 0
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="text-text text-ui">
          <span className="font-semibold tabular-nums">{bytes(c.transcodeBytes)}</span>
          <span className="text-text-2">{t('cache.of', { limit: bytes(c.limitBytes) })}</span>
        </p>
        {c.over && <Badge tone="warning">{t('cache.over')}</Badge>}
      </div>
      <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-s3">
        <div
          className={cn('h-full rounded-full', c.over ? 'bg-warning' : 'bg-accent')}
          style={{ width: `${share * 100}%` }}
        />
      </div>
      {c.over && <p className="text-caption text-text-2">{t('cache.overBody')}</p>}
      <p className="text-caption text-text-3">
        {t('cache.trickplay', { size: bytes(c.trickplayBytes) })}
      </p>
    </div>
  )
}

function ClearCache({ disabled }: { disabled: boolean }) {
  const t = useT(messages)
  const clear = useAction((c) => c.playback.clearCache())
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="secondary"
        icon="delete"
        loading={clear.pending}
        disabled={disabled}
        onClick={() =>
          clear
            .run()
            .then(() => toast.success(t('cleared')))
            .catch((e: Error) => toast.error(t('clearError'), { description: e.message }))
        }
      >
        {t('clear')}
      </Button>
      <span className="text-caption text-text-3">{t('clearHint')}</span>
    </div>
  )
}

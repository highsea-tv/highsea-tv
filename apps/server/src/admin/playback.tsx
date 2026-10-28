'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Playback (playback-settings.md, checkpoints 4.3a and 4.3b), for the owner and admins:
// the prototype's groups. Hardware acceleration lists the paths the status found, each with its
// check, which runs in the background on the server (ADR 0056); `playback.updated` says when it's
// done. The server checks the cache's folder on Save; its refusal shows on the field. The cache's use comes from the status, which `playback.updated` refreshes as
// it grows, on Save and on Clear.
import {
  type AccelerationPath,
  ENCODER_PRESETS,
  type EncoderPreset,
  type PathStatus,
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
  Icon,
  type IconName,
  Input,
  SegmentedControl,
  Select,
  Switch,
  toast,
} from '@highsea-tv/ui-web'
import { useState } from 'react'
import { Loadable } from './loadable.tsx'
import { playback as messages } from './playback-messages.ts'
import { AreaPage, Group, SaveBar } from './settings.tsx'
import { useNow } from './time.ts'
import { CopyBlock } from './vpn.tsx'

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
      {status && <HardwareGroup v={v} set={set} status={status} />}

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

// ---------------------------------------------------------------- hardware

type Messages = ReturnType<typeof useT<typeof messages>>

/** "2 days ago", in the prototype's words. */
const ago = (t: Messages, iso: string, now: number) => {
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000))
  if (m < 1) return t('ago.now')
  if (m < 60) return t('ago.minutes', { n: m })
  const h = Math.round(m / 60)
  if (h < 24) return t('ago.hours', { n: h })
  const d = Math.round(h / 24)
  return d === 1 ? t('ago.yesterday') : t('ago.days', { n: d })
}

const pathMark = (p: PathStatus): { icon: IconName; tone: string; mark: string } => {
  if (p.checking)
    return {
      icon: 'loading',
      tone: 'text-text-2 animate-spin motion-reduce:animate-none',
      mark: 'mark.checking',
    }
  if (p.unavailable) return { icon: 'remove', tone: 'text-text-3', mark: 'mark.unavailable' }
  if (!p.check) return { icon: 'info', tone: 'text-text-2', mark: 'mark.unchecked' }
  return p.check.result === 'pass'
    ? { icon: 'success', tone: 'text-success', mark: 'mark.passed' }
    : { icon: 'error', tone: 'text-danger', mark: 'mark.failed' }
}

function HardwareGroup({
  v,
  set,
  status,
}: {
  v: Draft
  set: (patch: Partial<Draft>) => void
  status: PlaybackStatus
}) {
  const t = useT(messages)
  const check = useAction((c, path: AccelerationPath) => c.playback.check({ params: { path } }))
  const now = useNow()
  const label = (id: AccelerationPath) => t(`path.${id}`)
  const found = status.paths.some((p) => !p.unavailable)
  const inUse = status.inUse
  const choice = v.acceleration
  const chosen =
    choice !== 'auto' && choice !== 'off' ? status.paths.find((p) => p.id === choice) : null
  const using = inUse ? status.paths.find((p) => p.id === inUse) : null
  return (
    <Group title={t('hardware.title')} description={t('hardware.description')}>
      <div role="status" className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5">
        <Icon
          name={inUse ? 'speed' : 'warning'}
          size={20}
          className={cn('row-span-2 mt-0.5', inUse ? 'text-success' : 'text-warning')}
        />
        <p className="font-semibold text-text text-ui">
          {inUse
            ? t('hardware.using', { path: label(inUse) })
            : choice === 'off'
              ? t('hardware.processor')
              : t('hardware.processorForNow')}
        </p>
        <p className="text-caption text-text-2">
          {inUse
            ? t('hardware.usingBody', { name: using?.name ?? using?.device ?? label(inUse) })
            : choice === 'off'
              ? t('hardware.offBody')
              : chosen && !chosen.unavailable
                ? t('hardware.chosenBody', { path: label(chosen.id) })
                : found
                  ? t('hardware.foundBody')
                  : t('hardware.noneBody')}
        </p>
      </div>

      <ul
        aria-label={t('hardware.found')}
        className="grid divide-y divide-line rounded-md border border-line"
      >
        {status.paths.map((p) => {
          const m = pathMark(p)
          return (
            <li
              key={p.id}
              className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1 px-3 py-2.5 medium:grid-cols-[auto_minmax(0,1fr)_auto]"
            >
              <Icon
                name={m.icon}
                size={16}
                aria-label={t(m.mark as 'mark.passed')}
                className={cn('mt-0.5', m.tone)}
              />
              <div className="grid min-w-0 gap-0.5">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium text-text text-ui">{label(p.id)}</span>
                  {inUse === p.id && <Badge tone="success">{t('inUse')}</Badge>}
                </p>
                <p className="text-caption text-text-2 [overflow-wrap:anywhere]">
                  {p.unavailable ? (
                    p.unavailable
                  ) : (
                    <>
                      {p.name && <span className="text-text">{p.name}</span>}
                      {p.name && p.device && ' · '}
                      {p.device && <span className="font-mono">{p.device}</span>}
                    </>
                  )}
                </p>
                {p.checking ? (
                  <p className="text-caption text-text-3">{t('checkingLine')}</p>
                ) : p.check && !p.unavailable ? (
                  <p
                    className={cn(
                      'text-caption',
                      p.check.result === 'pass' ? 'text-text-3' : 'text-badge-danger',
                    )}
                  >
                    {p.check.result === 'pass'
                      ? t('passedLine', {
                          fps: p.check.fps ?? 0,
                          ago: ago(t, p.check.at, now),
                          detail: p.check.detail,
                        })
                      : t('failedLine', { ago: ago(t, p.check.at, now), detail: p.check.detail })}
                  </p>
                ) : !p.unavailable ? (
                  <p className="text-caption text-text-3">
                    {t('uncheckedLine', { line: t(`path.${p.id}.line`) })}
                  </p>
                ) : null}
              </div>
              {!p.unavailable && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="col-start-2 justify-self-start medium:col-start-3"
                  loading={p.checking}
                  disabled={status.paths.some((x) => x.checking)}
                  onClick={() =>
                    check
                      .run(p.id)
                      .catch((e: Error) => toast.error(t('checkError'), { description: e.message }))
                  }
                >
                  {p.check ? t('checkAgain') : t('check')}
                </Button>
              )}
            </li>
          )
        })}
      </ul>

      {!found && <PassThroughHelp />}

      <Field label={t('use')} hint={t('useHint')}>
        <Select
          value={v.acceleration}
          onValueChange={(a) => set({ acceleration: a as PlaybackSettings['acceleration'] })}
          options={[
            { value: 'auto', label: t('use.auto') },
            // a path chosen before it went away stays listed, so the field shows what's saved
            ...status.paths
              .filter((p) => !p.unavailable || p.id === v.acceleration)
              .map((p) => ({ value: p.id, label: label(p.id) })),
            { value: 'off', label: t('use.off') },
          ]}
        />
      </Field>
      <Field inline label={t('toneMapping')} hint={t('toneMappingHint')}>
        <Switch checked={v.toneMapping} onCheckedChange={(toneMapping) => set({ toneMapping })} />
      </Field>
    </Group>
  )
}

const DRI_LINES = 'services:\n  highsea:\n    devices:\n      - /dev/dri:/dev/dri'
const NVIDIA_LINES =
  'services:\n  highsea:\n    deploy:\n      resources:\n        reservations:\n          devices:\n            - driver: nvidia\n              count: 1\n              capabilities: [gpu, video]'

function PassThroughHelp() {
  const t = useT(messages)
  return (
    <div className="grid gap-2">
      <p className="text-caption text-text-2">{t('passThrough')}</p>
      <CopyBlock label={t('passThrough.intel')} text={DRI_LINES} />
      <CopyBlock label={t('passThrough.nvidia')} text={NVIDIA_LINES} />
      <a
        href="https://docs.highsea.tv/install/hardware-acceleration/"
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1 justify-self-start text-text text-ui underline underline-offset-2"
      >
        {t('passThrough.guide')}
        <Icon name="external" size={12} className="text-text-3" />
      </a>
    </div>
  )
}

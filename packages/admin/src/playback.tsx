'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Playback (playback-settings.md, checkpoints 4.3a and 4.3b), for the owner and admins:
// the prototype's groups. Hardware acceleration lists the paths the status found, each with its
// check, which runs in the background on the server (ADR 0056); `playback.updated` says when it's
// done. The server checks the cache's folder on Save; its refusal shows on the field. The cache's use comes from the status, which `playback.updated` refreshes as
// it grows, on Save and on Clear.
// Since D3 (one-client-platform-d.md) it's drawn with the library's native renderer, on the web
// through react-native-web, with the same parts, words and behaviour as the web renderer's.
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
import type { ColorRole } from '@highsea-tv/tokens'
import { breakpoints } from '@highsea-tv/tokens'
import {
  Badge,
  Button,
  Field,
  Icon,
  type IconName,
  Input,
  ProgressBar,
  SegmentedControl,
  Select,
  Switch,
  Text,
  toast,
  tokens,
  useMotionReduced,
  useTheme,
  useWindowAtLeast,
} from '@highsea-tv/ui/native'
import { useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { Loadable } from './loadable.tsx'
import { playback as messages } from './playback-messages.ts'
import { AreaPage, Group, SaveBar } from './settings.tsx'
import { Line, Note, WRAP_ANYWHERE } from './settings-card.tsx'
import { Columns, ExternalLink } from './settings-columns.tsx'
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
        <Columns shares={[1, 1]}>
          <Field
            label={t('maxTranscodes')}
            hint={t('maxTranscodesHint')}
            error={show(max === undefined, t('maxTranscodesInvalid'))}
          >
            <Input
              inputMode="numeric"
              keyboardType="number-pad"
              value={v.maxTranscodes}
              onChangeText={(maxTranscodes) => set({ maxTranscodes })}
            />
          </Field>
          <Field label={t('encoder')} hint={t(`encoder.${v.preset}.hint`)}>
            <View style={{ alignSelf: 'flex-start' }}>
              <SegmentedControl
                aria-label={t('encoder')}
                value={v.preset}
                onValueChange={(preset) => set({ preset: preset as EncoderPreset })}
                options={ENCODER_PRESETS.map((p) => ({ value: p, label: t(`encoder.${p}`) }))}
              />
            </View>
          </Field>
        </Columns>
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
        <Columns shares={[2, 1]}>
          <Field
            label={t('folder')}
            hint={t('folderHint')}
            error={show(!pathOk(v.cachePath), t('folderInvalid')) ?? folderError ?? undefined}
          >
            <Input
              value={v.cachePath}
              autoComplete="off"
              spellCheck={false}
              mono
              onChangeText={(cachePath) => {
                setFolderError(null)
                set({ cachePath })
              }}
            />
          </Field>
          <Field label={t('limit')} error={show(limit === undefined, t('limitInvalid'))}>
            <Input
              inputMode="numeric"
              keyboardType="number-pad"
              value={v.cacheLimitGb}
              onChangeText={(cacheLimitGb) => set({ cacheLimitGb })}
            />
          </Field>
        </Columns>
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

const s = tokens.space
const ui = tokens.adminText.ui
/** Figures that line up as they change (CSS's `tabular-nums`). */
const TABULAR = { fontVariant: ['tabular-nums'] } as const

function CacheUse({ cache: c }: { cache: PlaybackStatus['cache'] }) {
  const t = useT(messages)
  const share = c.limitBytes > 0 ? Math.min(1, c.transcodeBytes / c.limitBytes) : 0
  return (
    <View style={{ gap: s['2'] }}>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          columnGap: s['3'],
        }}
      >
        <Line>
          <Text size={ui.size} leading={ui.leading} weight={600} style={TABULAR}>
            {bytes(c.transcodeBytes)}
          </Text>
          <Text size={ui.size} leading={ui.leading} color="text-2">
            {t('cache.of', { limit: bytes(c.limitBytes) })}
          </Text>
        </Line>
        {c.over && <Badge tone="warning">{t('cache.over')}</Badge>}
      </View>
      <View aria-hidden>
        <ProgressBar
          look="panel"
          value={share * 100}
          tone={c.over ? 'warning' : 'accent'}
          label={t('cache.title')}
        />
      </View>
      {c.over && <Note color="text-2">{t('cache.overBody')}</Note>}
      <Note>{t('cache.trickplay', { size: bytes(c.trickplayBytes) })}</Note>
    </View>
  )
}

function ClearCache({ disabled }: { disabled: boolean }) {
  const t = useT(messages)
  const clear = useAction((c) => c.playback.clearCache())
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: s['2'] }}>
      <Button
        size="sm"
        variant="secondary"
        icon="delete"
        loading={clear.pending}
        disabled={disabled}
        onPress={() =>
          clear
            .run()
            .then(() => toast.success(t('cleared')))
            .catch((e: Error) => toast.error(t('clearError'), { description: e.message }))
        }
      >
        {t('clear')}
      </Button>
      <Note>{t('clearHint')}</Note>
    </View>
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

const pathMark = (p: PathStatus): { icon: IconName; tone: ColorRole; mark: string } => {
  if (p.checking) return { icon: 'loading', tone: 'text-2', mark: 'mark.checking' }
  if (p.unavailable) return { icon: 'remove', tone: 'text-3', mark: 'mark.unavailable' }
  if (!p.check) return { icon: 'info', tone: 'text-2', mark: 'mark.unchecked' }
  return p.check.result === 'pass'
    ? { icon: 'success', tone: 'success', mark: 'mark.passed' }
    : { icon: 'error', tone: 'danger', mark: 'mark.failed' }
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
  const theme = useTheme()
  const reduced = useMotionReduced()
  const medium = useWindowAtLeast(breakpoints.medium)
  const label = (id: AccelerationPath) => t(`path.${id}`)
  const found = status.paths.some((p) => !p.unavailable)
  const inUse = status.inUse
  const choice = v.acceleration
  const chosen =
    choice !== 'auto' && choice !== 'off' ? status.paths.find((p) => p.id === choice) : null
  const using = inUse ? status.paths.find((p) => p.id === inUse) : null
  return (
    <Group title={t('hardware.title')} description={t('hardware.description')}>
      <View role="status" style={{ flexDirection: 'row', columnGap: s['3'] }}>
        <View style={{ paddingTop: s['0.5'] }}>
          <Icon
            name={inUse ? 'speed' : 'warning'}
            size={20}
            color={inUse ? 'success' : 'warning'}
          />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: s['0.5'] }}>
          <Line weight={600}>
            {inUse
              ? t('hardware.using', { path: label(inUse) })
              : choice === 'off'
                ? t('hardware.processor')
                : t('hardware.processorForNow')}
          </Line>
          <Note color="text-2">
            {inUse
              ? t('hardware.usingBody', { name: using?.name ?? using?.device ?? label(inUse) })
              : choice === 'off'
                ? t('hardware.offBody')
                : chosen && !chosen.unavailable
                  ? t('hardware.chosenBody', { path: label(chosen.id) })
                  : found
                    ? t('hardware.foundBody')
                    : t('hardware.noneBody')}
          </Note>
        </View>
      </View>

      <View
        role="list"
        aria-label={t('hardware.found')}
        style={{
          borderWidth: 1,
          borderColor: theme.colors.line,
          borderRadius: tokens.radius.md,
        }}
      >
        {status.paths.map((p, i) => {
          const m = pathMark(p)
          const action = !p.unavailable && (
            <View style={{ alignSelf: 'flex-start' }}>
              <Button
                size="sm"
                variant="secondary"
                loading={p.checking}
                disabled={status.paths.some((x) => x.checking)}
                onPress={() =>
                  check
                    .run(p.id)
                    .catch((e: Error) => toast.error(t('checkError'), { description: e.message }))
                }
              >
                {p.check ? t('checkAgain') : t('check')}
              </Button>
            </View>
          )
          return (
            <View
              key={p.id}
              role="listitem"
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                columnGap: s['3'],
                paddingHorizontal: s['3'],
                paddingVertical: s['2'] + s['0.5'],
                borderTopWidth: i === 0 ? 0 : 1,
                borderColor: theme.colors.line,
              }}
            >
              {/* the mark is named as one image, whether it's an icon or the spinner */}
              <View
                role="img"
                aria-label={t(m.mark as 'mark.passed')}
                style={{ paddingTop: s['0.5'] }}
              >
                {p.checking ? (
                  <ActivityIndicator
                    aria-hidden
                    size={16}
                    color={theme.colors[m.tone]}
                    animating={!reduced}
                  />
                ) : (
                  <Icon name={m.icon} size={16} color={m.tone} />
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: s['1'] }}>
                <View style={{ gap: s['0.5'] }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      columnGap: s['2'],
                      rowGap: s['1'],
                    }}
                  >
                    <Line weight={500}>{label(p.id)}</Line>
                    {inUse === p.id && <Badge tone="success">{t('inUse')}</Badge>}
                  </View>
                  <Note color="text-2" style={WRAP_ANYWHERE}>
                    {p.unavailable ? (
                      p.unavailable
                    ) : (
                      <>
                        {p.name && (
                          <Text variant="caption" color="text">
                            {p.name}
                          </Text>
                        )}
                        {p.name && p.device && ' · '}
                        {p.device && (
                          <Text variant="caption" color="text-2" mono>
                            {p.device}
                          </Text>
                        )}
                      </>
                    )}
                  </Note>
                  {p.checking ? (
                    <Note>{t('checkingLine')}</Note>
                  ) : p.check && !p.unavailable ? (
                    <Note color={p.check.result === 'pass' ? 'text-3' : 'badge-danger'}>
                      {p.check.result === 'pass'
                        ? t('passedLine', {
                            fps: p.check.fps ?? 0,
                            ago: ago(t, p.check.at, now),
                            detail: p.check.detail,
                          })
                        : t('failedLine', {
                            ago: ago(t, p.check.at, now),
                            detail: p.check.detail,
                          })}
                    </Note>
                  ) : !p.unavailable ? (
                    <Note>{t('uncheckedLine', { line: t(`path.${p.id}.line`) })}</Note>
                  ) : null}
                </View>
                {medium ? null : action}
              </View>
              {medium ? action : null}
            </View>
          )
        })}
      </View>

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
      <Switch
        label={t('toneMapping')}
        hint={t('toneMappingHint')}
        checked={v.toneMapping}
        onCheckedChange={(toneMapping) => set({ toneMapping })}
      />
    </Group>
  )
}

// ADR 0057's handover: the render nodes alone, and NVIDIA's runtime made Docker's default on the host
const DRI_LINES =
  'services:\n  highsea:\n    volumes:\n      - /dev/dri:/dev/dri\n    device_cgroup_rules:\n      - "c 226:128 rw"\n      - "c 226:129 rw"\n      - "c 226:130 rw"\n      - "c 226:131 rw"\n      - "c 226:132 rw"\n      - "c 226:133 rw"\n      - "c 226:134 rw"\n      - "c 226:135 rw"'
const NVIDIA_LINES =
  'sudo nvidia-ctk runtime configure --runtime=docker --set-as-default\nsudo systemctl restart docker'

function PassThroughHelp() {
  const t = useT(messages)
  return (
    <View style={{ gap: s['2'] }}>
      <Note color="text-2">{t('passThrough')}</Note>
      <CopyBlock label={t('passThrough.intel')} text={DRI_LINES} />
      <CopyBlock label={t('passThrough.nvidia')} text={NVIDIA_LINES} />
      <ExternalLink href="https://docs.highsea.tv/install/hardware-acceleration/">
        {t('passThrough.guide')}
      </ExternalLink>
    </View>
  )
}

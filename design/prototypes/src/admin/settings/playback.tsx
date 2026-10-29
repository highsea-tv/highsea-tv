// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Playback (docs/product/playback-settings.md; checkpoint 4.0b, prototyped before 4.1 and
// 4.3 build it). Hardware first: what highsea found, the one transcodes use, and a check for each;
// then how transcodes run, what's sent away from home, and the cache. The owner and admins change
// it (answer 6). In the prototype, **Prototype only · Fail the next check** plays a failed check,
// **Prototype only · Fill the cache** the cache over its limit, and the empty server has no GPU.

import { bytes } from '@highsea-tv/core/format'
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
import { useAction, useNow, useQuery } from '../../mock/hooks.tsx'
import {
  type AccelerationPath,
  type PathStatus,
  type PlaybackSettings,
  type PlaybackStatus,
  pathLabel,
} from '../../mock/playback.ts'
import { AreaPage, Group, SaveBar, useSettingsDraft } from './settings.tsx'
import { CopyBlock } from './vpn.tsx'

export function Playback() {
  const s = useSettingsDraft('playback')
  const status = useQuery('playback:status', (c) => c.transcoding.status(), [
    'playback.updated',
    'settings.updated',
  ])
  return (
    <AreaPage id="playback">
      {s.query.status === 'error' ? (
        <p className="text-badge-danger text-ui">
          Couldn’t load these settings. {s.query.error.message}
        </p>
      ) : !s.draft || !status.data ? (
        <p aria-busy className="text-caption text-text-3">
          Loading…
        </p>
      ) : (
        <>
          <HardwareGroup v={s.draft} set={s.set} status={status.data} />
          <TranscodingGroup v={s.draft} set={s.set} />
          <RemoteGroup v={s.draft} set={s.set} />
          <CacheGroup v={s.draft} set={s.set} status={status.data} />
          <SaveBar
            dirty={s.dirty}
            saving={s.saving}
            onDiscard={s.discard}
            onSave={() =>
              s
                .save()
                .then(() => toast.success('Settings saved'))
                .catch((e: Error) => toast.error('Couldn’t save', { description: e.message }))
            }
          />
        </>
      )}
    </AreaPage>
  )
}

type GroupProps = { v: PlaybackSettings; set: (patch: Partial<PlaybackSettings>) => void }

// ---------------------------------------------------------------- hardware

const ago = (at: number, now: number) => {
  const m = Math.max(0, Math.round((now - at) / 60_000))
  if (m < 1) return 'just now'
  if (m < 60) return `${m} minutes ago`
  const h = Math.round(m / 60)
  if (h < 24) return h === 1 ? 'an hour ago' : `${h} hours ago`
  const d = Math.round(h / 24)
  return d === 1 ? 'yesterday' : `${d} days ago`
}

const pathMark = (p: PathStatus): { icon: IconName; tone: string; label: string } => {
  if (p.checking)
    return {
      icon: 'loading',
      tone: 'text-text-2 animate-spin motion-reduce:animate-none',
      label: 'Checking',
    }
  if (p.unavailable) return { icon: 'remove', tone: 'text-text-3', label: 'Not here' }
  if (!p.check) return { icon: 'info', tone: 'text-text-2', label: 'Found, not checked' }
  return p.check.result === 'pass'
    ? { icon: 'success', tone: 'text-success', label: 'Passed' }
    : { icon: 'error', tone: 'text-danger', label: 'Failed' }
}

function HardwareGroup({ v, set, status }: GroupProps & { status: PlaybackStatus }) {
  const check = useAction((c, id: AccelerationPath) => c.transcoding.check(id))
  const fail = useAction((c) => c.transcoding.simulateFailure())
  const now = useNow()
  const found = status.paths.some((p) => !p.unavailable)
  const inUse = status.inUse
  const choice = v.acceleration
  const chosen =
    choice !== 'auto' && choice !== 'off' ? status.paths.find((p) => p.id === choice) : null
  return (
    <Group
      title="Hardware acceleration"
      description="A graphics chip transcodes many times faster than the processor, and uses far less power."
    >
      <div role="status" className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5">
        <Icon
          name={inUse ? 'speed' : 'warning'}
          size={20}
          className={cn('row-span-2 mt-0.5', inUse ? 'text-success' : 'text-warning')}
        />
        <p className="font-semibold text-text text-ui">
          {inUse
            ? `Transcoding with ${pathLabel(inUse)}`
            : choice === 'off'
              ? 'Transcoding with the processor'
              : 'Transcoding with the processor, for now'}
        </p>
        <p className="text-caption text-text-2">
          {inUse
            ? `${status.paths.find((p) => p.id === inUse)?.name}. Its check passed, so highsea uses it.`
            : choice === 'off'
              ? 'Hardware acceleration is off. Each transcode takes a processor core or more.'
              : chosen && !chosen.unavailable
                ? `${pathLabel(chosen.id)} is used once its check passes.`
                : found
                  ? 'highsea checks the graphics it finds by itself, and uses them once a check passes.'
                  : 'highsea found no graphics chip it can use. Films that need a transcode still play, more slowly.'}
        </p>
      </div>

      <ul
        aria-label="What highsea found"
        className="grid divide-y divide-line rounded-md border border-line"
      >
        {status.paths.map((p) => {
          const m = pathMark(p)
          return (
            <li
              key={p.id}
              className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1 px-3 py-2.5 medium:grid-cols-[auto_minmax(0,1fr)_auto]"
            >
              <Icon name={m.icon} size={16} aria-label={m.label} className={cn('mt-0.5', m.tone)} />
              <div className="grid min-w-0 gap-0.5">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium text-text text-ui">{p.label}</span>
                  {inUse === p.id && <Badge tone="success">In use</Badge>}
                </p>
                <p className="text-caption text-text-2 [overflow-wrap:anywhere]">
                  {p.unavailable ? (
                    p.unavailable
                  ) : (
                    <>
                      <span className="text-text">{p.name}</span>
                      <span className="font-mono"> · {p.device}</span>
                    </>
                  )}
                </p>
                {p.checking ? (
                  <p className="text-caption text-text-3">Transcoding a short clip…</p>
                ) : p.check && !p.unavailable ? (
                  <p
                    className={cn(
                      'text-caption',
                      p.check.result === 'pass' ? 'text-text-3' : 'text-badge-danger',
                    )}
                  >
                    {p.check.result === 'pass'
                      ? `${p.check.fps} frames a second, checked ${ago(p.check.at, now)}. ${p.check.detail}`
                      : `Failed ${ago(p.check.at, now)}. ${p.check.detail}`}
                  </p>
                ) : !p.unavailable ? (
                  <p className="text-caption text-text-3">{p.line} Not checked yet.</p>
                ) : null}
              </div>
              {!p.unavailable && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="col-start-2 justify-self-start medium:col-start-3"
                  loading={p.checking}
                  disabled={status.paths.some((x) => x.checking)}
                  onClick={() => check.run(p.id)}
                >
                  {p.check ? 'Check again' : 'Check'}
                </Button>
              )}
            </li>
          )
        })}
      </ul>

      {!found && <PassThroughHelp />}

      <Field
        label="Use"
        hint="Automatic picks the first one whose check passed. highsea never uses one that hasn’t."
      >
        <Select
          value={v.acceleration}
          onValueChange={(a) => set({ acceleration: a as PlaybackSettings['acceleration'] })}
          options={[
            { value: 'auto', label: 'Automatic' },
            ...status.paths
              .filter((p) => !p.unavailable)
              .map((p) => ({ value: p.id, label: p.label })),
            { value: 'off', label: 'The processor only' },
          ]}
        />
      </Field>
      <Field
        inline
        label="Convert HDR for screens that can’t show it"
        hint="Tone mapping keeps the colours right on an SDR screen. It needs a graphics chip to keep up with 4K."
      >
        <Switch checked={v.toneMapping} onCheckedChange={(toneMapping) => set({ toneMapping })} />
      </Field>

      {found && (
        <button
          type="button"
          onClick={() => fail.run().then(() => toast({ title: 'The next check fails' }))}
          className="justify-self-end rounded-sm border border-line border-dashed px-2 py-1 font-mono text-label text-text-3 outline-none hover:text-text focus-visible:ring-focus"
        >
          Prototype only · Fail the next check
        </button>
      )}
    </Group>
  )
}

function PassThroughHelp() {
  return (
    <div className="grid gap-2">
      <p className="text-caption text-text-2">
        highsea’s compose files give it Intel and AMD graphics already. If yours is older, add these
        lines and restart the container, and highsea checks the chip as it starts. For NVIDIA,
        install NVIDIA’s container toolkit on the host, then run these commands there.
      </p>
      <CopyBlock
        label="Compose lines for Intel and AMD"
        text={`services:\n  highsea:\n    volumes:\n      - /dev/dri:/dev/dri\n    device_cgroup_rules:\n      - "c 226:128 rw"\n      - "c 226:129 rw"\n      - "c 226:130 rw"\n      - "c 226:131 rw"\n      - "c 226:132 rw"\n      - "c 226:133 rw"\n      - "c 226:134 rw"\n      - "c 226:135 rw"`}
      />
      <CopyBlock
        label="Commands for NVIDIA, on the host"
        text={`sudo nvidia-ctk runtime configure --runtime=docker --set-as-default\nsudo systemctl restart docker`}
      />
      <a
        href="https://docs.highsea.tv/settings/playback"
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1 justify-self-start text-text text-ui underline underline-offset-2"
      >
        Hardware acceleration in the guide
        <Icon name="external" size={12} className="text-text-3" />
      </a>
    </div>
  )
}

// ---------------------------------------------------------------- transcoding

function TranscodingGroup({ v, set }: GroupProps) {
  return (
    <Group
      title="Transcoding"
      description="highsea plays a film as it is when the device can. It converts only what the device can’t play."
    >
      <div className="grid items-start gap-4 medium:grid-cols-2">
        <Field label="Transcodes at once" hint="More wait until one finishes.">
          <Input
            type="number"
            min={1}
            max={12}
            value={v.maxTranscodes}
            onChange={(e) => set({ maxTranscodes: Number(e.target.value) })}
          />
        </Field>
        <Field
          label="Encoder"
          hint={
            v.preset === 'speed'
              ? 'Starts sooner and uses less of the machine. Pictures are a little softer.'
              : v.preset === 'quality'
                ? 'Sharper pictures at the same bitrate. Uses more of the machine.'
                : 'Sharp pictures that start quickly. Right for most servers.'
          }
        >
          <SegmentedControl
            aria-label="Encoder"
            size="sm"
            value={v.preset}
            onValueChange={(preset) => set({ preset: preset as PlaybackSettings['preset'] })}
            options={[
              { value: 'speed', label: 'Faster' },
              { value: 'balanced', label: 'Balanced' },
              { value: 'quality', label: 'Sharper' },
            ]}
            className="justify-self-start"
          />
        </Field>
      </div>
    </Group>
  )
}

// ---------------------------------------------------------------- remote

const ceilings: { value: string; label: string }[] = [
  { value: '4', label: '4 Mbps · 720p' },
  { value: '8', label: '8 Mbps · 1080p' },
  { value: '12', label: '12 Mbps · 1080p, high' },
  { value: '20', label: '20 Mbps · 4K, compressed' },
  { value: '40', label: '40 Mbps · 4K' },
  { value: 'none', label: 'No limit' },
]

function RemoteGroup({ v, set }: GroupProps) {
  return (
    <Group
      title="Away from home"
      description="Streams on your own network are never limited. Away from home, highsea sends no more than this to each person."
    >
      <Field
        label="The most each stream is sent"
        hint="Set it below your upload speed, shared by everyone watching at once. People can choose less in their apps."
      >
        <Select
          value={v.remoteMaxMbps === null ? 'none' : String(v.remoteMaxMbps)}
          onValueChange={(m) => set({ remoteMaxMbps: m === 'none' ? null : Number(m) })}
          options={ceilings}
        />
      </Field>
    </Group>
  )
}

// ---------------------------------------------------------------- cache

function CacheGroup({ v, set, status }: GroupProps & { status: PlaybackStatus }) {
  const clear = useAction((c) => c.transcoding.clearCache())
  const fill = useAction((c) => c.transcoding.simulateFull())
  const c = status.cache
  const share = Math.min(1, c.transcodeBytes / c.limitBytes)
  return (
    <Group
      title="Cache"
      description="Transcoded segments are kept while a film plays and a while after, so seeking back is instant."
    >
      <div className="grid gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <p className="text-text text-ui">
            <span className="font-semibold tabular-nums">{bytes(c.transcodeBytes)}</span>
            <span className="text-text-2"> of {bytes(c.limitBytes)} for transcodes</span>
          </p>
          {c.over && <Badge tone="warning">Over its limit</Badge>}
        </div>
        <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-s3">
          <div
            className={cn('h-full rounded-full', c.over ? 'bg-warning' : 'bg-accent')}
            style={{ width: `${share * 100}%` }}
          />
        </div>
        {c.over && (
          <p className="text-caption text-text-2">
            highsea removes the oldest segments first, from films nobody is watching. Raise the
            limit if it stays over while people watch.
          </p>
        )}
        <p className="text-caption text-text-3">
          Preview images for the scrubber take {bytes(c.trickplayBytes)}. They’re kept with each
          film and don’t count towards the limit.
        </p>
      </div>
      <div className="grid items-start gap-4 medium:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Field label="Folder" hint="A fast disk helps. It needn’t be backed up.">
          <Input
            value={v.cachePath}
            onChange={(e) => set({ cachePath: e.target.value })}
            className="font-mono"
          />
        </Field>
        <Field label="Limit, in GB">
          <Input
            type="number"
            min={2}
            max={2000}
            value={v.cacheLimitGb}
            onChange={(e) => set({ cacheLimitGb: Number(e.target.value) })}
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          icon="delete"
          loading={clear.pending}
          disabled={c.transcodeBytes === 0}
          onClick={() => clear.run().then(() => toast.success('Transcode cache cleared'))}
        >
          Clear transcodes
        </Button>
        <span className="text-caption text-text-3">
          Films playing now make their segments again.
        </span>
        {!c.over && (
          <button
            type="button"
            onClick={() => fill.run()}
            className="ms-auto rounded-sm border border-line border-dashed px-2 py-1 font-mono text-label text-text-3 outline-none hover:text-text focus-visible:ring-focus"
          >
            Prototype only · Fill the cache
          </button>
        )}
      </div>
    </Group>
  )
}

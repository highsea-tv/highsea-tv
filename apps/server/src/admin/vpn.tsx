'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Settings › VPN (docs/product/vpn.md), ported from the signed-off prototype
// (design/prototypes/src/admin/settings/vpn.tsx): status first, with the checks; then how highsea
// connects, and what it does with the tunnel. The owner's only (ADR 0032's answers). The secrets,
// a WireGuard configuration, PIA's password and gluetun's API key, are write-only: the settings
// say whether one is set, and the draft holds a new one until Save. Built-in mode (highsea
// connects) is 6b's, so its card is shown as the prototype has it but can't be picked yet. The
// interfaces, providers and compose block come from the server, not the prototype's tables, and
// the prototype's "Drop the tunnel" button, which only drove the mock, is left out.
import type {
  VpnCheck,
  VpnInterface,
  VpnProvider,
  VpnSettings,
  VpnSettingsInput,
  VpnStatus,
} from '@highsea/api-contract'
import type { T as Translate } from '@highsea/i18n'
import { useT } from '@highsea/i18n/react'
import { useAction, useQuery } from '@highsea/sdk/react'
import {
  Badge,
  type BadgeTone,
  Button,
  cn,
  Field,
  Icon,
  type IconName,
  Input,
  Select,
  Switch,
  Textarea,
  toast,
} from '@highsea/ui-web'
import { type ReactNode, useState } from 'react'
import { Loadable } from './loadable.tsx'
import { AreaPage, Group, SaveBar } from './settings.tsx'
import { useRelative } from './time.ts'
import { vpn as messages } from './vpn-messages.ts'

type T = Translate<typeof messages>

/** The settings with the secrets the owner has typed and not yet saved. */
type Draft = VpnSettings & { config?: string; piaPassword?: string; containerKey?: string }
type Set = (patch: Partial<Draft>) => void

const MODES = ['builtin', 'container', 'interface', 'off'] as const
/** Built-in mode arrives with 6b. */
const LATER: ReadonlySet<Draft['mode']> = new Set(['builtin'])

const CONTAINER_URL = /^https?:\/\/[^\s/]+/

/** The lines highsea's own compose service needs for the tunnel (vpn.md, the capability). */
const CAPABILITY_LINES = `services:\n  highsea:\n    cap_add:\n      - NET_ADMIN\n    # devices:\n    #   - /dev/net/tun:/dev/net/tun`

const STATUS_TOPICS = ['vpn.updated']
const SETTINGS_TOPICS = ['vpn.updated', 'settings.updated']

/** The field a refused save names (`details.field`), to show its message under that field. */
function fieldOf(error: unknown): string | undefined {
  const details = (error as { details?: unknown } | null)?.details
  const field = (details as { field?: unknown } | undefined)?.field
  return typeof field === 'string' ? field : undefined
}

export function Vpn() {
  const t = useT(messages)
  const settings = useQuery('settings:vpn', (c) => c.vpn.settings(), SETTINGS_TOPICS)
  const status = useQuery('vpn:status', (c) => c.vpn.status(), STATUS_TOPICS)
  return (
    <AreaPage id="vpn">
      <Loadable query={settings} what={t('what')}>
        {/* a fresh draft whenever the saved settings change */}
        {(s) => (
          <Form key={JSON.stringify(s)} loaded={s} status={status.data} reload={settings.refetch} />
        )}
      </Loadable>
    </AreaPage>
  )
}

function Form({
  loaded,
  status,
  reload,
}: {
  loaded: VpnSettings
  status: VpnStatus | undefined
  reload: () => void
}) {
  const t = useT(messages)
  const [draft, setDraft] = useState<Draft>(loaded)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const save = useAction((c, body: VpnSettingsInput) => c.vpn.save({ body }))
  const set: Set = (patch) => {
    setErrors({})
    setDraft((d) => ({ ...d, ...patch }))
  }
  const dirty = JSON.stringify(draft) !== JSON.stringify(loaded)

  const submit = async () => {
    if (draft.mode === 'container' && !CONTAINER_URL.test(draft.containerUrl)) return
    const { piaPasswordSet, containerKeySet, config, piaPassword, containerKey, ...rest } = draft
    const body: VpnSettingsInput = {
      ...rest,
      ...(config !== undefined ? { config } : {}),
      ...(piaPassword ? { piaPassword } : {}),
      ...(containerKey ? { containerKey } : {}),
    }
    try {
      await save.run(body)
    } catch (e) {
      const field = fieldOf(e)
      if (field) setErrors({ [field]: (e as Error).message })
      return toast.error(t('saveError'), { description: (e as Error).message })
    }
    toast.success(t('saved'))
    reload()
  }

  return (
    <>
      {status && <StatusGroup status={status} />}
      <ConnectionGroup v={draft} set={set} errors={errors} />
      {draft.mode !== 'off' && <BehaviourGroup v={draft} set={set} />}
      <SaveBar
        dirty={dirty}
        saving={save.pending}
        onSave={submit}
        onDiscard={() => {
          setErrors({})
          setDraft(loaded)
        }}
      />
    </>
  )
}

// ---------------------------------------------------------------- status

const stateLine = (
  v: VpnStatus,
  t: T,
): { icon: IconName; tone: string; title: string; line: string } => {
  const provider = v.provider ?? ''
  switch (v.state) {
    case 'off':
      return {
        icon: 'warning',
        tone: 'text-warning',
        title: t('state.off'),
        line: t('state.off.line'),
      }
    case 'connecting':
      return {
        icon: 'loading',
        tone: 'text-text-2 animate-spin motion-reduce:animate-none',
        title: t('state.connecting', { provider }),
        line: t('state.connecting.line'),
      }
    case 'connected':
      return {
        icon: 'shield',
        tone: 'text-success',
        title:
          v.mode === 'interface'
            ? t('state.bound', { provider })
            : t('state.connected', { provider }),
        line: !v.exitIp
          ? t('state.connected.lineNoIp')
          : v.country
            ? t('state.connected.line', { ip: v.exitIp, country: v.country })
            : t('state.connected.lineNoCountry', { ip: v.exitIp }),
      }
    case 'down':
      return {
        icon: 'error',
        tone: 'text-danger',
        title: t('state.down', { provider }),
        line: t('state.down.line'),
      }
    case 'failed':
      return {
        icon: 'error',
        tone: 'text-danger',
        title: v.needsCapability ? t('state.capability') : t('state.failed'),
        line: v.message ?? '',
      }
  }
}

const marks: Record<VpnCheck['result'], { icon: IconName; tone: string }> = {
  pass: { icon: 'success', tone: 'text-success' },
  warn: { icon: 'warning', tone: 'text-warning' },
  fail: { icon: 'error', tone: 'text-danger' },
  info: { icon: 'info', tone: 'text-text-3' },
  pending: { icon: 'clock', tone: 'text-text-3' },
}

function StatusGroup({ status: v }: { status: VpnStatus }) {
  const t = useT(messages)
  const { now, relative } = useRelative()
  const check = useAction((c) => c.vpn.check())
  const reconnect = useAction((c) => c.vpn.reconnect())
  const head = stateLine(v, t)
  const checkedJustNow = v.checkedAt !== null && now - Date.parse(v.checkedAt) < 60_000
  return (
    <Group title={t('status.title')}>
      <div role="status" className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5">
        <Icon name={head.icon} size={20} className={cn('row-span-2 mt-0.5', head.tone)} />
        <p className="font-semibold text-text text-ui">{head.title}</p>
        <p className="text-caption text-text-2">{head.line}</p>
      </div>
      {v.needsCapability && <CapabilityHelp />}
      {v.checks.length > 0 && (
        <ul
          aria-label={t('checks')}
          className="grid divide-y divide-line rounded-md border border-line"
        >
          {v.checks.map((c) => {
            const m = marks[c.result]
            return (
              <li
                key={c.id}
                className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 px-3 py-2.5 medium:grid-cols-[auto_8rem_minmax(0,1fr)]"
              >
                <Icon
                  name={m.icon}
                  size={16}
                  aria-label={t(`mark.${c.result}`)}
                  className={cn('mt-0.5', m.tone)}
                />
                <span className="font-medium text-text text-ui">{c.label}</span>
                <span className="col-start-2 text-caption text-text-2 medium:col-start-3 medium:text-ui">
                  <span className="text-text">{c.title}</span>
                  {c.detail ? <> · {c.detail}</> : c.title.endsWith('.') ? '' : '.'}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {v.state !== 'off' && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            icon="refresh"
            loading={check.pending}
            disabled={v.state !== 'connected'}
            onClick={() =>
              check.run().then(
                () => toast.success(t('checkedNow')),
                (e: Error) => toast.error(t('checkError'), { description: e.message }),
              )
            }
          >
            {t('checkNow')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            loading={reconnect.pending}
            disabled={v.state === 'connecting' || v.needsCapability}
            onClick={() =>
              reconnect
                .run()
                .catch((e: Error) => toast.error(t('reconnectError'), { description: e.message }))
            }
          >
            {t('reconnect')}
          </Button>
          {v.checkedAt && v.state === 'connected' && (
            <span className="text-caption text-text-3">
              {checkedJustNow ? t('checkedNow') : t('checkedAgo', { ago: relative(v.checkedAt) })}
            </span>
          )}
        </div>
      )}
    </Group>
  )
}

function CopyBlock({ label, text }: { label: string; text: string }) {
  const t = useT(messages)
  return (
    <figure aria-label={label} className="grid gap-2">
      <pre className="overflow-x-auto rounded-md border border-line bg-s2 p-3 font-mono text-figure text-text-2">
        {text}
      </pre>
      <Button
        size="sm"
        variant="secondary"
        icon="copy"
        className="justify-self-start"
        onClick={() =>
          (navigator.clipboard?.writeText(text) ?? Promise.reject(new Error('no clipboard'))).then(
            () => toast.success(t('copied')),
            () => toast.error(t('copyError'), { description: t('copyErrorDetail') }),
          )
        }
      >
        {t('copy')}
      </Button>
    </figure>
  )
}

function CapabilityHelp() {
  const t = useT(messages)
  return (
    <div className="grid gap-2">
      <p className="text-caption text-text-2">{t('capabilityHelp')}</p>
      <CopyBlock label={t('composeLines')} text={CAPABILITY_LINES} />
    </div>
  )
}

// ---------------------------------------------------------------- connection

function ConnectionGroup({
  v,
  set,
  errors,
}: {
  v: Draft
  set: Set
  errors: Record<string, string>
}) {
  const t = useT(messages)
  return (
    <Group title={t('connection.title')} description={t('connection.description')}>
      <fieldset className="grid gap-2 medium:grid-cols-2">
        <legend className="sr-only">{t('mode.legend')}</legend>
        {MODES.map((m) => {
          const later = LATER.has(m) && v.mode !== m
          return (
            <label
              key={m}
              className={cn(
                'grid grid-cols-[auto_minmax(0,1fr)] content-start gap-x-2.5 gap-y-0.5 rounded-md border p-3 transition-tint has-[:focus-visible]:ring-focus',
                later ? 'cursor-not-allowed border-line' : 'cursor-pointer',
                v.mode === m ? 'border-accent bg-accent-soft' : !later && 'border-line hover:bg-s2',
              )}
            >
              <input
                type="radio"
                name="vpn-mode"
                value={m}
                checked={v.mode === m}
                disabled={later}
                aria-describedby={later ? `vpn-later-${m}` : undefined}
                onChange={() => set({ mode: m })}
                className="mt-1 accent-[var(--color-accent)]"
              />
              <span className={cn('font-semibold text-ui', later ? 'text-text-2' : 'text-text')}>
                {t(`mode.${m}`)}
                {m === 'builtin' && (
                  <Badge tone="accent" className="ms-2 align-middle">
                    {t('recommended')}
                  </Badge>
                )}
              </span>
              <span className="col-start-2 text-caption text-text-3">{t(`mode.${m}.line`)}</span>
              {LATER.has(m) && (
                <span id={`vpn-later-${m}`} className="col-start-2 text-caption text-text-2">
                  {t('mode.builtin.later')}
                </span>
              )}
            </label>
          )
        })}
      </fieldset>
      {v.mode === 'builtin' && <BuiltIn v={v} set={set} />}
      {v.mode === 'container' && <Container v={v} set={set} errors={errors} />}
      {v.mode === 'interface' && <InterfacePicker v={v} set={set} error={errors.interface} />}
    </Group>
  )
}

function InterfacePicker({ v, set, error }: { v: Draft; set: Set; error?: string }) {
  const t = useT(messages)
  const interfaces = useQuery('vpn:interfaces', (c) => c.vpn.interfaces())
  const label = (i: VpnInterface) => (i.ipv4 ? `${i.name} · ${i.ipv4}` : i.name)
  return (
    <div className="grid gap-4 medium:grid-cols-2">
      <Loadable query={interfaces} what={t('interface').toLowerCase()} skeleton={null}>
        {(list) => {
          const options = list.map((i) => ({ value: i.name, label: label(i) }))
          // a saved interface that's gone stays visible, so the draft doesn't change by itself
          if (v.interface && !list.some((i) => i.name === v.interface))
            options.unshift({ value: v.interface, label: v.interface })
          return (
            <Field
              label={t('interface')}
              hint={options.length ? t('interfaceHint') : t('interfaceNone')}
              error={error}
            >
              <Select
                value={v.interface || undefined}
                placeholder={t('interfaceChoose')}
                disabled={!options.length}
                onValueChange={(i) => set({ interface: i })}
                options={options}
              />
            </Field>
          )
        }}
      </Loadable>
    </div>
  )
}

function Steps({ provider }: { provider: VpnProvider }) {
  return (
    <ol className="grid list-decimal gap-1 ps-5 text-caption text-text-2 marker:text-text-3">
      {provider.steps.map((step) => (
        <li key={step}>{step}</li>
      ))}
    </ol>
  )
}

/** Shown only when the stored mode is built-in, which the page can't pick until 6b. */
function BuiltIn({ v, set }: { v: Draft; set: Set }) {
  const t = useT(messages)
  const providers = useQuery('vpn:providers', (c) => c.vpn.providers())
  const [pasting, setPasting] = useState(false)
  return (
    <Loadable query={providers} what={t('provider').toLowerCase()} skeleton={null}>
      {(list) => {
        const provider = list.find((p) => p.id === v.provider) ?? list[0]
        if (!provider) return null
        return (
          <div className="grid gap-4 border-line border-t pt-4">
            <div className="grid gap-4 medium:grid-cols-2">
              <Field label={t('provider')}>
                <Select
                  value={provider.id}
                  onValueChange={(id) =>
                    set({ provider: id, config: undefined, configName: null, staticPort: null })
                  }
                  options={list.map((p) => ({ value: p.id, label: p.name }))}
                />
              </Field>
            </div>
            <Steps provider={provider} />
            {provider.connect === 'account' ? (
              <div className="grid gap-4 medium:grid-cols-3">
                <Field label={t('username')}>
                  <Input
                    value={v.piaUsername}
                    autoComplete="off"
                    placeholder="p1234567"
                    onChange={(e) => set({ piaUsername: e.target.value })}
                    className="font-mono"
                  />
                </Field>
                <Field label={t('password')} hint={v.piaPasswordSet ? t('secretSet') : undefined}>
                  <Input
                    type="password"
                    autoComplete="off"
                    value={v.piaPassword ?? ''}
                    placeholder={v.piaPasswordSet ? '••••••••' : ''}
                    onChange={(e) => set({ piaPassword: e.target.value })}
                  />
                </Field>
                <Field label={t('region')} hint={t('regionHint')}>
                  <Select
                    value={v.piaRegion || undefined}
                    onValueChange={(piaRegion) => set({ piaRegion })}
                    options={(provider.regions ?? []).map((r) => ({ value: r, label: r }))}
                  />
                </Field>
              </div>
            ) : (
              <div className="grid gap-2">
                <p className="font-medium text-text text-ui">{t('config')}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-line bg-s2 px-3 py-1.5 text-text text-ui hover:bg-s3 has-[:focus-visible]:ring-focus">
                    <Icon name="upload" size={16} />
                    {v.configName || v.config !== undefined
                      ? t('configReplace')
                      : t('configUpload')}
                    <input
                      type="file"
                      accept=".conf,text/plain"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file)
                          file.text().then((config) => set({ config, configName: file.name }))
                      }}
                    />
                  </label>
                  <Button size="sm" variant="ghost" onClick={() => setPasting((p) => !p)}>
                    {pasting ? t('configHide') : t('configPaste')}
                  </Button>
                  {v.configName && (
                    <span className="flex min-w-0 items-center gap-1.5 text-caption text-text-2">
                      <Icon name="check" size={14} className="text-success" />
                      <span className="truncate font-mono">{v.configName}</span>
                      {v.config === undefined && (
                        <span className="text-text-3">{t('configKept')}</span>
                      )}
                    </span>
                  )}
                </div>
                {pasting && (
                  <Field label={t('configPasteLabel')}>
                    <Textarea
                      rows={6}
                      spellCheck={false}
                      placeholder={
                        '[Interface]\nPrivateKey = …\nAddress = 10.2.0.2/32\n\n[Peer]\n…'
                      }
                      value={v.config ?? ''}
                      onChange={(e) =>
                        set({ config: e.target.value, configName: v.configName ?? 'pasted.conf' })
                      }
                      className="font-mono"
                    />
                  </Field>
                )}
                {provider.portForwarding === 'static' && (
                  <div className="grid gap-4 medium:grid-cols-3">
                    <Field label={t('staticPort')} hint={t('staticPortHint')}>
                      <Input
                        type="number"
                        min={1024}
                        max={65535}
                        value={v.staticPort ?? ''}
                        onChange={(e) =>
                          set({ staticPort: e.target.value ? Number(e.target.value) : null })
                        }
                        className="font-mono"
                      />
                    </Field>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      }}
    </Loadable>
  )
}

function Container({ v, set, errors }: { v: Draft; set: Set; errors: Record<string, string> }) {
  const t = useT(messages)
  const urlError = !CONTAINER_URL.test(v.containerUrl)
  return (
    <div className="grid gap-4 border-line border-t pt-4">
      <div className="grid gap-4 medium:grid-cols-2">
        <Field
          label={t('controlServer')}
          hint={t('controlServerHint')}
          error={urlError ? t('controlServerInvalid') : errors.containerUrl}
        >
          <Input
            value={v.containerUrl}
            spellCheck={false}
            autoCapitalize="none"
            onChange={(e) => set({ containerUrl: e.target.value })}
            className="font-mono"
          />
        </Field>
        <Field
          label={t('apiKey')}
          hint={v.containerKeySet ? t('secretSet') : t('apiKeyHint')}
          error={errors.containerKey}
        >
          <Input
            type="password"
            autoComplete="off"
            value={v.containerKey ?? ''}
            placeholder={v.containerKeySet ? '••••••••' : ''}
            onChange={(e) => set({ containerKey: e.target.value })}
          />
        </Field>
      </div>
      <details className="group grid gap-3 rounded-md border border-line p-3">
        <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-text text-ui outline-none focus-visible:ring-focus">
          <Icon
            name="chevron-right"
            size={16}
            className="transition-transform group-open:rotate-90 motion-reduce:transition-none"
          />
          {t('compose')}
        </summary>
        <div className="mt-3 grid gap-3">
          <p className="text-caption text-text-2">{t('composeBody')}</p>
          <Compose />
        </div>
      </details>
    </div>
  )
}

/** The provider picker and its compose block, written by the server (`vpn.compose`). */
function Compose() {
  const t = useT(messages)
  const providers = useQuery('vpn:providers', (c) => c.vpn.providers())
  const [chosen, setChosen] = useState<string | null>(null)
  const id = chosen ?? (providers.status === 'success' ? (providers.data[0]?.id ?? null) : null)
  return (
    <Loadable query={providers} what={t('provider').toLowerCase()} skeleton={null}>
      {(list) => (
        <>
          <div className="grid gap-4 medium:grid-cols-2">
            <Field label={t('provider')}>
              <Select
                value={id ?? undefined}
                onValueChange={setChosen}
                options={list.map((p) => ({ value: p.id, label: p.name }))}
              />
            </Field>
          </div>
          {id && <ComposeBlock provider={id} />}
        </>
      )}
    </Loadable>
  )
}

function ComposeBlock({ provider }: { provider: string }) {
  const t = useT(messages)
  const block = useQuery(`vpn:compose:${provider}`, (c) => c.vpn.compose({ body: { provider } }))
  if (block.status === 'error')
    return <p className="text-caption text-danger">{t('composeError')}</p>
  if (block.status === 'loading') return null
  return <CopyBlock label={t('composeBlock')} text={block.data.yaml} />
}

// ---------------------------------------------------------------- behaviour

function BehaviourGroup({ v, set }: { v: Draft; set: Set }) {
  const t = useT(messages)
  const providers = useQuery('vpn:providers', (c) => c.vpn.providers())
  const provider =
    providers.status === 'success' ? providers.data.find((p) => p.id === v.provider) : undefined
  const forwards =
    v.mode === 'container' || (v.mode === 'builtin' && provider?.portForwarding !== 'none')
  return (
    <Group title={t('behaviour.title')}>
      <Field
        inline
        label={t('stopWhenDown')}
        hint={
          v.mode === 'builtin'
            ? t('stopWhenDown.builtin')
            : v.mode === 'container'
              ? t('stopWhenDown.container')
              : t('stopWhenDown.interface')
        }
      >
        <Switch checked disabled aria-readonly />
      </Field>
      {forwards && (
        <Field inline label={t('useForwardedPort')} hint={t('useForwardedPortHint')}>
          <Switch
            checked={v.useForwardedPort}
            onCheckedChange={(useForwardedPort) => set({ useForwardedPort })}
          />
        </Field>
      )}
      <Field inline label={t('indexersThroughVpn')} hint={t('indexersThroughVpnHint')}>
        <Switch
          checked={v.indexersThroughVpn}
          onCheckedChange={(indexersThroughVpn) => set({ indexersThroughVpn })}
        />
      </Field>
    </Group>
  )
}

// ---------------------------------------------------------------- elsewhere

const toneOf: Record<VpnStatus['state'], BadgeTone> = {
  off: 'warning',
  connecting: 'neutral',
  connected: 'success',
  down: 'danger',
  failed: 'danger',
}

/** Download client's VPN line: the status in one line, and the way to the VPN area. */
export function VpnSummary({ action }: { action: ReactNode }) {
  const t = useT(messages)
  const status = useQuery('vpn:status', (c) => c.vpn.status(), STATUS_TOPICS)
  if (status.status !== 'success') return null
  const head = stateLine(status.data, t)
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-s2 p-3">
      <Badge tone={toneOf[status.data.state]}>{head.title}</Badge>
      <span className="min-w-0 flex-1 text-caption text-text-3">{head.line}</span>
      {action}
    </div>
  )
}

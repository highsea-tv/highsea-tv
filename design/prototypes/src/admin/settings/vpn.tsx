// SPDX-License-Identifier: AGPL-3.0-only
// Settings › VPN (docs/product/vpn.md; checkpoint 6, answer V5: prototyped before it's built).
// Status first, with the checks; then how highsea connects, and what it does with the tunnel. The
// mock plays connecting, connected, down and the ways a connection fails.

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
} from '@highsea-tv/ui-web'
import { type ReactNode, useState } from 'react'
import { useAction, useNow, useQuery } from '../../mock/hooks.tsx'
import {
  providerById,
  type VpnCheck,
  type VpnMode,
  type VpnProvider,
  type VpnSettings,
  type VpnStatus,
  vpnProviders,
} from '../../mock/vpn.ts'
import { AreaPage, Group, SaveBar, useSettingsDraft } from './settings.tsx'

const modes: { id: VpnMode; label: string; line: string }[] = [
  {
    id: 'builtin',
    label: 'highsea connects',
    line: 'highsea runs a WireGuard tunnel to your provider. Only torrents use it, and they can’t leave outside it.',
  },
  {
    id: 'container',
    label: 'A VPN container',
    line: 'highsea shares a gluetun container’s network and reads its status and forwarded port.',
  },
  {
    id: 'interface',
    label: 'An interface on this machine',
    line: 'Torrents are bound to a tunnel you run yourself. Your system’s routing decides the path.',
  },
  {
    id: 'off',
    label: 'Off',
    line: 'Torrents use your own connection. Anyone in the swarm can see your address.',
  },
]

export function Vpn() {
  const s = useSettingsDraft('vpn')
  const status = useQuery('vpn:status', (c) => c.vpn.status(), ['vpn.updated'])
  return (
    <AreaPage id="vpn">
      {s.query.status === 'error' ? (
        <p className="text-badge-danger text-ui">
          Couldn’t load these settings. {s.query.error.message}
        </p>
      ) : !s.draft ? (
        <p aria-busy className="text-caption text-text-3">
          Loading…
        </p>
      ) : (
        <>
          {status.data && <StatusGroup status={status.data} />}
          <ConnectionGroup v={s.draft} set={s.set} />
          {s.draft.mode !== 'off' && <BehaviourGroup v={s.draft} set={s.set} />}
          <SaveBar
            dirty={s.dirty}
            saving={s.saving}
            onDiscard={s.discard}
            onSave={() =>
              s
                .save()
                .then((saved) => {
                  // secrets come back as set or not, so the draft takes the saved shape
                  if (saved) s.replace(saved as VpnSettings)
                  toast.success('Settings saved')
                })
                .catch((e: Error) => toast.error('Couldn’t save', { description: e.message }))
            }
          />
        </>
      )}
    </AreaPage>
  )
}

// ---------------------------------------------------------------- status

const stateLine = (v: VpnStatus): { icon: IconName; tone: string; title: string; line: string } => {
  switch (v.state) {
    case 'off':
      return {
        icon: 'warning',
        tone: 'text-warning',
        title: 'No VPN',
        line: 'Torrents use your own connection. Anyone in the swarm can see your address.',
      }
    case 'connecting':
      return {
        icon: 'loading',
        tone: 'text-text-2 animate-spin motion-reduce:animate-none',
        title: `Connecting to ${v.provider}…`,
        line: 'Torrents wait until the tunnel is up.',
      }
    case 'connected':
      return {
        icon: 'shield',
        tone: 'text-success',
        title:
          v.mode === 'interface' ? `Bound to ${v.provider}` : `Connected through ${v.provider}`,
        line: `All torrent traffic leaves through ${v.exitIp} (${v.country}).`,
      }
    case 'down':
      return {
        icon: 'error',
        tone: 'text-danger',
        title: `${v.provider} is down`,
        line: 'Torrents are stopped until the tunnel is back. Nothing leaks onto your own connection.',
      }
    case 'failed':
      return {
        icon: 'error',
        tone: 'text-danger',
        title: v.needsCapability ? 'highsea can’t run the tunnel yet' : 'Couldn’t connect',
        line: v.message ?? '',
      }
  }
}

const marks: Record<VpnCheck['result'], { icon: IconName; tone: string; label: string }> = {
  pass: { icon: 'success', tone: 'text-success', label: 'Passed' },
  warn: { icon: 'warning', tone: 'text-warning', label: 'Warning' },
  fail: { icon: 'error', tone: 'text-danger', label: 'Failed' },
  info: { icon: 'info', tone: 'text-text-3', label: 'Note' },
  pending: { icon: 'clock', tone: 'text-text-3', label: 'Waiting' },
}

const ago = (iso: string, now: number) => {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
  return s < 60 ? 'just now' : `${Math.round(s / 60)} minutes ago`
}

function StatusGroup({ status: v }: { status: VpnStatus }) {
  const check = useAction((c) => c.vpn.check())
  const reconnect = useAction((c) => c.vpn.reconnect())
  const drop = useAction((c) => c.vpn.simulateDrop())
  const head = stateLine(v)
  const now = useNow()
  return (
    <Group title="Status">
      <div role="status" className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5">
        <Icon name={head.icon} size={20} className={cn('row-span-2 mt-0.5', head.tone)} />
        <p className="font-semibold text-text text-ui">{head.title}</p>
        <p className="text-caption text-text-2">{head.line}</p>
      </div>
      {v.needsCapability && <CapabilityHelp />}
      {v.checks.length > 0 && (
        <ul aria-label="Checks" className="grid divide-y divide-line rounded-md border border-line">
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
                  aria-label={m.label}
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
            onClick={() => check.run().then(() => toast.success('Checked just now'))}
          >
            Check now
          </Button>
          <Button
            size="sm"
            variant="ghost"
            loading={reconnect.pending}
            disabled={v.state === 'connecting' || v.needsCapability}
            onClick={() => reconnect.run()}
          >
            Reconnect
          </Button>
          {v.checkedAt && v.state === 'connected' && (
            <span className="text-caption text-text-3">Checked {ago(v.checkedAt, now)}</span>
          )}
          {v.state === 'connected' && (
            <button
              type="button"
              onClick={() => drop.run()}
              className="ms-auto rounded-sm border border-line border-dashed px-2 py-1 font-mono text-label text-text-3 outline-none hover:text-text focus-visible:ring-focus"
            >
              Prototype only · Drop the tunnel
            </button>
          )}
        </div>
      )}
    </Group>
  )
}

export function CopyBlock({ label, text }: { label: string; text: string }) {
  return (
    <figure aria-label={label} className="grid gap-2">
      <pre
        // biome-ignore lint/a11y/noNoninteractiveTabindex: it scrolls sideways when the lines are longer than the panel, and a scrolling region must take focus to scroll by keyboard (axe’s scrollable-region-focusable)
        tabIndex={0}
        className="overflow-x-auto rounded-md border border-line bg-s2 p-3 font-mono text-figure text-text-2"
      >
        {text}
      </pre>
      <Button
        size="sm"
        variant="secondary"
        icon="copy"
        className="justify-self-start"
        onClick={() =>
          navigator.clipboard
            ?.writeText(text)
            .then(() => toast.success('Copied'))
            .catch(() => toast.error('Couldn’t copy', { description: 'Select the text instead.' }))
        }
      >
        Copy
      </Button>
    </figure>
  )
}

function CapabilityHelp() {
  return (
    <div className="grid gap-2">
      <p className="text-caption text-text-2">
        The capability reaches only highsea’s own container, not the host. On an older NAS kernel
        without WireGuard, uncomment the device as well.
      </p>
      <CopyBlock
        label="Compose lines"
        text={`services:\n  highsea:\n    cap_add:\n      - NET_ADMIN\n    # devices:\n    #   - /dev/net/tun:/dev/net/tun`}
      />
    </div>
  )
}

// ---------------------------------------------------------------- connection

type Set = (patch: Partial<VpnSettings>) => void

function ConnectionGroup({ v, set }: { v: VpnSettings; set: Set }) {
  return (
    <Group title="Connection" description="How torrents reach your VPN.">
      <fieldset className="grid gap-2 medium:grid-cols-2">
        <legend className="sr-only">Mode</legend>
        {modes.map((m) => (
          <label
            key={m.id}
            className={cn(
              'grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 gap-y-0.5 rounded-md border p-3 transition-tint has-[:focus-visible]:ring-focus',
              v.mode === m.id ? 'border-accent bg-accent-soft' : 'border-line hover:bg-s2',
            )}
          >
            <input
              type="radio"
              name="vpn-mode"
              value={m.id}
              checked={v.mode === m.id}
              onChange={() => set({ mode: m.id })}
              className="mt-1 accent-[var(--color-accent)] outline-none"
            />
            <span className="font-semibold text-text text-ui">
              {m.label}
              {m.id === 'builtin' && (
                <Badge tone="accent" className="ms-2 align-middle">
                  Recommended
                </Badge>
              )}
            </span>
            <span className="col-start-2 text-caption text-text-3">{m.line}</span>
          </label>
        ))}
      </fieldset>
      {v.mode === 'builtin' && <BuiltIn v={v} set={set} />}
      {v.mode === 'container' && <Container v={v} set={set} />}
      {v.mode === 'interface' && (
        <div className="grid gap-4 medium:grid-cols-2">
          <Field label="Interface" hint="The ones this server has, besides the LAN.">
            <Select
              value={v.interface}
              onValueChange={(i) => set({ interface: i })}
              options={[
                { value: 'wg0', label: 'wg0 (WireGuard) · 10.2.0.15' },
                { value: 'tun0', label: 'tun0 (OpenVPN) · 10.8.0.6' },
              ]}
            />
          </Field>
        </div>
      )}
    </Group>
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

function BuiltIn({ v, set }: { v: VpnSettings; set: Set }) {
  const provider = providerById(v.provider) ?? (vpnProviders[0] as VpnProvider)
  const [pasting, setPasting] = useState(false)
  return (
    <div className="grid gap-4 border-line border-t pt-4">
      <div className="grid gap-4 medium:grid-cols-2">
        <Field label="Provider">
          <Select
            value={v.provider}
            onValueChange={(provider) =>
              set({ provider, config: undefined, configName: null, staticPort: null })
            }
            options={vpnProviders.map((p) => ({ value: p.id, label: p.name }))}
          />
        </Field>
      </div>
      <Steps provider={provider} />
      {provider.connect === 'account' ? (
        <div className="grid gap-4 medium:grid-cols-3">
          <Field label="Username">
            <Input
              value={v.piaUsername}
              autoComplete="off"
              placeholder="p1234567"
              onChange={(e) => set({ piaUsername: e.target.value })}
              className="font-mono"
            />
          </Field>
          <Field
            label="Password"
            hint={v.piaPasswordSet ? 'Set. Type a new one to replace it.' : undefined}
          >
            <Input
              type="password"
              autoComplete="off"
              value={v.piaPassword ?? ''}
              placeholder={v.piaPasswordSet ? '••••••••' : ''}
              onChange={(e) => set({ piaPassword: e.target.value })}
            />
          </Field>
          <Field label="Region" hint="Each forwards a port.">
            <Select
              value={v.piaRegion}
              onValueChange={(piaRegion) => set({ piaRegion })}
              options={(provider.regions ?? []).map((r) => ({ value: r, label: r }))}
            />
          </Field>
        </div>
      ) : (
        <div className="grid gap-2">
          <p className="font-medium text-text text-ui">WireGuard configuration</p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-line bg-s2 px-3 py-1.5 text-text text-ui hover:bg-s3 has-[:focus-visible]:ring-focus">
              <Icon name="upload" size={16} />
              {v.configName || v.config !== undefined ? 'Replace the file' : 'Upload a file'}
              <input
                type="file"
                accept=".conf,text/plain"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) file.text().then((config) => set({ config, configName: file.name }))
                }}
              />
            </label>
            <Button size="sm" variant="ghost" onClick={() => setPasting((p) => !p)}>
              {pasting ? 'Hide' : 'Paste instead'}
            </Button>
            {v.configName && (
              <span className="flex min-w-0 items-center gap-1.5 text-caption text-text-2">
                <Icon name="check" size={14} className="text-success" />
                <span className="truncate font-mono">{v.configName}</span>
                {v.config === undefined && (
                  <span className="text-text-3">· its keys stay on the server</span>
                )}
              </span>
            )}
          </div>
          {pasting && (
            <Field label="Paste the configuration">
              <Textarea
                rows={6}
                spellCheck={false}
                placeholder={'[Interface]\nPrivateKey = …\nAddress = 10.2.0.2/32\n\n[Peer]\n…'}
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
              <Field label="Forwarded port" hint="Optional. Leave it empty if there isn’t one.">
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
}

/** gluetun's names and variables per provider, from its provider pages. */
const gluetun: Record<string, { name: string; env: string[]; forwards: boolean }> = {
  proton: {
    name: 'protonvpn',
    env: ['VPN_TYPE: wireguard', 'WIREGUARD_PRIVATE_KEY: <from your Proton configuration>'],
    forwards: true,
  },
  pia: {
    name: 'private internet access',
    env: [
      'VPN_TYPE: openvpn',
      'OPENVPN_USER: <your PIA username>',
      'OPENVPN_PASSWORD: <your PIA password>',
    ],
    forwards: true,
  },
  airvpn: {
    name: 'airvpn',
    env: [
      'VPN_TYPE: wireguard',
      'WIREGUARD_PRIVATE_KEY: <from the Config Generator>',
      'WIREGUARD_PRESHARED_KEY: <from the Config Generator>',
      'WIREGUARD_ADDRESSES: <from the Config Generator>',
      'FIREWALL_VPN_INPUT_PORTS: <your reserved port>',
    ],
    forwards: false,
  },
  mullvad: {
    name: 'mullvad',
    env: [
      'VPN_TYPE: wireguard',
      'WIREGUARD_PRIVATE_KEY: <from your Mullvad configuration>',
      'WIREGUARD_ADDRESSES: <from your Mullvad configuration>',
    ],
    forwards: false,
  },
  ivpn: {
    name: 'ivpn',
    env: ['VPN_TYPE: wireguard', 'WIREGUARD_PRIVATE_KEY: <…>', 'WIREGUARD_ADDRESSES: <…>'],
    forwards: false,
  },
  windscribe: {
    name: 'windscribe',
    env: [
      'VPN_TYPE: wireguard',
      'WIREGUARD_PRIVATE_KEY: <…>',
      'WIREGUARD_PRESHARED_KEY: <…>',
      'WIREGUARD_ADDRESSES: <…>',
    ],
    forwards: false,
  },
  surfshark: {
    name: 'surfshark',
    env: ['VPN_TYPE: wireguard', 'WIREGUARD_PRIVATE_KEY: <…>', 'WIREGUARD_ADDRESSES: <…>'],
    forwards: false,
  },
}

const composeFor = (id: string) => {
  const g = gluetun[id] ?? (gluetun.proton as (typeof gluetun)[string])
  return [
    'services:',
    '  gluetun:',
    '    image: qmcgaw/gluetun',
    '    cap_add: [NET_ADMIN]',
    '    devices: [/dev/net/tun:/dev/net/tun]',
    '    ports:',
    '      - "3000:3000"   # highsea’s admin, published here',
    '    environment:',
    `      VPN_SERVICE_PROVIDER: ${g.name}`,
    ...g.env.map((e) => `      ${e}`),
    '      SERVER_COUNTRIES: Netherlands',
    ...(g.forwards ? ['      VPN_PORT_FORWARDING: "on"'] : []),
    `      HTTP_CONTROL_SERVER_AUTH_DEFAULT_ROLE: '{"auth":"apikey","apikey":"<the API key>"}'`,
    '  highsea:',
    '    network_mode: "service:gluetun"',
  ].join('\n')
}

function Container({ v, set }: { v: VpnSettings; set: Set }) {
  const [composeProvider, setComposeProvider] = useState('proton')
  const urlError = !/^https?:\/\/[^\s/]+/.test(v.containerUrl)
  return (
    <div className="grid gap-4 border-line border-t pt-4">
      <div className="grid gap-4 medium:grid-cols-2">
        <Field
          label="Control server"
          hint="The containers share a network, so gluetun is on this machine’s loopback."
          error={urlError ? 'Use a full address, like http://127.0.0.1:8000.' : undefined}
        >
          <Input
            value={v.containerUrl}
            onChange={(e) => set({ containerUrl: e.target.value })}
            className="font-mono"
          />
        </Field>
        <Field
          label="API key"
          hint={
            v.containerKeySet ? 'Set. Type a new one to replace it.' : 'gluetun’s genkey makes one.'
          }
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
          Compose for your provider
        </summary>
        <div className="mt-3 grid gap-3">
          <p className="text-caption text-text-2">
            A gluetun service for your compose file, with highsea joined to its network. Fill in
            what your provider gives you; highsea never gets the Docker socket.
          </p>
          <div className="grid gap-4 medium:grid-cols-2">
            <Field label="Provider">
              <Select
                value={composeProvider}
                onValueChange={setComposeProvider}
                options={vpnProviders
                  .filter((p) => gluetun[p.id])
                  .map((p) => ({ value: p.id, label: p.name }))}
              />
            </Field>
          </div>
          <CopyBlock label="Compose block" text={composeFor(composeProvider)} />
        </div>
      </details>
    </div>
  )
}

// ---------------------------------------------------------------- behaviour

function BehaviourGroup({ v, set }: { v: VpnSettings; set: Set }) {
  const provider = providerById(v.provider)
  const forwards =
    v.mode === 'container' || (v.mode === 'builtin' && provider?.portForwarding !== 'none')
  return (
    <Group title="Behaviour">
      <Field
        inline
        label="Stop torrents when the VPN is down"
        hint={
          v.mode === 'builtin'
            ? 'Always on when highsea connects: a packet from the tunnel’s address can’t leave any other way.'
            : v.mode === 'container'
              ? 'Always on in a VPN container: it has no other route.'
              : 'Torrents stop the moment the interface or its address goes.'
        }
      >
        <Switch checked disabled aria-readonly />
      </Field>
      {forwards && (
        <Field
          inline
          label="Use the forwarded port"
          hint="Torrents listen on the port your provider forwards, and tell trackers when it changes."
        >
          <Switch
            checked={v.useForwardedPort}
            onCheckedChange={(useForwardedPort) => set({ useForwardedPort })}
          />
        </Field>
      )}
      <Field
        inline
        label="Send indexer searches through the VPN too"
        hint="Off by default: a private tracker’s account is often tied to your own address, and searches would fail while the tunnel is down."
      >
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
  const status = useQuery('vpn:status', (c) => c.vpn.status(), ['vpn.updated'])
  const v = status.data
  if (!v) return null
  const head = stateLine(v)
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-s2 p-3">
      <Badge tone={toneOf[v.state]}>{head.title}</Badge>
      <span className="min-w-0 flex-1 text-caption text-text-3">{head.line}</span>
      {action}
    </div>
  )
}

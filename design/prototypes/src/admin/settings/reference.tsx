// SPDX-License-Identifier: AGPL-3.0-only
// A15 Settings, the reference areas (docs/product/settings.md): each area's layout, its values and
// its states, with the main controls working (edit, save, discard) and the rest marked as not in
// the prototype. General, Media management, Import lists and Connections took the built admin's
// form in prototype-gaps.md's stage 5 and have files of their own.

import { describeFormat } from '@highsea-tv/quality/browser'
import {
  Badge,
  Button,
  Field,
  Input,
  SegmentedControl,
  Select,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableFrame,
  TableHead,
  TableHeader,
  TableRow,
} from '@highsea-tv/ui-web'
import { Soon } from '../../kit/soon.tsx'
import { useQuery } from '../../mock/hooks.tsx'
import { adminHref } from '../shell.tsx'
import { Area, options } from './parts.tsx'
import { AreaPage, Group } from './settings.tsx'
import { VpnSummary } from './vpn.tsx'

// ---------------------------------------------------------------- server

export function Network() {
  const server = useQuery('server', (c) => c.system.server(), ['server.updated'])
  return (
    <Area id="network" section="network">
      {(v, set) => {
        const urlError = v.externalUrl && !/^https?:\/\/[^\s/]+/.test(v.externalUrl)
        return (
          <>
            <Group
              title="Remote access"
              description="The address the apps use away from home. On the LAN they find the server on their own."
            >
              <Field
                label="External URL"
                error={
                  urlError ? 'Use a full address, like https://harbor.example.net.' : undefined
                }
              >
                <Input
                  value={v.externalUrl}
                  onChange={(e) => set({ externalUrl: e.target.value })}
                  className="font-mono"
                />
              </Field>
            </Group>
            <Group title="Reverse proxy and TLS">
              <SegmentedControl
                aria-label="TLS"
                size="sm"
                value={v.tls}
                onValueChange={(tls) => set({ tls: tls as 'proxy' | 'built-in' | 'off' })}
                options={[
                  { value: 'proxy', label: 'My proxy handles it' },
                  { value: 'built-in', label: 'Built in' },
                  { value: 'off', label: 'Off (LAN only)' },
                ]}
                className="justify-self-start"
              />
              {v.tls === 'built-in' && (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-caption text-text-3">
                    highsea gets a certificate from Let’s Encrypt for the external URL.
                  </p>
                  <Soon size="sm">Choose a certificate</Soon>
                </div>
              )}
              {v.tls === 'off' && (
                <p className="text-badge-warning text-caption">
                  Without TLS, passwords cross the network in the clear. Keep it to the LAN.
                </p>
              )}
              <Field
                label="Trusted proxies"
                hint="Addresses whose forwarded headers highsea believes."
              >
                <Input
                  value={v.trustedProxies}
                  onChange={(e) => set({ trustedProxies: e.target.value })}
                  className="font-mono"
                />
              </Field>
              <Field inline label="Use X-Forwarded-For and X-Forwarded-Proto">
                <Switch
                  checked={v.proxyHeaders}
                  onCheckedChange={(proxyHeaders) => set({ proxyHeaders })}
                />
              </Field>
            </Group>
            <Group title="Discovery">
              <Field
                inline
                label={`Let apps on this network find ${server.data?.name ?? 'this server'}`}
                hint="Answers UDP broadcasts and mDNS. In Docker it needs host networking or the published UDP port 7359."
              >
                <Switch checked={v.discovery} onCheckedChange={(discovery) => set({ discovery })} />
              </Field>
            </Group>
          </>
        )
      }}
    </Area>
  )
}

export function Security() {
  return (
    <Area id="security" section="security">
      {(v, set) => (
        <>
          <Group title="Signing in">
            <Field
              inline
              label="Require two-step for the owner and admins"
              hint="A code from an authenticator app, after the password, to open the admin. Apps never ask for it."
            >
              <Switch checked={v.twoFactor} onCheckedChange={(twoFactor) => set({ twoFactor })} />
            </Field>
            <Field
              inline
              label="Allow passkeys"
              hint="Sign in with Face ID, Touch ID or a security key."
            >
              <Switch checked={v.passkeys} onCheckedChange={(passkeys) => set({ passkeys })} />
            </Field>
            <Field
              label="Stay signed in for"
              hint="On the admin. Apps stay signed in until their device is signed out."
            >
              <Select
                value={String(v.sessionDays)}
                onValueChange={(d) => set({ sessionDays: Number(d) })}
                options={options([
                  ['1', '1 day'],
                  ['7', '7 days'],
                  ['30', '30 days'],
                  ['90', '90 days'],
                ])}
                className="medium:max-w-48"
              />
            </Field>
          </Group>
          <Group
            title="Single sign-on (OIDC)"
            description="Sign in with Authentik, Authelia, Keycloak or any OpenID Connect provider."
          >
            <Field inline label="Offer single sign-on">
              <Switch
                checked={v.oidc.enabled}
                onCheckedChange={(enabled) => set({ oidc: { ...v.oidc, enabled } })}
              />
            </Field>
            {v.oidc.enabled && (
              <div className="grid gap-4 medium:grid-cols-2">
                <Field label="Button label" hint={`Sign in with ${v.oidc.name || '…'}`}>
                  <Input
                    value={v.oidc.name}
                    onChange={(e) => set({ oidc: { ...v.oidc, name: e.target.value } })}
                  />
                </Field>
                <Field label="Client ID">
                  <Input
                    value={v.oidc.clientId}
                    onChange={(e) => set({ oidc: { ...v.oidc, clientId: e.target.value } })}
                    className="font-mono"
                  />
                </Field>
                <Field label="Issuer URL" className="medium:col-span-2">
                  <Input
                    value={v.oidc.issuer}
                    onChange={(e) => set({ oidc: { ...v.oidc, issuer: e.target.value } })}
                    className="font-mono"
                  />
                </Field>
                <Field
                  label="Client secret"
                  hint="Stored encrypted. Paste a new one to replace it."
                >
                  <Input type="password" placeholder="••••••••••••" autoComplete="off" />
                </Field>
                <Field label="Redirect URL" hint="Give this to your provider.">
                  <Input
                    readOnly
                    value="https://harbor.example.net/api/v1/auth/oidc/callback"
                    className="font-mono"
                  />
                </Field>
              </div>
            )}
          </Group>
          <Group
            title="Ownership"
            description="One person owns the server. Handing it over can’t be undone by you."
          >
            <Soon variant="danger" className="justify-self-start">
              Hand the server over
            </Soon>
          </Group>
        </>
      )}
    </Area>
  )
}

export function Backups() {
  return (
    <Area id="backups" section="backups">
      {(v, set) => (
        <>
          <Group
            title="Schedule"
            description="Settings and the database: not your media, which lives on its own disks."
          >
            <div className="grid gap-4 medium:grid-cols-3">
              <Field label="Back up">
                <Select
                  value={v.schedule}
                  onValueChange={(s) => set({ schedule: s as typeof v.schedule })}
                  options={options([
                    ['daily', 'Every day'],
                    ['weekly', 'Every week'],
                    ['off', 'Never'],
                  ])}
                />
              </Field>
              <Field label="At">
                <Input
                  type="time"
                  value={v.time}
                  disabled={v.schedule === 'off'}
                  onChange={(e) => set({ time: e.target.value })}
                />
              </Field>
              <Field label="Keep the last">
                <Input
                  type="number"
                  min={1}
                  max={90}
                  value={v.keep}
                  onChange={(e) => set({ keep: Number(e.target.value) })}
                />
              </Field>
            </div>
            {v.schedule === 'off' && (
              <p className="text-badge-warning text-caption">
                Without backups, a failed disk takes your settings, history and users with it.
              </p>
            )}
            <Field
              label="Folder"
              hint="Inside /config by default. Point it at another disk if you can."
            >
              <Input
                value={v.location}
                onChange={(e) => set({ location: e.target.value })}
                className="font-mono"
              />
            </Field>
          </Group>
          <p className="text-caption text-text-3">
            Make a backup now, or restore one, in{' '}
            <a
              href={adminHref('/system/backups')}
              className="text-text underline underline-offset-2"
            >
              System › Backups
            </a>
            .
          </p>
        </>
      )}
    </Area>
  )
}

// ---------------------------------------------------------------- library

const presets = [
  {
    name: 'HD Bluray + WEB',
    detail: '1080p, no remuxes. x264 preferred; 3D and low-quality groups rejected.',
  },
  {
    name: 'UHD Bluray + WEB',
    detail: '2160p with HDR and Dolby Vision scores; upgrades from 1080p.',
  },
  { name: 'Remux + WEB 2160p', detail: 'Remuxes first, for big screens and big disks.' },
]

export function Profiles() {
  const profiles = useQuery('settings:profiles', (c) => c.movies.qualityProfiles())
  const formats = useQuery('settings:formats', (c) => c.movies.customFormats())
  return (
    <AreaPage
      id="profiles"
      actions={
        <Button icon="add" asChild>
          <a href={adminHref('/settings/profiles/new')}>New profile</a>
        </Button>
      }
    >
      <Group
        title="Quality profiles"
        description="Each movie uses one: what to download, and when to stop upgrading."
      >
        <ul className="grid gap-2">
          {(profiles.data ?? []).map((p) => (
            <li
              key={p.id}
              className="grid gap-2 rounded-md border border-line bg-s2 p-3 medium:grid-cols-[minmax(0,1fr)_auto] medium:items-center"
            >
              <div className="grid gap-1">
                <p className="font-semibold text-text text-ui">{p.name}</p>
                <p className="flex flex-wrap gap-1">
                  {p.items
                    .filter((q) => q.allowed)
                    .map((q) => (
                      <Badge key={q.name} tone={q.name === p.cutoff ? 'accent' : 'neutral'}>
                        {q.name}
                      </Badge>
                    ))}
                </p>
                <p className="text-caption text-text-3">
                  {p.upgradeAllowed ? `Upgrades until ${p.cutoff}` : 'No upgrades'} ·{' '}
                  {p.formats.length} custom format scores
                </p>
              </div>
              <Button size="sm" icon="edit" asChild>
                <a href={adminHref(`/settings/profiles/${p.id}`)} aria-label={`Edit ${p.name}`}>
                  Edit
                </a>
              </Button>
            </li>
          ))}
        </ul>
      </Group>
      <Group
        title="Custom formats"
        description="Matches on a release name that add or take away score."
      >
        <TableFrame>
          <Table aria-label="Custom formats">
            <TableHeader>
              <TableRow>
                <TableHead>Format</TableHead>
                <TableHead>Matches</TableHead>
                <TableHead>From</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(formats.data ?? []).map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="text-text">
                    <a
                      href={adminHref(`/settings/profiles/formats/${f.id}`)}
                      className="hover:underline"
                    >
                      {f.name}
                    </a>
                  </TableCell>
                  <TableCell className="whitespace-normal break-words font-mono text-figure text-text-2">
                    {describeFormat(f).join(' · ')}
                  </TableCell>
                  <TableCell>
                    <Badge tone={f.source === 'preset' ? 'info' : 'neutral'}>
                      {f.source === 'preset' ? 'Preset' : 'Yours'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
        <Button size="sm" variant="secondary" icon="add" className="justify-self-start" asChild>
          <a href={adminHref('/settings/profiles/formats/new')}>New format</a>
        </Button>
      </Group>
      <Group
        title="Presets from the catalog"
        description="Profiles and formats kept up to date by the community, TRaSH-style. Adding one copies it; you can edit the copy."
      >
        <ul className="grid gap-2 medium:grid-cols-3">
          {presets.map((p) => (
            <li
              key={p.name}
              className="grid content-between gap-3 rounded-md border border-line bg-s2 p-3"
            >
              <div className="grid gap-1">
                <p className="font-semibold text-text text-ui">{p.name}</p>
                <p className="text-caption text-text-3">{p.detail}</p>
              </div>
              <Soon size="sm" icon="add" className="justify-self-start">
                Add
              </Soon>
            </li>
          ))}
        </ul>
      </Group>
    </AreaPage>
  )
}

export function QualitySizes() {
  return (
    <Area
      id="quality"
      section="qualitySizes"
      actions={
        <Button icon="edit" asChild>
          <a href={adminHref('/settings/quality/sizes')}>Edit sizes</a>
        </Button>
      }
    >
      {(rows, _set, replace) => (
        <Group
          title="Sizes per minute of runtime"
          description="A release outside the range is rejected; the preferred size wins a tie."
        >
          <TableFrame>
            <Table aria-label="Sizes per minute of runtime">
              <TableHeader>
                <TableRow>
                  <TableHead>Quality</TableHead>
                  <TableHead numeric>Min MB/min</TableHead>
                  <TableHead numeric>Preferred</TableHead>
                  <TableHead numeric>Max</TableHead>
                  <TableHead numeric>A 2-hour film</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((q, i) => {
                  // An empty preferred or maximum is no limit (`null`), as TRaSH's defaults are.
                  const cell = (key: 'min' | 'preferred' | 'max') => (
                    <TableCell numeric>
                      <Input
                        type="number"
                        min={0}
                        aria-label={`${q.quality}: ${key === 'preferred' ? 'preferred' : key} MB per minute`}
                        value={q[key] ?? ''}
                        placeholder={key === 'min' ? undefined : '∞'}
                        onChange={(e) =>
                          replace(
                            rows.map((r, j) =>
                              j === i
                                ? {
                                    ...r,
                                    [key]:
                                      key !== 'min' && e.target.value === ''
                                        ? null
                                        : Number(e.target.value),
                                  }
                                : r,
                            ),
                          )
                        }
                        className="ms-auto w-20 text-end font-mono"
                      />
                    </TableCell>
                  )
                  return (
                    <TableRow key={q.quality}>
                      <TableCell className="text-text">{q.quality}</TableCell>
                      {cell('min')}
                      {cell('preferred')}
                      {cell('max')}
                      <TableCell numeric className="text-text-2">
                        {q.max === null
                          ? `${((q.min * 120) / 1000).toFixed(1)} GB or more`
                          : `${((q.min * 120) / 1000).toFixed(1)}–${((q.max * 120) / 1000).toFixed(1)} GB`}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableFrame>
        </Group>
      )}
    </Area>
  )
}

// ---------------------------------------------------------------- downloads and alerts

export function DownloadClient() {
  return (
    <Area id="downloads" section="downloadClient">
      {(v, set) => (
        <>
          <Group title="VPN">
            <VpnSummary
              action={
                <Button size="sm" variant="secondary" asChild>
                  <a href={adminHref('/settings/vpn')}>VPN settings</a>
                </Button>
              }
            />
          </Group>
          <Group title="Connections">
            <div className="grid gap-4 medium:grid-cols-3">
              <Field label="Listening port">
                <Input
                  type="number"
                  min={1024}
                  max={65535}
                  value={v.port}
                  onChange={(e) => set({ port: Number(e.target.value) })}
                  className="font-mono"
                />
              </Field>
              <Field label="Encryption">
                <Select
                  value={v.encryption}
                  onValueChange={(e) => set({ encryption: e as typeof v.encryption })}
                  options={options([
                    ['require', 'Require'],
                    ['prefer', 'Prefer'],
                    ['allow', 'Allow'],
                  ])}
                />
              </Field>
              <Field label="Downloading at once" hint="The rest wait in the queue.">
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={v.maxActive}
                  onChange={(e) => set({ maxActive: Number(e.target.value) })}
                />
              </Field>
            </div>
            <Field
              inline
              label="Open the port with UPnP"
              hint="Off behind a VPN: forward the port there instead."
            >
              <Switch checked={v.upnp} onCheckedChange={(upnp) => set({ upnp })} />
            </Field>
          </Group>
          <p className="text-caption text-text-3">
            Speed limits and seeding rules are on{' '}
            <a href={adminHref('/downloads')} className="text-text underline underline-offset-2">
              Downloads
            </a>
            .
          </p>
        </>
      )}
    </Area>
  )
}

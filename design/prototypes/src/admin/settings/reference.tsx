// SPDX-License-Identifier: AGPL-3.0-only
// A15 Settings, the reference areas (docs/product/settings.md): each area's layout, its values and
// its states, with the main controls working (edit, save, discard) and the rest marked as not in
// the prototype.

import { describeFormat } from '@highsea/quality/browser'
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
  toast,
} from '@highsea/ui-web'
import type { ReactNode } from 'react'
import { Soon } from '../../kit/soon.tsx'
import { useQuery } from '../../mock/hooks.tsx'
import type {
  Settings as AllSettings,
  NotificationKind,
  SettingsSection,
} from '../../mock/settings.ts'
import { adminHref } from '../shell.tsx'
import { AreaPage, Group, SaveBar, useSettingsDraft } from './settings.tsx'
import { VpnSummary } from './vpn.tsx'

/** An area backed by one settings section: loads it, keeps a draft, and shows the save bar. */
function Area<K extends SettingsSection>({
  id,
  section,
  actions,
  children,
}: {
  id: string
  section: K
  actions?: ReactNode
  children: (
    value: AllSettings[K],
    set: (patch: Partial<AllSettings[K]>) => void,
    replace: (v: AllSettings[K]) => void,
  ) => ReactNode
}) {
  const s = useSettingsDraft(section)
  return (
    <AreaPage id={id} actions={actions}>
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
          {children(s.draft, s.set, s.replace)}
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

const options = (xs: [string, string][]) => xs.map(([value, label]) => ({ value, label }))

// ---------------------------------------------------------------- server

export function General() {
  return (
    <Area id="general" section="general">
      {(v, set) => (
        <>
          <Group title="Region">
            <div className="grid gap-4 medium:grid-cols-2">
              <Field label="Language" hint="For this admin and the server’s messages.">
                <Select
                  value={v.language}
                  onValueChange={(language) => set({ language })}
                  options={options([
                    ['en-GB', 'English (UK)'],
                    ['en-US', 'English (US)'],
                    ['pt-PT', 'Português'],
                    ['de-DE', 'Deutsch'],
                    ['fr-FR', 'Français'],
                  ])}
                />
              </Field>
              <Field label="Time zone" hint="For schedules, the calendar and logs.">
                <Select
                  value={v.timeZone}
                  onValueChange={(timeZone) => set({ timeZone })}
                  options={options([
                    ['Europe/Lisbon', 'Lisbon'],
                    ['Europe/London', 'London'],
                    ['Europe/Berlin', 'Berlin'],
                    ['America/New_York', 'New York'],
                    ['America/Los_Angeles', 'Los Angeles'],
                  ])}
                />
              </Field>
            </div>
          </Group>
          <Group
            title="Updates"
            description="highsea never updates itself unless you turn that on."
          >
            <SegmentedControl
              aria-label="Update channel"
              size="sm"
              value={v.updateChannel}
              onValueChange={(c) => set({ updateChannel: c as 'stable' | 'beta' })}
              options={[
                { value: 'stable', label: 'Stable' },
                { value: 'beta', label: 'Beta' },
              ]}
              className="justify-self-start"
            />
            <Field
              inline
              label="Install updates on their own"
              hint="At 4 am, after a backup, when nothing is playing."
            >
              <Switch
                checked={v.autoUpdate}
                onCheckedChange={(autoUpdate) => set({ autoUpdate })}
              />
            </Field>
          </Group>
          <Group title="Diagnostics">
            <Field
              inline
              label="Send anonymous usage counts"
              hint="Off. When on: the version, platform and library size, once a week. Never titles or names."
            >
              <Switch checked={v.analytics} onCheckedChange={(analytics) => set({ analytics })} />
            </Field>
            <Field label="Log level" hint="Debug is chatty: use it while chasing a problem.">
              <Select
                value={v.logLevel}
                onValueChange={(l) => set({ logLevel: l as 'debug' | 'info' | 'warn' })}
                options={options([
                  ['warn', 'Warnings and errors'],
                  ['info', 'Info (default)'],
                  ['debug', 'Debug'],
                ])}
                className="medium:max-w-72"
              />
            </Field>
          </Group>
        </>
      )}
    </Area>
  )
}

export function Network() {
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
                label="Let apps on this network find Harbor"
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

const sample = {
  'Movie Title': 'Sintel',
  'Release Year': '2010',
  'Quality Full': 'Bluray-1080p',
  'Movie CleanTitle': 'Sintel',
  Edition: 'Director’s Cut',
}

/** `{Movie Title} ({Release Year})` with Sintel's values. Unknown tokens stay visible. */
const render = (format: string) =>
  format.replace(/\{([^}]+)\}/g, (m, t: string) => sample[t as keyof typeof sample] ?? m)

export function MediaManagement() {
  return (
    <Area id="media" section="media">
      {(v, set) => (
        <>
          <Group title="Naming" description="How highsea names what it imports.">
            <Field inline label="Rename movies">
              <Switch checked={v.rename} onCheckedChange={(rename) => set({ rename })} />
            </Field>
            <Field
              label="Folder"
              hint={
                <>
                  Becomes <span className="font-mono text-text-2">{render(v.folderFormat)}</span>
                </>
              }
            >
              <Input
                value={v.folderFormat}
                disabled={!v.rename}
                onChange={(e) => set({ folderFormat: e.target.value })}
                className="font-mono"
              />
            </Field>
            <Field
              label="File"
              hint={
                <>
                  Becomes <span className="font-mono text-text-2">{render(v.fileFormat)}.mkv</span>
                </>
              }
            >
              <Input
                value={v.fileFormat}
                disabled={!v.rename}
                onChange={(e) => set({ fileFormat: e.target.value })}
                className="font-mono"
              />
            </Field>
            <p className="text-caption text-text-3">
              Tokens:{' '}
              {Object.keys(sample)
                .map((t) => `{${t}}`)
                .join(' ')}
            </p>
          </Group>
          <Group title="Importing">
            <Field
              inline
              label="Use hardlinks"
              hint="Imports take no extra space and torrents keep seeding. Downloads and Movies are on the same disk, so hardlinks work."
            >
              <Switch checked={v.hardlinks} onCheckedChange={(hardlinks) => set({ hardlinks })} />
            </Field>
            <Field
              inline
              label="Write NFO files"
              hint="For other media players reading the same folders."
            >
              <Switch checked={v.nfo} onCheckedChange={(nfo) => set({ nfo })} />
            </Field>
            <Field
              inline
              label="Stop monitoring movies whose files I delete"
              hint="Otherwise highsea downloads them again."
            >
              <Switch
                checked={v.unmonitorDeleted}
                onCheckedChange={(unmonitorDeleted) => set({ unmonitorDeleted })}
              />
            </Field>
            <div className="grid gap-4 medium:grid-cols-2">
              <Field label="Folder permissions" hint="chmod, for folders highsea makes.">
                <Input
                  value={v.chmod}
                  onChange={(e) => set({ chmod: e.target.value })}
                  className="font-mono"
                />
              </Field>
              <Field
                label="Recycle bin"
                hint="Deleted files go here first. Empty: delete straight away."
              >
                <Input
                  value={v.recycleBin}
                  placeholder="/data/.recycle"
                  onChange={(e) => set({ recycleBin: e.target.value })}
                  className="font-mono"
                />
              </Field>
            </div>
          </Group>
        </>
      )}
    </Area>
  )
}

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

const listKinds = { trakt: 'Trakt', tmdb: 'TMDB list', imdb: 'IMDb list', letterboxd: 'Letterboxd' }

export function ImportLists() {
  const profiles = useQuery('settings:profiles', (c) => c.movies.qualityProfiles())
  return (
    <Area id="lists" section="importLists">
      {(lists, _set, replace) => (
        <Group
          title="Lists"
          description="highsea checks each list every 6 hours and adds new titles as monitored."
        >
          <ul className="grid gap-2">
            {lists.map((l, i) => (
              <li
                key={l.id}
                className="grid gap-3 rounded-md border border-line bg-s2 p-3 medium:grid-cols-[auto_minmax(0,1fr)_14rem] medium:items-center"
              >
                <Switch
                  aria-label={`${l.name}: on`}
                  checked={l.enabled}
                  onCheckedChange={(enabled) =>
                    replace(lists.map((x, j) => (j === i ? { ...x, enabled } : x)))
                  }
                />
                <div className="grid gap-0.5">
                  <p className="text-text text-ui">{l.name}</p>
                  <p className="text-caption text-text-3">
                    {listKinds[l.kind]} · {l.items} titles ·{' '}
                    {l.search ? 'adds and searches' : 'adds without searching'}
                  </p>
                </div>
                <Select
                  aria-label={`${l.name}: quality profile`}
                  value={l.profileId}
                  onValueChange={(profileId) =>
                    replace(lists.map((x, j) => (j === i ? { ...x, profileId } : x)))
                  }
                  options={(profiles.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
                />
              </li>
            ))}
          </ul>
          <Soon icon="add" className="justify-self-start">
            Add a list
          </Soon>
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

const kindLabels: Record<NotificationKind, string> = {
  discord: 'Discord',
  slack: 'Slack',
  telegram: 'Telegram',
  ntfy: 'ntfy',
  gotify: 'Gotify',
  pushover: 'Pushover',
  email: 'Email',
  webhook: 'Webhook',
  apprise: 'Apprise',
}

const eventLabels = {
  grab: 'Grabbed',
  import: 'Imported',
  upgrade: 'Upgraded',
  health: 'Health',
  update: 'Update',
}

export function Connections() {
  return (
    <Area id="connections" section="connections">
      {(list, _set, replace) => (
        <>
          <Group
            title="Notifications"
            description="Where highsea tells you about downloads, imports and problems."
          >
            <ul className="grid gap-2">
              {list.map((n, i) => (
                <li
                  key={n.id}
                  className="grid gap-3 rounded-md border border-line bg-s2 p-3 medium:grid-cols-[auto_minmax(0,1fr)_auto] medium:items-center"
                >
                  <Switch
                    aria-label={`${n.name}: on`}
                    checked={n.enabled}
                    onCheckedChange={(enabled) =>
                      replace(list.map((x, j) => (j === i ? { ...x, enabled } : x)))
                    }
                  />
                  <div className="grid gap-1">
                    <p className="text-text text-ui">
                      {n.name} <span className="text-text-3">· {kindLabels[n.kind]}</span>
                    </p>
                    <p className="flex flex-wrap gap-1">
                      {n.events.map((e) => (
                        <Badge key={e}>{eventLabels[e]}</Badge>
                      ))}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    icon="notification"
                    disabled={!n.enabled}
                    onClick={() => toast({ title: `Sent a test to ${n.name}` })}
                  >
                    Test
                  </Button>
                </li>
              ))}
            </ul>
          </Group>
          <Group title="Add a connection">
            <ul className="grid grid-cols-2 gap-2 medium:grid-cols-3 wide:grid-cols-5">
              {(Object.keys(kindLabels) as NotificationKind[]).map((k) => (
                <li key={k}>
                  <Soon className="w-full">{kindLabels[k]}</Soon>
                </li>
              ))}
            </ul>
          </Group>
        </>
      )}
    </Area>
  )
}

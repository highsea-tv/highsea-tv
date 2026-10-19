// SPDX-License-Identifier: AGPL-3.0-only
// The bodies of the client settings sections (C7) for web and mobile, which share ui-web's
// controls. Theme and sound change this device at once; the home layout saves to the server, so
// it follows the person; servers and devices act on the account.
import { createTheme, SOUND_EVENTS, themeCss } from '@highsea/tokens'
import {
  Badge,
  Button,
  cn,
  Field,
  Icon,
  type IconName,
  Mark,
  Switch,
  toast,
  useSoundPlayer,
} from '@highsea/ui-web'
import type { ReactNode } from 'react'
import { useLocation } from 'wouter'
import { relative } from '../admin/format.ts'
import { Soon } from '../kit/soon.tsx'
import { SortableList } from '../kit/sortable-list.tsx'
import { useNow } from '../mock/hooks.tsx'
import type { ClientType } from '../mock/types.ts'
import { useProto } from '../screen/screen.tsx'
import {
  type ClientPlatform,
  clientType,
  useConnection,
  useKnownServers,
  useServer,
} from './data.ts'
import { useAppearance, useDevicePrefs } from './prefs.tsx'
import {
  APP_VERSION,
  type SettingsSectionId,
  useHomeLayout,
  useMyDevices,
  useThemeChoices,
} from './settings.ts'

const deviceIcon = (c: ClientType): IconName =>
  c === 'ios' || c === 'android'
    ? 'phone'
    : c === 'tvos' || c === 'androidtv' || c === 'webos' || c === 'tizen'
      ? 'tv'
      : 'laptop'

function Row({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <li
      className={cn(
        'flex min-h-14 items-center gap-3 rounded-md border border-line bg-s1 px-3 py-2.5',
        className,
      )}
    >
      {children}
    </li>
  )
}

/** The server's custom themes as CSS, so their swatches show their own colours. */
export function CustomThemeStyles() {
  const appearance = useAppearance()
  const css = (appearance.data?.themes ?? [])
    .map((t) => themeCss(createTheme({ ...t }).theme, `[data-theme="${t.id}"]`))
    .join('\n')
  return <style>{css}</style>
}

function ThemeSection({ platform }: { platform: ClientPlatform }) {
  const [prefs, set] = useDevicePrefs(platform)
  const choices = useThemeChoices()
  return (
    <fieldset className="grid gap-2">
      <CustomThemeStyles />
      <legend className="mb-1 text-caption text-text-3">
        Only this device changes. Everyone else keeps their own.
      </legend>
      {choices.map((t) => (
        <label
          key={t.id}
          className="flex min-h-14 cursor-pointer items-center gap-3 rounded-md border border-line bg-s1 px-3 py-2.5 has-checked:border-accent has-focus-visible:ring-focus"
        >
          <input
            type="radio"
            name={`theme-${platform}`}
            checked={prefs.theme === t.id}
            onChange={() => set({ theme: t.id })}
            className="size-4 accent-accent-fill"
          />
          <span className="grid min-w-0 flex-1">
            <span className="truncate text-text text-ui">{t.name}</span>
            <span className="text-caption text-text-3">{t.detail}</span>
          </span>
          {t.id !== 'server' && (
            <span className="flex gap-1" data-theme={t.id}>
              {(['bg', 's2', 'accent'] as const).map((r) => (
                <span
                  key={r}
                  className="size-4 rounded-full ring-1 ring-line-strong"
                  style={{ background: `var(--color-${r})` }}
                />
              ))}
            </span>
          )}
        </label>
      ))}
    </fieldset>
  )
}

function SoundSection({ platform }: { platform: ClientPlatform }) {
  const [prefs, set] = useDevicePrefs(platform)
  const proto = useProto()
  const appearance = useAppearance()
  const player = useSoundPlayer()
  const fallback = proto.sound[platform]
  const on = prefs.sound ?? fallback
  const server = appearance.data?.branding.name ?? 'Harbor'
  return (
    <div className="grid gap-4">
      <Field
        inline
        label="Interface sounds"
        hint={
          prefs.sound === null
            ? `Following ${server}: ${fallback ? 'on' : 'off'} on ${platform === 'tv' ? 'TVs' : platform === 'mobile' ? 'phones' : 'the web'}.`
            : 'Set on this device.'
        }
      >
        <Switch checked={on} onCheckedChange={(sound) => set({ sound })} />
      </Field>
      <Field label="Volume" hint={`${Math.round(prefs.volume * 100)}%`}>
        <input
          type="range"
          aria-label="Volume"
          aria-valuetext={`${Math.round(prefs.volume * 100)}%`}
          min={0}
          max={1}
          step={0.05}
          value={prefs.volume}
          disabled={!on}
          onChange={(e) => set({ volume: Number(e.target.value) })}
          className="h-11 w-full cursor-pointer accent-accent-fill disabled:opacity-45"
        />
      </Field>
      <div className="grid gap-2">
        <span className="font-medium text-text text-ui">Listen</span>
        <div className="flex flex-wrap gap-1.5">
          {SOUND_EVENTS.slice(0, 4).map((e) => (
            <Button key={e} size="sm" icon="sound" onClick={() => player?.play(e, { force: true })}>
              {e.charAt(0).toUpperCase() + e.slice(1)}
            </Button>
          ))}
        </div>
      </div>
      {prefs.sound !== null && (
        <Button variant="ghost" className="justify-self-start" onClick={() => set({ sound: null })}>
          Follow {server} again
        </Button>
      )}
    </div>
  )
}

function HomeSection() {
  const home = useHomeLayout()
  if (home.status !== 'success')
    return <p className="text-caption text-text-3">Loading your rows…</p>
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <p className="text-caption text-text-3">
        The featured hero stays on top. Your order follows you to every device.
      </p>
      <SortableList
        aria-label="Home rows"
        items={home.rows}
        id={(r) => r.id}
        label={(r) => r.title}
        onChange={(next) => home.reorder(next.map((r) => r.id))}
        className="gap-2"
        itemClassName="flex min-h-14 items-center gap-3 rounded-md border border-line bg-s1 px-3 py-2.5"
      >
        {(r, handle) => {
          const shown = !home.hidden.includes(r.id)
          return (
            <>
              {handle}
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-ui',
                  shown ? 'text-text' : 'text-text-3',
                )}
              >
                {r.title}
              </span>
              <Switch
                aria-label={`Show ${r.title}`}
                checked={shown}
                onCheckedChange={(on) => home.toggle(r.id, on)}
              />
            </>
          )
        }}
      </SortableList>
      <Button variant="ghost" className="justify-self-start" onClick={() => home.reset()}>
        Use the server’s order
      </Button>
    </div>
  )
}

function ServersSection({ platform }: { platform: ClientPlatform }) {
  const known = useKnownServers()
  const connection = useConnection()
  const now = useNow()
  const [, navigate] = useLocation()
  return (
    <div className="grid gap-3">
      <ul aria-label="Servers" className="grid gap-2">
        {(known.data ?? []).map((k) => {
          const current = k.id === 'srv-harbor'
          return (
            <Row key={k.id}>
              <Mark size={26} />
              <span className="grid min-w-0 flex-1">
                <span className="truncate text-text text-ui">{k.name}</span>
                <span className="truncate text-caption text-text-3">
                  {current
                    ? connection === 'remote'
                      ? `Connected remotely · ${k.addresses.remote}`
                      : connection === 'offline'
                        ? 'Can’t reach it right now'
                        : `On this network · ${k.addresses.local}`
                    : `${k.signedIn ? 'Signed in' : 'Signed out'} · last used ${relative(k.lastSeen, now)}`}
                </span>
              </span>
              {current ? (
                <Badge tone="accent">In use</Badge>
              ) : (
                <Button size="sm" onClick={() => navigate('/connect')}>
                  {k.signedIn ? 'Switch' : 'Sign in'}
                </Button>
              )}
            </Row>
          )
        })}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button icon="add" onClick={() => navigate('/connect')}>
          Add a server
        </Button>
        <Button
          variant="ghost"
          icon="sign-out"
          onClick={() => {
            toast({
              title: 'Signed out of Harbor',
              description: 'Your downloads stay on this device.',
            })
            navigate('/connect')
          }}
        >
          Sign out of Harbor
        </Button>
      </div>
      {platform === 'web' && (
        <p className="text-caption text-text-3">
          Each server keeps its own sign-in. Signing out of one leaves the others alone.
        </p>
      )}
    </div>
  )
}

function DevicesSection({ platform }: { platform: ClientPlatform }) {
  const { devices, revoke } = useMyDevices()
  const now = useNow()
  const here = devices.data?.find((d) => d.client === clientType[platform])?.id
  if (devices.status !== 'success') return <p className="text-caption text-text-3">Loading…</p>
  return (
    <ul aria-label="Your devices" className="grid gap-2">
      {devices.data.map((d) => (
        <Row key={d.id}>
          <Icon name={deviceIcon(d.client)} size={18} className="shrink-0 text-text-3" />
          <span className="grid min-w-0 flex-1">
            <span className="truncate text-text text-ui">{d.name}</span>
            <span className="text-caption text-text-3">
              {d.id === here ? 'This device' : `Last used ${relative(d.lastSeen, now)}`}
            </span>
          </span>
          {d.id !== here && d.client !== 'admin' && (
            <Button
              size="sm"
              aria-label={`Sign out ${d.name}`}
              onClick={() =>
                revoke(d.id).then(() =>
                  toast({
                    title: `${d.name} signed out`,
                    description: 'It needs a code or password to come back.',
                  }),
                )
              }
            >
              Sign out
            </Button>
          )}
        </Row>
      ))}
    </ul>
  )
}

function AboutSection() {
  const server = useServer()
  return (
    <div className="grid gap-4">
      <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-6 gap-y-2 text-ui [overflow-wrap:anywhere]">
        <dt className="text-text-3">This app</dt>
        <dd className="font-mono text-figure text-text">highsea {APP_VERSION}</dd>
        <dt className="text-text-3">Server</dt>
        <dd className="font-mono text-figure text-text">
          {server.data?.name ?? 'Harbor'} {server.data?.version ?? ''}
        </dd>
        <dt className="text-text-3">Licence</dt>
        <dd className="text-text">AGPL-3.0, free software</dd>
      </dl>
      <div className="flex flex-wrap gap-2">
        <Soon size="sm">Open-source licences</Soon>
        <Soon size="sm">Send diagnostics</Soon>
      </div>
    </div>
  )
}

export function SettingsSectionBody({
  id,
  platform,
}: {
  id: SettingsSectionId
  platform: ClientPlatform
}) {
  if (id === 'appearance') return <ThemeSection platform={platform} />
  if (id === 'sounds') return <SoundSection platform={platform} />
  if (id === 'home') return <HomeSection />
  if (id === 'servers') return <ServersSection platform={platform} />
  if (id === 'devices') return <DevicesSection platform={platform} />
  return <AboutSection />
}

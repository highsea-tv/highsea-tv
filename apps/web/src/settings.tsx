// SPDX-License-Identifier: AGPL-3.0-only
// C7 Settings, C8 Profile and Downloads on the web (docs/product/client-settings.md), ported from
// design/prototypes/src/web/settings.tsx and client/settings-sections.tsx. Theme and sound are
// this device's, in the server's preference layers (ADR 0027), with Use on all my devices as the
// person's own theme; the home layout follows the person; Servers is this server only (the plan's
// answer 3); Your devices signs others out. Downloads needs the desktop app.
import type { ClientType } from '@highsea-tv/api-contract'
import { useAppearance, useHomeLayout, useMyDevices, useServer } from '@highsea-tv/client/data'
import { SERVER_THEME, useDevicePrefs } from '@highsea-tv/client/prefs'
import { relative } from '@highsea-tv/core/format'
import { useLocale, useT } from '@highsea-tv/i18n/react'
import { builtInThemes, SOUND_EVENTS } from '@highsea-tv/tokens'
import {
  Badge,
  Button,
  cn,
  EmptyState,
  Field,
  Icon,
  type IconName,
  Mark,
  SortableList,
  Switch,
  toast,
  useSoundPlayer,
} from '@highsea-tv/ui-web'
import type { ReactNode } from 'react'
import { useParams } from 'wouter'
import { useDesktop } from './desktop/root.tsx'
import { restartToUpdate, useAppUpdate } from './desktop/updates.ts'
import { desktopOs } from './desktop/window.tsx'
import {
  desktop as desktopMessages,
  home as homeMessages,
  settings as messages,
  profile as profileMessages,
  updates as updateMessages,
} from './messages.ts'
import { CustomThemeStyles } from './prefs.tsx'
import { gutter, href, useServerAddress, useServerName, useSignedIn, useSignOut } from './shell.tsx'

const SECTIONS = [
  { id: 'appearance', icon: 'palette' },
  { id: 'sounds', icon: 'sound' },
  { id: 'home', icon: 'home' },
  { id: 'servers', icon: 'server' },
  { id: 'devices', icon: 'phone' },
  { id: 'about', icon: 'info' },
] as const satisfies readonly { id: string; icon: IconName }[]

type SectionId = (typeof SECTIONS)[number]['id']

/** A button whose label wraps at 200% text rather than running off a phone (WCAG 1.4.4). */
const wraps = 'h-auto min-h-(--size-control) max-w-full whitespace-normal py-2 text-start'

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

function useSaveFailed() {
  const t = useT(messages)
  return (e: Error) => toast({ title: t('saveFailed', { message: e.message }), tone: 'danger' })
}

/** Themes a device can pick: the server's default first, then built-ins, then the server's own. */
function useThemeChoices() {
  const t = useT(messages)
  const appearance = useAppearance()
  const name = useServerName()
  const a = appearance.data
  const builtIn = Object.values(builtInThemes)
  const defaultName =
    builtIn.find((b) => b.id === a?.defaultTheme)?.name ??
    a?.themes.find((c) => c.id === a?.defaultTheme)?.name ??
    ''
  return [
    { id: SERVER_THEME, name: t('serverDefault', { name }), detail: defaultName },
    ...builtIn.map((b) => ({ id: b.id, name: b.name, detail: t('builtIn') })),
    ...(a?.themes ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      detail: t('fromServer', { name }),
    })),
  ]
}

function ThemeSection() {
  const t = useT(messages)
  const prefs = useDevicePrefs()
  const choices = useThemeChoices()
  const failed = useSaveFailed()
  const p = prefs.current
  if (!p) return <p className="text-caption text-text-3">{t('loading')}</p>
  const everywhere = p.everywhere !== null
  return (
    <div className="grid gap-4">
      <fieldset className="grid gap-2">
        <CustomThemeStyles />
        <legend className="mb-1 text-caption text-text-3">
          {everywhere ? t('themeEverywhere') : t('themeDevice')}
        </legend>
        {choices.map((c) => (
          <label
            key={c.id}
            className="flex min-h-14 cursor-pointer items-center gap-3 rounded-md border border-line bg-s1 px-3 py-2.5 has-checked:border-accent has-focus-visible:ring-focus"
          >
            <input
              type="radio"
              name="theme"
              checked={p.chosen === c.id}
              disabled={prefs.pending}
              onChange={() => prefs.setTheme(c.id).catch(failed)}
              className="size-4 accent-accent-fill"
            />
            <span className="grid min-w-0 flex-1">
              <span className="truncate text-text text-ui">{c.name}</span>
              {c.detail && <span className="text-caption text-text-3">{c.detail}</span>}
            </span>
            {c.id !== SERVER_THEME && (
              <span className="flex gap-1" data-theme={c.id}>
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
      <Field
        inline
        label={t('everywhere')}
        hint={everywhere ? t('everywhereOn') : t('everywhereOff')}
      >
        <Switch
          checked={everywhere}
          disabled={prefs.pending}
          onCheckedChange={(on) => prefs.setEverywhere(on).catch(failed)}
        />
      </Field>
    </div>
  )
}

function SoundSection() {
  const t = useT(messages)
  const prefs = useDevicePrefs()
  const appearance = useAppearance()
  const player = useSoundPlayer()
  const name = useServerName()
  const failed = useSaveFailed()
  const p = prefs.current
  if (!p) return <p className="text-caption text-text-3">{t('loading')}</p>
  const fallback = appearance.data?.sound.web ?? false
  const percent = Math.round(p.volume * 100)
  return (
    <div className="grid gap-4">
      <Field
        inline
        label={t('sounds')}
        hint={p.soundChosen ? t('setHere') : t(fallback ? 'followingOn' : 'followingOff', { name })}
      >
        <Switch
          checked={p.sound}
          onCheckedChange={(sound) => prefs.setSound(sound).catch(failed)}
        />
      </Field>
      <Field label={t('volume')} hint={t('percent', { value: percent })}>
        <input
          type="range"
          aria-label={t('volume')}
          aria-valuetext={t('percent', { value: percent })}
          min={0}
          max={1}
          step={0.05}
          defaultValue={p.volume}
          disabled={!p.sound}
          // saved when the thumb is let go, not at every step
          onChange={(e) => player?.setVolume(Number(e.target.value))}
          onPointerUp={(e) => prefs.setVolume(Number(e.currentTarget.value)).catch(failed)}
          onKeyUp={(e) => prefs.setVolume(Number(e.currentTarget.value)).catch(failed)}
          className="h-11 w-full cursor-pointer accent-accent-fill disabled:opacity-45"
        />
      </Field>
      <div className="grid gap-2">
        <span className="font-medium text-text text-ui">{t('listen')}</span>
        <div className="flex flex-wrap gap-1.5">
          {SOUND_EVENTS.slice(0, 4).map((e) => (
            <Button key={e} size="sm" icon="sound" onClick={() => player?.play(e, { force: true })}>
              {e.charAt(0).toUpperCase() + e.slice(1)}
            </Button>
          ))}
        </div>
      </div>
      {p.soundChosen && (
        <Button
          variant="ghost"
          className="justify-self-start"
          onClick={() => prefs.setSound(null).catch(failed)}
        >
          {t('followAgain', { name })}
        </Button>
      )}
    </div>
  )
}

function HomeSection() {
  const t = useT(messages)
  const h = useT(homeMessages)
  const home = useHomeLayout()
  const failed = useSaveFailed()
  if (home.status !== 'success')
    return <p className="text-caption text-text-3">{t('loadingRows')}</p>
  // built-in rows have no title from the server; this app names them
  const title = (r: { id: string; title: string | null }) =>
    r.title ?? (r.id === 'continue' ? h('continue') : r.id === 'recent' ? h('recent') : r.id)
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <p className="text-caption text-text-3">{t('homeIntro')}</p>
      <SortableList
        aria-label={t('homeRows')}
        items={home.rows}
        id={(r) => r.id}
        label={title}
        onChange={(next) => home.reorder(next.map((r) => r.id)).catch(failed)}
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
                {title(r)}
              </span>
              <Switch
                aria-label={t('showRow', { title: title(r) })}
                checked={shown}
                onCheckedChange={(on) => home.toggle(r.id, on).catch(failed)}
              />
            </>
          )
        }}
      </SortableList>
      <Button
        variant="ghost"
        className="justify-self-start"
        onClick={() => home.reset().catch(failed)}
      >
        {t('serverOrder')}
      </Button>
    </div>
  )
}

/** The desktop app's servers (the prototype's Servers section with `?app=desktop`). */
function AppServersSection() {
  const t = useT(messages)
  const d = useT(desktopMessages)
  const locale = useLocale()
  const app = useDesktop()
  const name = useServerName()
  const { away } = useSignedIn()
  const signOut = useSignOut()
  if (!app) return null
  const now = Date.now()
  return (
    <div className="grid gap-3">
      <ul aria-label={t('section.servers')} className="grid gap-2">
        {app.servers.map((k) => {
          const current = k.id === app.current.id
          return (
            <Row key={k.id}>
              <Mark size={26} />
              <span className="grid min-w-0 flex-1">
                <span className="truncate text-text text-ui">{k.name}</span>
                <span className="truncate text-caption text-text-3">
                  {current
                    ? d(away ? 'remoteLine' : 'localLine', {
                        address: new URL(app.current.base).host,
                      })
                    : d('otherLine', {
                        signedIn: String(k.signedIn),
                        when: relative(new Date(k.lastSeen * 1000).toISOString(), now, locale),
                      })}
                </span>
              </span>
              {current ? (
                <Badge tone="accent">{t('inUse')}</Badge>
              ) : (
                <Button size="sm" onClick={() => void app.switchTo(k.id)}>
                  {k.signedIn ? d('switch') : d('signIn')}
                </Button>
              )}
            </Row>
          )
        })}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button icon="add" className={wraps} onClick={app.choose}>
          {d('addServer')}
        </Button>
        <Button
          variant="ghost"
          icon="sign-out"
          className={wraps}
          loading={signOut.pending}
          onClick={signOut.run}
        >
          {t('signOut', { name })}
        </Button>
      </div>
      <p className="text-caption text-text-3">{d('eachKeeps')}</p>
    </div>
  )
}

function ServersSection() {
  const t = useT(messages)
  const name = useServerName()
  const address = useServerAddress()
  const signOut = useSignOut()
  if (useDesktop()) return <AppServersSection />
  return (
    <div className="grid gap-3">
      <ul aria-label={t('section.servers')} className="grid gap-2">
        <Row>
          <Mark size={26} />
          <span className="grid min-w-0 flex-1">
            <span className="truncate text-text text-ui">{name}</span>
            <span className="truncate text-caption text-text-3">
              {t('serverDetail', { address })}
            </span>
          </span>
          <Badge tone="accent">{t('inUse')}</Badge>
        </Row>
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="ghost"
          icon="sign-out"
          className={wraps}
          loading={signOut.pending}
          onClick={signOut.run}
        >
          {t('signOut', { name })}
        </Button>
      </div>
      <p className="text-caption text-text-3">{t('oneServer')}</p>
    </div>
  )
}

function DevicesSection() {
  const t = useT(messages)
  const locale = useLocale()
  const session = useSignedIn()
  const { devices, revoke } = useMyDevices()
  if (devices.status === 'loading')
    return <p className="text-caption text-text-3">{t('loading')}</p>
  if (devices.status === 'error')
    return (
      <p className="text-caption text-text-3">{t('failed', { message: devices.error.message })}</p>
    )
  const now = Date.now()
  return (
    <ul aria-label={t('section.devices')} className="grid gap-2">
      {devices.data.map((d) => {
        const here = d.id === session.deviceId
        return (
          <Row key={d.id}>
            <Icon name={deviceIcon(d.client)} size={18} className="shrink-0 text-text-3" />
            <span className="grid min-w-0 flex-1">
              <span className="truncate text-text text-ui">{d.name}</span>
              <span className="text-caption text-text-3">
                {here
                  ? t('thisDevice')
                  : t('lastUsed', { when: relative(d.lastSeen, now, locale) })}
              </span>
            </span>
            {!here && (
              <Button
                size="sm"
                aria-label={t('signOutDevice', { name: d.name })}
                onClick={() =>
                  revoke(d.id).then(
                    () => {
                      devices.refetch()
                      toast({
                        title: t('deviceSignedOut', { name: d.name }),
                        description: t('deviceSignedOutDetail'),
                      })
                    },
                    (e: Error) => toast({ title: e.message, tone: 'danger' }),
                  )
                }
              >
                {t('signOutShort')}
              </Button>
            )}
          </Row>
        )
      })}
    </ul>
  )
}

/** The desktop app's own updates (desktop-app.md › Updates): checked by itself, used on restart. */
/** The computers' own names, which aren't translated. */
const OS_NAMES = { mac: 'Mac', windows: 'Windows', linux: 'Linux' } as const

function AppUpdates() {
  const u = useT(updateMessages)
  const locale = useLocale()
  const update = useAppUpdate()
  if (update.ready)
    return (
      <div className="grid justify-items-start gap-2 rounded-md border border-line bg-s1 p-3">
        <p className="text-text text-ui">{u('ready', { version: update.ready })}</p>
        <Button size="sm" variant="primary" icon="refresh" onClick={() => void restartToUpdate()}>
          {u('restart')}
        </Button>
      </div>
    )
  return (
    <p className="text-caption text-text-3">
      {update.checkedAt
        ? u('upToDate', {
            when: relative(new Date(update.checkedAt).toISOString(), Date.now(), locale),
          })
        : u('notChecked')}
    </p>
  )
}

function AboutSection() {
  const t = useT(messages)
  const u = useT(updateMessages)
  const server = useServer()
  const name = useServerName()
  const app = useDesktop()
  const update = useAppUpdate()
  const version = server.data?.version ?? ''
  return (
    <div className="grid gap-4">
      <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-6 gap-y-2 text-ui [overflow-wrap:anywhere]">
        <dt className="text-text-3">{t('thisApp')}</dt>
        {/* the web app is served by its server, so it's always the server's version */}
        <dd className="font-mono text-figure text-text">
          {app
            ? u('thisApp', { version: update.current ?? '', os: OS_NAMES[desktopOs] })
            : `highsea web ${version}`}
        </dd>
        <dt className="text-text-3">{t('server')}</dt>
        <dd className="font-mono text-figure text-text">
          {name} {version}
        </dd>
        <dt className="text-text-3">{t('licence')}</dt>
        <dd className="text-text">{t('free')}</dd>
      </dl>
      {app && <AppUpdates />}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon="external" asChild>
          <a href="https://github.com/highsea-tv/highsea-tv" target="_blank" rel="noreferrer">
            {t('source')}
          </a>
        </Button>
      </div>
    </div>
  )
}

function SectionBody({ id }: { id: SectionId }) {
  if (id === 'appearance') return <ThemeSection />
  if (id === 'sounds') return <SoundSection />
  if (id === 'home') return <HomeSection />
  if (id === 'servers') return <ServersSection />
  if (id === 'devices') return <DevicesSection />
  return <AboutSection />
}

export function WebSettings() {
  const t = useT(messages)
  const { section } = useParams<{ section?: string }>()
  const current = SECTIONS.find((s) => s.id === section)
  const shownId: SectionId = current?.id ?? 'appearance'
  // Side by side once the page has room in rem, so 200% text gets the list-then-section pattern
  // a phone gets (a container query: rem there follows the text size, where a media query's
  // wouldn't).
  return (
    <main
      className={cn(
        '@container mx-auto w-full grid max-w-[1100px] grid-cols-[minmax(0,1fr)] gap-6 py-8',
        gutter,
      )}
    >
      <h1 className="text-display">{t('title')}</h1>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 @min-[42rem]:grid-cols-[14rem_minmax(0,1fr)]">
        <nav
          aria-label={t('title')}
          className={cn('grid content-start gap-1', current && 'hidden @min-[42rem]:grid')}
        >
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={href(`/settings/${s.id}`)}
              aria-current={shownId === s.id ? 'page' : undefined}
              className="flex items-center gap-3 rounded-md px-3 py-2.5 text-text-2 text-ui outline-none hover:bg-text/6 hover:text-text focus-visible:ring-focus @min-[42rem]:aria-[current=page]:bg-text/8 @min-[42rem]:aria-[current=page]:text-text"
            >
              <Icon name={s.icon} size={18} />
              <span className="grid">
                {t(`section.${s.id}`)}
                <span className="text-caption text-text-3 @min-[42rem]:hidden">
                  {t(`hint.${s.id}`)}
                </span>
              </span>
            </a>
          ))}
        </nav>
        <section
          aria-labelledby="settings-section"
          className={cn(
            'grid grid-cols-[minmax(0,1fr)] content-start gap-4',
            !current && 'hidden @min-[42rem]:grid',
          )}
        >
          {current && (
            <a
              href={href('/settings')}
              className="flex items-center gap-1 justify-self-start text-text-2 text-ui @min-[42rem]:hidden"
            >
              <Icon name="chevron-left" size={16} />
              {t('back')}
            </a>
          )}
          <h2 id="settings-section" className="text-title">
            {t(`section.${shownId}`)}
          </h2>
          <SectionBody id={shownId} />
        </section>
      </div>
    </main>
  )
}

/** C8: who you are on this server. */
export function WebProfile() {
  const t = useT(profileMessages)
  const { user } = useSignedIn()
  const name = useServerName()
  const display = user.displayName || user.username
  return (
    <main
      className={cn(
        'mx-auto w-full grid max-w-[720px] grid-cols-[minmax(0,1fr)] gap-6 py-8',
        gutter,
      )}
    >
      <div className="flex items-center gap-4">
        <span
          aria-hidden
          className="grid size-16 shrink-0 place-items-center rounded-full bg-accent-soft font-semibold text-[28px] text-accent-text"
        >
          {display.charAt(0).toUpperCase()}
        </span>
        <div className="grid min-w-0">
          <h1 className="text-display">{display}</h1>
          <p className="text-text-2 text-ui">
            {t(`handle.${user.role}`, { username: user.username, name })}
          </p>
        </div>
      </div>
      <section
        aria-label={t('account')}
        className="grid gap-3 rounded-lg border border-line bg-s1 p-5"
      >
        <h2 className="text-title">{t('account')}</h2>
        <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-6 gap-y-2 text-ui [overflow-wrap:anywhere]">
          <dt className="text-text-3">{t('server')}</dt>
          <dd className="text-text">{name}</dd>
          <dt className="text-text-3">{t('twoStep')}</dt>
          <dd className="text-text">{user.twoFactor ? t('on') : t('off')}</dd>
          <dt className="text-text-3">{t('libraries')}</dt>
          <dd className="text-text">
            {user.libraries === 'all'
              ? t('allLibraries')
              : t('someLibraries', { count: user.libraries.length })}
          </dd>
        </dl>
        <p className="text-caption text-text-3">{t('manage', { name })}</p>
      </section>
      <ul className="grid gap-2">
        {(
          [
            { href: '/settings', icon: 'settings', label: 'settings', hint: 'settingsHint' },
            { href: '/settings/devices', icon: 'phone', label: 'devices', hint: 'devicesHint' },
            { href: '/downloads', icon: 'download', label: 'downloads', hint: 'downloadsHint' },
          ] as const
        ).map((l) => (
          <li key={l.href}>
            <a
              href={href(l.href)}
              className="flex items-center gap-3 rounded-md border border-line bg-s1 px-4 py-3 text-ui outline-none hover:bg-s2 focus-visible:ring-focus"
            >
              <Icon name={l.icon} size={18} className="text-text-3" />
              <span className="grid flex-1">
                <span className="text-text">{t(l.label)}</span>
                <span className="text-caption text-text-3">{t(l.hint)}</span>
              </span>
              <Icon name="chevron-right" size={16} className="text-text-3" />
            </a>
          </li>
        ))}
      </ul>
    </main>
  )
}

/** Downloads (C8): a browser can't keep films; the desktop app can. */
export function WebDownloads() {
  const t = useT(profileMessages)
  // the app's own Downloads (the prototype's DesktopDownloads) comes with downloading, in 4.4b
  if (useDesktop())
    return (
      <main
        className={cn(
          'mx-auto w-full grid max-w-[1680px] grid-cols-[minmax(0,1fr)] gap-6 pt-6 pb-16',
          gutter,
        )}
      >
        <h1 className="text-display">{t('downloads')}</h1>
        <EmptyState icon="download" title={t('appDownloadsTitle')}>
          {t('appDownloadsBody')}
        </EmptyState>
      </main>
    )
  return (
    <main
      className={cn(
        'mx-auto w-full grid min-h-[60vh] max-w-[1680px] grid-cols-[minmax(0,1fr)] place-items-center',
        gutter,
      )}
    >
      <EmptyState
        icon="download"
        title={t('downloadsTitle')}
        action={<p className="text-caption text-text-3">{t('downloadsSoon')}</p>}
      >
        {t('downloadsBody')}
      </EmptyState>
    </main>
  )
}

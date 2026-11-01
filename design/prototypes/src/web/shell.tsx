// SPDX-License-Identifier: AGPL-3.0-only
// The web/desktop client's frame (desktop-web.md#structure): a slim top bar, translucent over the
// hero, with the server switcher at the left, the TV's destinations centred (Search as its icon,
// Home, Collections, Movies, Shows and Music; the owner, 2026-10-30), then Alerts and the profile
// at the right; then the page. Unlike the TV's head it stays at the top as the page scrolls: in
// the desktop app it's the window's title bar. The owner's acknowledge-required announcement opens
// over everything, and an unreachable server replaces the page with what to do about it.

import { relative } from '@highsea-tv/core/format'
import {
  Button,
  cn,
  Dialog,
  DialogContent,
  EmptyState,
  Icon,
  type IconName,
  Mark,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  PageScrollbar,
  Popover,
  PopoverContent,
  PopoverTrigger,
  toast,
} from '@highsea-tv/ui-web'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import {
  clientHref,
  useAnnouncements,
  useAppUpdateReady,
  useConnection,
  useDesktopApp,
  useKnownServers,
  useServer,
  useServerName,
} from '../client/data.ts'
import { useMusicPlayer } from '../client/music-player.ts'
import { toneClass, usePeople } from '../client/profiles.ts'
import { APP_VERSION, NEXT_APP_VERSION } from '../client/settings.ts'
import { restartToUpdate } from '../client/settings-sections.tsx'
import { Cta, Inline } from '../kit/inline.tsx'
import { useNow } from '../mock/hooks.tsx'
import { MUSIC_BAR, MusicBar } from './music-bar.tsx'
import { trafficLightInset, useWindowChrome } from './window.tsx'

export const webHref = (path: string) => clientHref('web', path)

/** Content width: 1680px on wide screens, gutters per breakpoint. */
export const gutter = 'px-4 medium:px-8 wide:px-16'

// the TV's (tv/kit.tsx): Search as its icon, then a destination per kind of media, Collections
// first; Downloads is in the profile's menu
const destinations: { path: string; label: string; icon?: IconName }[] = [
  { path: '/search', label: 'Search', icon: 'search' },
  { path: '/', label: 'Home' },
  { path: '/collections', label: 'Collections' },
  { path: '/movies', label: 'Movies' },
  { path: '/shows', label: 'Shows' },
  { path: '/music', label: 'Music' },
]

const isCurrent = (path: string, location: string) =>
  path === '/' ? location === '/' : location.startsWith(path)

function ServerSwitcher() {
  const server = useServer()
  const known = useKnownServers()
  const connection = useConnection()
  const now = useNow()
  const [, navigate] = useLocation()
  const name = server.data?.name ?? 'this server'
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          className="flex min-w-0 items-center gap-2 rounded-sm px-1.5 py-1 font-semibold text-body outline-none hover:bg-text/8 focus-visible:ring-focus"
        >
          <Mark size={24} />
          <span className="truncate">{name}</span>
          {connection === 'remote' && (
            <span className="hidden rounded-full bg-text/10 px-2 py-0.5 font-normal text-caption text-text-2 medium:inline">
              Connected remotely
            </span>
          )}
          <Icon name="chevron-down" size={15} className="text-text-3" />
        </button>
      </MenuTrigger>
      <MenuContent align="start" className="w-72">
        <MenuLabel>Servers</MenuLabel>
        {(known.data ?? []).map((k) => {
          const current = k.id === 'srv-harbor'
          return (
            <MenuItem
              key={k.id}
              icon={current ? 'check' : 'server'}
              onSelect={() => !current && navigate('/connect')}
            >
              <span className="grid">
                <span>{k.name}</span>
                <span className="text-caption text-text-3">
                  {current
                    ? connection === 'remote'
                      ? `Remote · ${k.addresses.remote}`
                      : connection === 'offline'
                        ? 'Can’t reach it right now'
                        : `On this network · ${k.addresses.local}`
                    : `${k.signedIn ? 'Signed in' : 'Signed out'} · last used ${relative(k.lastSeen, now)}`}
                </span>
              </span>
            </MenuItem>
          )
        })}
        <MenuSeparator />
        <MenuItem icon="add" onSelect={() => navigate('/connect')}>
          Add a server
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}

function Profile() {
  const [, navigate] = useLocation()
  const update = useAppUpdateReady()
  const { people, me } = usePeople()
  const server = useServerName()
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          aria-label={
            update
              ? `${me.name}: profile and settings. An update is ready.`
              : `${me.name}: profile and settings`
          }
          className={cn(
            'relative grid size-8 place-items-center rounded-full font-semibold text-body outline-none focus-visible:ring-focus',
            toneClass[me.tone],
          )}
        >
          {me.name.charAt(0)}
          {/* the desktop app's update, waiting quietly for a restart */}
          {update && (
            <span className="absolute -end-0.5 -top-0.5 size-2.5 rounded-full border-2 border-bg bg-accent" />
          )}
        </button>
      </MenuTrigger>
      <MenuContent>
        <MenuLabel>{me.name}</MenuLabel>
        {people.length > 1 && (
          <MenuItem icon="users" onSelect={() => navigate('/who')}>
            Switch profile
          </MenuItem>
        )}
        <MenuItem icon="user" onSelect={() => navigate('/profile')}>
          Account
        </MenuItem>
        <MenuItem icon="download" onSelect={() => navigate('/downloads')}>
          Downloads
        </MenuItem>
        <MenuItem icon="settings" onSelect={() => navigate('/settings')}>
          Settings
        </MenuItem>
        <MenuItem icon="sign-out" onSelect={() => navigate('/connect')}>
          Sign out of {server}
        </MenuItem>
        {update && (
          <>
            <MenuSeparator />
            <MenuItem icon="refresh" onSelect={restartToUpdate}>
              <span className="grid">
                <span>Restart to update</span>
                <span className="text-caption text-text-3">
                  highsea {NEXT_APP_VERSION} is ready. You have {APP_VERSION}.
                </span>
              </span>
            </MenuItem>
          </>
        )}
      </MenuContent>
    </Menu>
  )
}

/**
 * The top bar. Over a hero it starts clear, fading the backdrop into the page's background behind
 * it, and turns to glass once the page scrolls; over Home's bloom it starts with nothing behind it,
 * as the TV's head stands on the bloom.
 */
export function TopBar({ overHero }: { overHero: boolean | 'bloom' }) {
  const [location] = useLocation()
  const chrome = useWindowChrome()
  const [scrolled, setScrolled] = useState(false)
  const bar = useRef<HTMLElement>(null)
  useEffect(() => {
    // glass once the page scrolls under the bar and the bar has stuck
    const on = () => {
      const el = bar.current
      const stuck =
        !el || el.getBoundingClientRect().top <= Number.parseFloat(getComputedStyle(el).top) + 0.5
      setScrolled(window.scrollY > 8 && stuck)
    }
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  const clear = overHero && !scrolled
  return (
    <header
      ref={bar}
      // in the desktop app the bar moves the window, as a title bar does
      data-tauri-drag-region={chrome === 'none' ? undefined : true}
      className={cn(
        // the border is there in both states, so its colour fades from transparent, not from
        // Tailwind's default `currentColor` (https://tailwindcss.com/docs/upgrade-guide#default-border-color)
        'sticky z-30 border-b bg-origin-border transition-tint',
        chrome === 'bar' ? 'top-8' : 'top-0',
        !clear
          ? 'glass-bar border-line'
          : overHero === 'bloom'
            ? 'border-transparent'
            : 'border-transparent bg-[linear-gradient(var(--color-bg),transparent)]',
      )}
    >
      <div
        className={cn(
          'mx-auto w-full flex h-20 max-w-[1680px] items-center gap-3',
          gutter,
          chrome === 'mac' && trafficLightInset,
        )}
      >
        <ServerSwitcher />
        <nav
          aria-label="Main"
          className="relative mx-auto hidden min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none] medium:flex"
        >
          {destinations.map((d) => {
            const active = isCurrent(d.path, location)
            return (
              <a
                key={d.path}
                href={webHref(d.path)}
                aria-current={active ? 'page' : undefined}
                aria-label={d.icon ? d.label : undefined}
                className={cn(
                  'shrink-0 rounded-sm px-3 py-1.5 font-semibold text-body outline-none transition-tint hover:text-text focus-visible:ring-focus',
                  // unselected, the text colour with alpha, as on the TV, so the bloom's colour shows through
                  active ? 'text-text' : 'text-text/65',
                )}
              >
                {d.icon ? (
                  <Icon name={d.icon} size={18} strokeWidth={2.25} className="block" />
                ) : (
                  d.label
                )}
              </a>
            )
          })}
        </nav>
        <div className="ms-auto flex items-center gap-1 medium:ms-0">
          <a
            href={webHref('/search')}
            aria-label="Search"
            className="grid size-9 place-items-center rounded-full text-text/65 outline-none hover:text-text focus-visible:ring-focus medium:hidden"
          >
            <Icon name="search" size={18} strokeWidth={2.25} />
          </a>
          <Alerts />
          <Profile />
        </div>
      </div>
      <nav
        aria-label="Main"
        className={cn('relative flex gap-1 overflow-x-auto pb-2 medium:hidden', gutter)}
      >
        {/* Search is the icon at the bar's right */}
        {destinations
          .filter((d) => !d.icon)
          .map((d) => (
            <a
              key={d.path}
              href={webHref(d.path)}
              aria-current={isCurrent(d.path, location) ? 'page' : undefined}
              className="shrink-0 rounded-full px-3 py-1 font-semibold text-body text-text/65 outline-none hover:text-text aria-[current=page]:bg-text/10 aria-[current=page]:text-text focus-visible:ring-focus"
            >
              {d.label}
            </a>
          ))}
      </nav>
    </header>
  )
}

/**
 * Alerts, just left of the profile, in place of the banners (the owner, 2026-10-30): a bell with a
 * dot while any announcement is new, opening every live one, newest first. Opening it counts the new
 * ones as seen; they keep their mark until it closes.
 */
function Alerts() {
  const a = useAnnouncements('web')
  const [fresh, setFresh] = useState<string[]>([])
  const count = a.unread.length
  const open = (next: boolean) => {
    if (!next) return setFresh([])
    const read = a.unread
    setFresh(read.map((x) => x.id))
    for (const x of read) a.dismiss(x.id)
  }
  return (
    <Popover onOpenChange={open}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={count ? `Alerts, ${count} new` : 'Alerts'}
          className="relative grid size-9 place-items-center rounded-full text-text/65 outline-none transition-tint hover:text-text focus-visible:ring-focus data-[state=open]:text-text"
        >
          <Icon name="notification" size={18} strokeWidth={2.25} />
          {count > 0 && (
            <span className="absolute end-1.5 top-1.5 size-2.5 rounded-full border-2 border-bg bg-accent" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <h2 className="border-line border-b px-4 py-3 font-semibold text-body">Alerts</h2>
        {a.all.length === 0 ? (
          <p className="px-4 py-6 text-center text-text-3">No announcements right now.</p>
        ) : (
          <ul className="grid max-h-[min(28rem,70svh)] overflow-y-auto">
            {a.all.map((x) => (
              <li key={x.id} className="flex gap-3 border-line border-b px-4 py-3 last:border-b-0">
                <Icon
                  name="announcement"
                  size={18}
                  className={cn(
                    'mt-0.5 shrink-0',
                    x.severity === 'warning' ? 'text-badge-warning' : 'text-accent-text',
                  )}
                />
                <div className="grid min-w-0 flex-1 gap-1">
                  <p className="flex items-center gap-2 font-semibold text-text">
                    <span className="min-w-0">{x.title}</span>
                    {fresh.includes(x.id) && (
                      <span className="shrink-0 rounded-full bg-accent-soft px-1.5 font-normal text-accent-text text-caption">
                        New
                      </span>
                    )}
                  </p>
                  <p className="text-text-2">
                    <Inline text={x.body} />
                  </p>
                  {x.cta && <Cta cta={x.cta} className="mt-1 justify-self-start" />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}

/** An acknowledge-required announcement: it stays until it's acknowledged. */
function AnnouncementModal() {
  const a = useAnnouncements('web')
  const m = a.modal
  return (
    <Dialog open={!!m}>
      <DialogContent
        size="sm"
        closable={false}
        title={m?.title ?? 'Announcement'}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        footer={
          m && (
            <>
              <Cta cta={m.cta} />
              <Button variant="primary" onClick={() => a.dismiss(m.id)}>
                Got it
              </Button>
            </>
          )
        }
      >
        {m && (
          <div className="grid gap-4">
            {m.image && (
              <img src={m.image} alt="" className="aspect-[21/9] w-full rounded-md object-cover" />
            )}
            <p className="text-body text-text-2">
              <Inline text={m.body} />
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** The server didn't answer on the LAN or remotely. */
export function Unreachable() {
  const server = useServer()
  const [, navigate] = useLocation()
  const name = server.data?.name ?? 'this server'
  // only the desktop app keeps downloads; a browser has none to fall back on
  const desktop = useDesktopApp()
  return (
    <main
      className={cn('mx-auto w-full grid min-h-[70vh] max-w-[1680px] place-items-center', gutter)}
    >
      <EmptyState
        icon="network"
        title={`Can’t reach ${name}`}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="primary" icon="refresh" onClick={() => window.location.reload()}>
              Try again
            </Button>
            {desktop && (
              <Button icon="download" asChild>
                <a href={webHref('/downloads')}>Watch downloads</a>
              </Button>
            )}
            <Button onClick={() => navigate('/connect')}>Switch server</Button>
          </div>
        }
      >
        highsea tried {name} on this network and at its remote address. It may be off, or the
        network may be down.{desktop && ' Your downloads still play.'}
      </EmptyState>
    </main>
  )
}

/** Toast-placed announcements: shown once when the app opens, then counted as seen. */
function AnnouncementToasts() {
  const a = useAnnouncements('web')
  const shown = useRef(new Set<string>())
  useEffect(() => {
    for (const t of a.toasts) {
      if (shown.current.has(t.id)) continue
      shown.current.add(t.id)
      toast({ title: t.title, description: <Inline text={t.body} />, tone: 'info' })
      a.dismiss(t.id)
    }
  }, [a])
  return null
}

export function WebShell({
  children,
  overHero = false,
}: {
  children: ReactNode
  overHero?: boolean | 'bloom'
}) {
  const connection = useConnection()
  // in a Mac window the handle keeps clear of the rounded corners
  const chrome = useWindowChrome()
  // the page's foot stays clear of the music player while it shows
  const music = useMusicPlayer().song !== null && connection !== 'offline'
  const [location] = useLocation()
  const desktop = useDesktopApp()
  // the desktop app's Downloads keeps working without the server
  const unreachable = connection === 'offline' && !(desktop && location.startsWith('/downloads'))
  return (
    <div className={cn('relative min-h-screen bg-bg text-text', music && MUSIC_BAR)}>
      <TopBar overHero={connection !== 'offline' && overHero} />
      <PageScrollbar inset={chrome === 'mac' ? 10 : 6} />
      {unreachable ? <Unreachable /> : children}
      {connection !== 'offline' && (
        <>
          <MusicBar />
          <AnnouncementModal />
          <AnnouncementToasts />
        </>
      )}
    </div>
  )
}

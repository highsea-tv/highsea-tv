// SPDX-License-Identifier: AGPL-3.0-only
// The web/desktop client's frame (desktop-web.md#structure): a slim top bar, translucent over the
// hero, with the server switcher, the destinations (Home, Search, Library, Downloads) and the
// profile; then the page. The owner's acknowledge-required announcement opens over everything,
// and an unreachable server replaces the page with what to do about it.

import { relative } from '@highsea-tv/core/format'
import {
  Banner,
  Button,
  cn,
  Dialog,
  DialogContent,
  EmptyState,
  Icon,
  Mark,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  toast,
} from '@highsea-tv/ui-web'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import {
  clientHref,
  useAnnouncements,
  useConnection,
  useKnownServers,
  useServer,
} from '../client/data.ts'
import { Cta, Inline } from '../kit/inline.tsx'
import { useNow } from '../mock/hooks.tsx'

export const webHref = (path: string) => clientHref('web', path)

/** Content width: 1680px on wide screens, gutters per breakpoint. */
export const gutter = 'px-4 medium:px-8 wide:px-16'

const destinations = [
  { path: '/', label: 'Home' },
  { path: '/search', label: 'Search' },
  { path: '/library', label: 'Library' },
  { path: '/downloads', label: 'Downloads' },
]

const isCurrent = (path: string, location: string) =>
  path === '/' ? location === '/' : location.startsWith(path)

function ServerSwitcher() {
  const server = useServer()
  const known = useKnownServers()
  const connection = useConnection()
  const now = useNow()
  const [, navigate] = useLocation()
  const name = server.data?.name ?? 'Harbor'
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          className="flex min-w-0 items-center gap-2 rounded-sm px-1.5 py-1 font-semibold text-ui outline-none hover:bg-text/8 focus-visible:ring-focus"
        >
          <Mark size={22} />
          <span className="truncate">{name}</span>
          {connection === 'remote' && (
            <span className="hidden rounded-full bg-text/10 px-2 py-0.5 font-normal text-[12px] text-text-2 medium:inline">
              Connected remotely
            </span>
          )}
          <Icon name="chevron-down" size={14} className="text-text-3" />
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
                <span className="text-[12px] text-text-3">
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
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          aria-label="Ines: profile and settings"
          className="grid size-8 place-items-center rounded-full bg-accent-soft font-semibold text-accent-text text-ui outline-none focus-visible:ring-focus"
        >
          I
        </button>
      </MenuTrigger>
      <MenuContent>
        <MenuLabel>Ines</MenuLabel>
        <MenuItem icon="user" onSelect={() => navigate('/profile')}>
          Account
        </MenuItem>
        <MenuItem icon="settings" onSelect={() => navigate('/settings')}>
          Settings
        </MenuItem>
        <MenuItem icon="sign-out" onSelect={() => navigate('/connect')}>
          Sign out of Harbor
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}

/** The top bar. Over a hero it starts clear and turns to glass once the page scrolls. */
export function TopBar({ overHero }: { overHero: boolean }) {
  const [location] = useLocation()
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  const clear = overHero && !scrolled
  return (
    <header
      className={cn(
        'sticky top-0 z-30 transition-tint',
        clear
          ? 'bg-[linear-gradient(var(--color-bg),transparent)]'
          : 'glass-bar border-line border-b',
      )}
    >
      <div className={cn('mx-auto flex h-16 max-w-[1680px] items-center gap-3', gutter)}>
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
                className={cn(
                  'shrink-0 rounded-sm px-3 py-1.5 text-ui outline-none transition-tint hover:text-text focus-visible:ring-focus',
                  active ? 'font-semibold text-text' : 'text-text-2',
                )}
              >
                {d.label}
              </a>
            )
          })}
        </nav>
        <div className="ms-auto flex items-center gap-1 medium:ms-0">
          <a
            href={webHref('/search')}
            aria-label="Search"
            className="grid size-9 place-items-center rounded-full text-text-2 outline-none hover:text-text focus-visible:ring-focus medium:hidden"
          >
            <Icon name="search" size={18} />
          </a>
          <Profile />
        </div>
      </div>
      <nav
        aria-label="Main"
        className={cn('relative flex gap-1 overflow-x-auto pb-2 medium:hidden', gutter)}
      >
        {destinations.map((d) => (
          <a
            key={d.path}
            href={webHref(d.path)}
            aria-current={isCurrent(d.path, location) ? 'page' : undefined}
            className="shrink-0 rounded-full px-3 py-1 text-text-2 text-ui outline-none aria-[current=page]:bg-text/10 aria-[current=page]:text-text focus-visible:ring-focus"
          >
            {d.label}
          </a>
        ))}
      </nav>
    </header>
  )
}

/** Banners from the owner, in the page's content width. */
export function Banners() {
  const a = useAnnouncements('web')
  if (!a.banners.length) return null
  return (
    <section aria-label="Announcements" className={cn('mx-auto grid max-w-[1680px] gap-2', gutter)}>
      {a.banners.map((b) => (
        <Banner
          key={b.id}
          title={b.title}
          tone={b.severity === 'warning' ? 'warning' : 'announcement'}
          onDismiss={() => a.dismiss(b.id)}
          action={b.cta ? <Cta cta={b.cta} /> : undefined}
        >
          <Inline text={b.body} />
        </Banner>
      ))}
    </section>
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
  const name = server.data?.name ?? 'Harbor'
  return (
    <main className={cn('mx-auto grid min-h-[70vh] max-w-[1680px] place-items-center', gutter)}>
      <EmptyState
        icon="network"
        title={`Can’t reach ${name}`}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="primary" icon="refresh" onClick={() => window.location.reload()}>
              Try again
            </Button>
            <Button onClick={() => navigate('/connect')}>Switch server</Button>
          </div>
        }
      >
        highsea tried {name} on this network and at its remote address. It may be off, or the
        network may be down. Downloads still play.
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
  overHero?: boolean
}) {
  const connection = useConnection()
  return (
    <div className="min-h-screen bg-bg text-text">
      <TopBar overHero={overHero && connection !== 'offline'} />
      {connection === 'offline' ? <Unreachable /> : children}
      {connection !== 'offline' && (
        <>
          <AnnouncementModal />
          <AnnouncementToasts />
        </>
      )}
    </div>
  )
}

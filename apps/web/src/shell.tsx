// SPDX-License-Identifier: AGPL-3.0-only
// The web client's frame (desktop-web.md#structure), ported from design/prototypes/src/web/shell.tsx:
// a slim top bar, translucent over the hero, with this server, the destinations (Home, Search,
// Library, Downloads) and the profile; then the page. The owner's acknowledge-required
// announcement opens over everything, and a server that stops answering replaces the page with
// what to do about it. The web app uses only the server it's served from (the plan's answer 3),
// so the switcher names this one and says where the others are.
import type { CurrentSession } from '@highsea-tv/api-contract'
import { useAnnouncements, useServer } from '@highsea-tv/client/data'
import { createFormat } from '@highsea-tv/client/format'
import { useLocale, useT } from '@highsea-tv/i18n/react'
import { useAction } from '@highsea-tv/sdk/react'
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
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useLocation } from 'wouter'
import { Cta, Inline } from './kit.tsx'
import { shell as messages } from './messages.ts'

/** The base every address of the web app sits under (vite.config.ts's `base`). */
export const BASE = '/web'

/** An address in the web app: `/movies/603` is `/web/movies/603`. */
export const href = (path: string) => `${BASE}${path === '/' ? '/' : path}`

/** Content width: 1680px on wide screens, gutters per breakpoint. */
export const gutter = 'px-4 medium:px-8 wide:px-16'

/** Who's signed in, for the shell and the profile; the gate provides it. */
export const SessionContext = createContext<CurrentSession | null>(null)

export function useSignedIn(): CurrentSession {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSignedIn needs the gate')
  return session
}

/** Running times, time left and captions, in this browser's language. */
export function useFormat() {
  const locale = useLocale()
  return useMemo(() => createFormat(locale), [locale])
}

/** This server's name, while it loads too. */
export function useServerName() {
  return useServer().data?.name ?? window.location.hostname
}

const destinations = [
  { path: '/', key: 'home' },
  { path: '/search', key: 'search' },
  { path: '/library', key: 'library' },
  { path: '/downloads', key: 'downloads' },
] as const

const isCurrent = (path: string, location: string) =>
  path === '/' ? location === '/' : location.startsWith(path)

/** Signs out, then loads the app afresh so it shows the sign-in. */
export function useSignOut() {
  const t = useT(messages)
  const out = useAction((c) => c.auth.signOut())
  return {
    pending: out.pending,
    run: () =>
      out.run().then(
        () => window.location.assign(href('/')),
        () => toast({ title: t('signOutFailed'), tone: 'danger' }),
      ),
  }
}

function ServerSwitcher() {
  const t = useT(messages)
  const name = useServerName()
  // the server's own test, so the pill and the stream's remote ceiling agree
  const { away } = useSignedIn()
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          className="flex min-w-0 items-center gap-2 rounded-sm px-1.5 py-1 font-semibold text-ui outline-none hover:bg-text/8 focus-visible:ring-focus"
        >
          <Mark size={22} />
          <span className="truncate">{name}</span>
          {away && (
            <span className="hidden rounded-full bg-text/10 px-2 py-0.5 font-normal text-[12px] text-text-2 medium:inline">
              {t('remotely')}
            </span>
          )}
          <Icon name="chevron-down" size={14} className="text-text-3" />
        </button>
      </MenuTrigger>
      <MenuContent align="start" className="w-72">
        <MenuLabel>{t('servers')}</MenuLabel>
        <MenuItem icon="check">
          <span className="grid">
            <span>{name}</span>
            <span className="text-[12px] text-text-3">
              {t('thisServer', { address: window.location.host })}
            </span>
          </span>
        </MenuItem>
        <MenuSeparator />
        <p className="px-2 py-1.5 text-caption text-text-3">{t('otherServers')}</p>
      </MenuContent>
    </Menu>
  )
}

function Profile() {
  const t = useT(messages)
  const [, navigate] = useLocation()
  const { user } = useSignedIn()
  const server = useServerName()
  const signOut = useSignOut()
  const name = user.displayName || user.username
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          aria-label={t('profile', { name })}
          className="grid size-8 place-items-center rounded-full bg-accent-soft font-semibold text-accent-text text-ui outline-none focus-visible:ring-focus"
        >
          {name.charAt(0).toUpperCase()}
        </button>
      </MenuTrigger>
      <MenuContent>
        <MenuLabel>{name}</MenuLabel>
        <MenuItem icon="user" onSelect={() => navigate('/profile')}>
          {t('account')}
        </MenuItem>
        <MenuItem icon="settings" onSelect={() => navigate('/settings')}>
          {t('settings')}
        </MenuItem>
        <MenuItem icon="sign-out" onSelect={signOut.run}>
          {t('signOut', { server })}
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}

/** The top bar. Over a hero it starts clear and turns to glass once the page scrolls. */
export function TopBar({ overHero }: { overHero: boolean }) {
  const t = useT(messages)
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
        // the border is there in both states, so its colour fades from transparent, not from
        // Tailwind's default `currentColor` (https://tailwindcss.com/docs/upgrade-guide#default-border-color)
        'sticky top-0 z-30 border-b transition-tint',
        clear
          ? 'border-transparent bg-[linear-gradient(var(--color-bg),transparent)]'
          : 'glass-bar border-line',
      )}
    >
      <div className={cn('mx-auto w-full flex h-16 max-w-[1680px] items-center gap-3', gutter)}>
        <ServerSwitcher />
        <nav
          aria-label={t('main')}
          className="relative mx-auto hidden min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none] medium:flex"
        >
          {destinations.map((d) => {
            const active = isCurrent(d.path, location)
            return (
              <a
                key={d.path}
                href={href(d.path)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'shrink-0 rounded-sm px-3 py-1.5 text-ui outline-none transition-tint hover:text-text focus-visible:ring-focus',
                  active ? 'font-semibold text-text' : 'text-text-2',
                )}
              >
                {t(d.key)}
              </a>
            )
          })}
        </nav>
        <div className="ms-auto flex items-center gap-1 medium:ms-0">
          <a
            href={href('/search')}
            aria-label={t('search')}
            className="grid size-9 place-items-center rounded-full text-text-2 outline-none hover:text-text focus-visible:ring-focus medium:hidden"
          >
            <Icon name="search" size={18} />
          </a>
          <Profile />
        </div>
      </div>
      <nav
        aria-label={t('main')}
        className={cn('relative flex gap-1 overflow-x-auto pb-2 medium:hidden', gutter)}
      >
        {destinations.map((d) => (
          <a
            key={d.path}
            href={href(d.path)}
            aria-current={isCurrent(d.path, location) ? 'page' : undefined}
            className="shrink-0 rounded-full px-3 py-1 text-text-2 text-ui outline-none aria-[current=page]:bg-text/10 aria-[current=page]:text-text focus-visible:ring-focus"
          >
            {t(d.key)}
          </a>
        ))}
      </nav>
    </header>
  )
}

/** Banners from the owner, in the page's content width. */
export function Banners() {
  const t = useT(messages)
  const a = useAnnouncements('web')
  if (!a.banners.length) return null
  return (
    <section
      aria-label={t('announcements')}
      className={cn('mx-auto w-full grid max-w-[1680px] gap-2', gutter)}
    >
      {a.banners.map((b) => (
        <Banner
          key={b.id}
          title={b.title}
          tone={b.severity === 'warning' || b.severity === 'critical' ? 'warning' : 'announcement'}
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
  const t = useT(messages)
  const a = useAnnouncements('web')
  const m = a.modal
  return (
    <Dialog open={!!m}>
      <DialogContent
        size="sm"
        closable={false}
        title={m?.title ?? t('announcement')}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        footer={
          m && (
            <>
              <Cta cta={m.cta} />
              <Button variant="primary" onClick={() => a.dismiss(m.id)}>
                {t('gotIt')}
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

/** Toast-placed announcements: shown once when the app opens, then counted as seen. */
function AnnouncementToasts() {
  const a = useAnnouncements('web')
  const shown = useRef(new Set<string>())
  useEffect(() => {
    for (const n of a.toasts) {
      if (shown.current.has(n.id)) continue
      shown.current.add(n.id)
      toast({ title: n.title, description: <Inline text={n.body} />, tone: 'info' })
      a.dismiss(n.id)
    }
  }, [a])
  return null
}

/** The server stopped answering. Without other servers to switch to, trying again is the way. */
export function Unreachable({ name, onRetry }: { name: string; onRetry: () => void }) {
  const t = useT(messages)
  return (
    <main
      className={cn('mx-auto w-full grid min-h-[70vh] max-w-[1680px] place-items-center', gutter)}
    >
      <EmptyState
        icon="network"
        title={t('unreachableTitle', { name })}
        action={
          <Button variant="primary" icon="refresh" onClick={onRetry}>
            {t('tryAgain')}
          </Button>
        }
      >
        {t('unreachableBody', { name })}
      </EmptyState>
    </main>
  )
}

/** Whether the server answers, from the event stream every screen keeps open. */
export const ReachableContext = createContext<{ offline: boolean; retry: () => void }>({
  offline: false,
  retry: () => {},
})

export function WebShell({
  children,
  overHero = false,
}: {
  children: ReactNode
  overHero?: boolean
}) {
  const { offline, retry } = useContext(ReachableContext)
  const name = useServerName()
  return (
    <div className="min-h-screen bg-bg text-text">
      <TopBar overHero={overHero && !offline} />
      {offline ? <Unreachable name={name} onRetry={retry} /> : children}
      {!offline && (
        <>
          <AnnouncementModal />
          <AnnouncementToasts />
        </>
      )}
    </div>
  )
}

/** Any other address under /web. */
export function NotFound() {
  const t = useT(messages)
  const name = useServerName()
  return (
    <main className="grid min-h-[70vh] place-items-center px-4">
      <EmptyState
        icon="search"
        title={t('notFoundTitle')}
        action={
          <Button variant="primary" asChild>
            <a href={href('/')}>{t('goHome')}</a>
          </Button>
        }
      >
        {t('notFoundBody', { name })}
      </EmptyState>
    </main>
  )
}

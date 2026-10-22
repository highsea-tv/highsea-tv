'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// A1, the admin shell (admin.md), ported from the prototype: the sidebar (full at expanded and up,
// a rail at medium, a menu sheet at compact), the ⌘K palette, toasts and the status bar. Pages
// render inside through `AdminPage`. Announcement banners sit above the page (checkpoint 8c). What
// later checkpoints bring is left out until then: the queue's sidebar count, the palette's
// download actions and import toasts.

import { bytes } from '@highsea-tv/core/format'
import { useT } from '@highsea-tv/i18n/react'
import { useAction, useQuery } from '@highsea-tv/sdk/react'
import {
  Button,
  type CommandGroup,
  CommandPalette,
  Lockup,
  Mark,
  NavGroup,
  NavItem,
  PageHeader,
  SearchTrigger,
  ServerCard,
  Sheet,
  SheetContent,
  Sidebar,
  StatusBar,
  StatusItem,
  toast,
  useCommandPaletteShortcut,
  useSidebarMode,
} from '@highsea-tv/ui-web'
import { usePathname, useRouter } from 'next/navigation'
import {
  createContext,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useContext,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { AccountSheet } from './account.tsx'
import { AnnouncementBanners } from './announcement-banners.tsx'
import { moviePath } from './media-links.ts'
import { shell as messages } from './messages.ts'
import { type Page, pageAt, pageGroups, type Role } from './nav.ts'
import { system as systemMessages } from './system-messages.ts'
import { useRelative } from './time.ts'

type Shell = {
  role: Role
  openPalette: () => void
  openMenu: () => void
  openAccount: () => void
  /** Customize mode on the dashboard; the palette can start it from anywhere. */
  customizing: boolean
  setCustomizing: (on: boolean) => void
}

const ShellContext = createContext<Shell | null>(null)

export function useShell(): Shell {
  const shell = useContext(ShellContext)
  if (!shell) throw new Error('useShell needs an AdminShell')
  return shell
}

/** Signs out, then goes to the sign-in page with a fresh load, so nothing of the session stays. */
export function useSignOut() {
  const t = useT(messages)
  const signOut = useAction((c) => c.auth.signOut())
  return () =>
    signOut.run().then(
      () => window.location.assign('/login'),
      () => toast.error(t('signOut.failed')),
    )
}

// ---------------------------------------------------------------- page frame

export type AdminPageProps = {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children?: ReactNode
}

/** A page's top row (title, search, actions) with the compact menu button, then its content. */
export function AdminPage({ title, description, actions, children }: AdminPageProps) {
  const shell = useShell()
  const t = useT(messages)
  return (
    <>
      <PageHeader
        title={title}
        description={description}
        start={
          <Button
            variant="ghost"
            iconOnly
            icon="menu"
            aria-label={t('menu')}
            onClick={shell.openMenu}
            className="-ms-2 medium:hidden"
          />
        }
        search={<SearchTrigger onClick={shell.openPalette} />}
        actions={actions}
      />
      {children}
    </>
  )
}

// ---------------------------------------------------------------- navigation

function Navigation({ mode, onNavigate }: { mode?: 'full'; onNavigate?: () => void }) {
  const t = useT(messages)
  const shell = useShell()
  const path = usePathname()
  const current = pageAt(path)
  const server = useQuery('server', (c) => c.system.server(), ['server.updated'])
  // the rail is 64px: the mark alone (brand.tsx: the lockup needs 96px)
  const auto = useSidebarMode()
  const health = useQuery('health', (c) => c.system.healthChecks(), ['server.updated'])
  // the library's size, not its movies: one row is enough for the total
  const movies = useQuery('movies-count', (c) => c.movies.list({ query: { limit: 1 } }), [
    'movies.updated',
  ])
  const counts: Partial<Record<Page['id'], number>> = {
    movies: movies.data?.total || undefined,
  }

  const card =
    server.status === 'error' ? (
      <ServerCard name={t('server.notConnected')} detail={t('server.retrying')} status="offline" />
    ) : server.status === 'loading' ? (
      <ServerCard name={t('server.connecting')} detail={t('server.looking')} status="degraded" />
    ) : (
      <ServerCard
        name={server.data.name}
        detail={t('server.detail', {
          version: server.data.version,
          clients: server.data.clientsConnected,
        })}
        status={health.data?.some((h) => h.level === 'error') ? 'degraded' : 'online'}
      />
    )

  const groups = pageGroups
  return (
    <Sidebar
      mode={mode}
      header={(mode ?? auto) === 'rail' ? <Mark size={28} label="highsea tv" /> : <Lockup />}
      footer={card}
      className={mode ? 'w-full border-0 bg-transparent p-0' : undefined}
    >
      {groups.map((group, i) => (
        <NavGroup key={group[0]?.id}>
          {group.map((p) => (
            <NavItem
              key={p.id}
              icon={p.icon}
              label={t(p.label)}
              href={p.path}
              count={counts[p.id]}
              active={current?.id === p.id}
              onClick={onNavigate}
            />
          ))}
          {/* your own account sits with the last group */}
          {i === groups.length - 1 && (
            <NavItem
              icon="user"
              label={t('nav.account')}
              onClick={() => {
                onNavigate?.()
                shell.openAccount()
              }}
            />
          )}
        </NavGroup>
      ))}
    </Sidebar>
  )
}

// ---------------------------------------------------------------- palette

/** Movie titles are looked up as you type: a library can be far too big to list up front. */
const PALETTE_MOVIES = 8

/** Accents dropped, so "amelie" finds Amélie as the server's title filter does. */
const plain = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '')

function usePaletteGroups(shell: Shell, search: string): CommandGroup[] {
  const t = useT(messages)
  const router = useRouter()
  const signOut = useSignOut()
  const query = useDeferredValue(search.trim())
  const found = useQuery(
    `palette-movies:${query}`,
    (c) =>
      query
        ? c.movies.list({ query: { title: query, limit: PALETTE_MOVIES } })
        : Promise.resolve(null),
    ['movies.updated'],
  )
  const titles = found.data?.items
  return useMemo(() => {
    const go: CommandGroup = {
      heading: t('palette.goTo'),
      items: pageGroups.flat().map((p) => ({
        id: `go-${p.id}`,
        label: t(p.label),
        icon: p.icon,
        keywords: t(p.keywords)
          .split(',')
          .map((k) => k.trim()),
        onSelect: () => router.push(p.path),
      })),
    }
    const actions: CommandGroup = {
      heading: t('palette.actions'),
      items: [
        {
          id: 'add-movie',
          label: t('palette.addMovie'),
          icon: 'add',
          keywords: t('keywords.addMovie')
            .split(',')
            .map((k) => k.trim()),
          onSelect: () => router.push('/discover'),
        },
        {
          id: 'customize',
          label: t('palette.customize'),
          icon: 'edit',
          keywords: t('keywords.customize')
            .split(',')
            .map((k) => k.trim()),
          onSelect: () => {
            router.push('/')
            shell.setCustomizing(true)
          },
        },
        {
          id: 'account',
          label: t('nav.account'),
          icon: 'user',
          keywords: t('keywords.account')
            .split(',')
            .map((k) => k.trim()),
          onSelect: shell.openAccount,
        },
        { id: 'sign-out', label: t('palette.signOut'), icon: 'sign-out', onSelect: signOut },
      ],
    }
    const movies: CommandGroup = {
      heading: t('nav.movies'),
      items: (titles ?? []).map((m) => ({
        id: `movie-${m.id}`,
        label: m.year ? t('palette.movie', { title: m.title, year: m.year }) : m.title,
        icon: 'movie',
        keywords: [plain(m.title), m.originalTitle, plain(m.originalTitle), ...m.genres],
        onSelect: () => router.push(moviePath(m.id)),
      })),
    }
    return movies.items.length ? [go, actions, movies] : [go, actions]
  }, [router, shell, signOut, t, titles])
}

// ---------------------------------------------------------------- status bar

/** CPU and memory have no event: the status bar asks again every few seconds. */
const STATUS_INTERVAL = 5000

function AdminStatusBar() {
  const t = useT(messages)
  const ts = useT(systemMessages)
  const { relative } = useRelative()
  const server = useQuery('server', (c) => c.system.server(), ['server.updated'])
  const status = useQuery('status', (c) => c.system.status(), [], { interval: STATUS_INTERVAL })
  const jobs = useQuery('jobs', (c) => c.system.jobs(), ['jobs.updated'], {
    interval: STATUS_INTERVAL,
  })

  if (server.status === 'error')
    return (
      <StatusBar>
        <StatusItem dot="danger">{t('server.notConnected')}</StatusItem>
        <StatusItem end>{t('server.retrying')}</StatusItem>
      </StatusBar>
    )
  if (server.status === 'loading' || status.status === 'loading' || !jobs.data)
    return (
      <StatusBar>
        <StatusItem dot="neutral">{t('server.connecting')}</StatusItem>
      </StatusBar>
    )

  const s = status.data
  const running = jobs.data.filter((j) => j.state === 'running')
  const nextJob = jobs.data
    .filter((j) => j.state === 'idle' && j.nextRun)
    .sort((a, b) => Date.parse(a.nextRun ?? '') - Date.parse(b.nextRun ?? ''))[0]
  const running_ = t('status.jobs', { count: running.length })
  return (
    <StatusBar>
      <StatusItem dot="success">{server.data.name}</StatusItem>
      <StatusItem hideBelow="medium">
        {t('server.version', { version: server.data.version })}
      </StatusItem>
      <StatusItem hideBelow="medium">
        {t('status.clients', { clients: server.data.clientsConnected })}
      </StatusItem>
      {s && (
        <>
          <StatusItem hideBelow="expanded">{t('status.cpu', { value: s.cpu })}</StatusItem>
          <StatusItem hideBelow="expanded">
            {t('status.ram', { value: bytes(s.memory.used) })}
          </StatusItem>
          <StatusItem hideBelow="expanded">
            {t('status.free', { value: bytes(s.disks.reduce((sum, d) => sum + d.free, 0)) })}
          </StatusItem>
        </>
      )}
      <StatusItem end>
        {nextJob?.nextRun
          ? t('status.next', {
              jobs: running_,
              // the task's name from System › Tasks; a type without one shows as it is
              name:
                `task.${nextJob.name}` in systemMessages
                  ? ts(`task.${nextJob.name}` as keyof typeof systemMessages & `task.${string}`)
                  : nextJob.name,
              when: relative(nextJob.nextRun),
            })
          : running_}
      </StatusItem>
    </StatusBar>
  )
}

// ---------------------------------------------------------------- the shell

/**
 * Same-origin links go through Next's router, so the shell and its data stay put between pages.
 * The design system's links are plain anchors; one handler here covers them all.
 */
function useClientLinks() {
  const router = useRouter()
  return useCallback(
    (e: MouseEvent) => {
      const a = (e.target as Element).closest('a')
      if (!a || e.defaultPrevented || e.button !== 0) return
      if (
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey ||
        a.target ||
        a.hasAttribute('download')
      )
        return
      if (a.origin !== window.location.origin) return
      e.preventDefault()
      router.push(a.pathname + a.search + a.hash)
    },
    [router],
  )
}

export function AdminShell({ role: initialRole, children }: { role: Role; children: ReactNode }) {
  // the server knew the role at first paint; the session query keeps it current
  const session = useQuery('session', (c) => c.auth.session(), ['users.updated'])
  const live = session.data?.user.role
  const role = live === 'owner' || live === 'admin' ? live : initialRole
  const [palette, setPalette] = useState(false)
  const [search, setSearch] = useState('')
  const [menu, setMenu] = useState(false)
  const [account, setAccount] = useState(false)
  const [customizing, setCustomizing] = useState(false)
  const path = usePathname()
  const main = useRef<HTMLElement>(null)
  const togglePalette = useCallback(() => setPalette((o) => !o), [])
  useCommandPaletteShortcut(togglePalette)
  const onClick = useClientLinks()
  const t = useT(messages)

  // signed out elsewhere (this device revoked, or removed): back to the sign-in page
  useEffect(() => {
    if (session.status === 'error' && (session.error as { status?: number }).status === 401)
      window.location.assign(`/login?next=${encodeURIComponent(path)}`)
  }, [session.status, session.error, path])

  // no longer staff: a fresh load shows the refusal page (ADR 0032)
  useEffect(() => {
    if (live === 'user') window.location.reload()
  }, [live])

  // leaving the dashboard ends customize mode, and each page starts at the top
  useEffect(() => {
    if (path !== '/') setCustomizing(false)
    main.current?.parentElement?.scrollTo({ top: 0 })
  }, [path])

  const shell = useMemo<Shell>(
    () => ({
      role,
      openPalette: () => setPalette(true),
      openMenu: () => setMenu(true),
      openAccount: () => setAccount(true),
      customizing,
      setCustomizing,
    }),
    [role, customizing],
  )
  const groups = usePaletteGroups(shell, palette ? search : '')

  return (
    <ShellContext.Provider value={shell}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: delegates link clicks, not a control */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: links keep their own keyboard behaviour */}
      <div className="flex h-screen bg-bg text-text" onClick={onClick}>
        <button
          type="button"
          onClick={() => main.current?.focus()}
          className="sr-only z-50 rounded-sm bg-s3 px-3 py-2 text-ui focus:not-sr-only focus:fixed focus:start-3 focus:top-3"
        >
          {t('skip')}
        </button>
        <Navigation />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1 overflow-y-auto">
            {/* grid-cols-1: a wide table scrolls inside its frame, not the page */}
            <main
              ref={main}
              tabIndex={-1}
              className="grid grid-cols-1 content-start gap-5 p-4 outline-none medium:px-6.5 medium:py-5.5"
            >
              <AnnouncementBanners />
              {children}
            </main>
          </div>
          <AdminStatusBar />
        </div>
        <Sheet open={menu} onOpenChange={setMenu}>
          <SheetContent side="left" title={t('menu')} hideTitle className="p-4">
            <Navigation mode="full" onNavigate={() => setMenu(false)} />
          </SheetContent>
        </Sheet>
        <CommandPalette
          open={palette}
          onOpenChange={(o) => {
            setPalette(o)
            if (!o) setSearch('')
          }}
          groups={groups}
          onSearchChange={setSearch}
        />
        <AccountSheet open={account} onOpenChange={setAccount} />
      </div>
    </ShellContext.Provider>
  )
}

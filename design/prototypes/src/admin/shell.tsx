// SPDX-License-Identifier: AGPL-3.0-only
// A1, the admin shell (admin.md): the sidebar (full at expanded and up, a rail at medium, a menu
// sheet at compact), the ⌘K palette, announcement banners, toasts for background events, and the
// status bar. Pages render inside through `AdminPage`. Only the owner and admins open the admin
// (ADR 0032), so it has one shape; a user is sent to the web client instead (checkpoint 4.2a).

import { bytes, relative } from '@highsea-tv/core/format'
import {
  Banner,
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
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useLocation } from 'wouter'
import { Cta, Inline } from '../kit/inline.tsx'
import { useClient, useNow, useQuery } from '../mock/hooks.tsx'
import type { Announcement, StaffRole, UserRole } from '../mock/types.ts'
import { useProto } from '../screen/screen.tsx'
import { pageAt, pageGroups } from './nav.ts'

type Shell = {
  role: StaffRole
  openPalette: () => void
  openMenu: () => void
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

/** The signed-in user's role: the session's, or the toolbar's while the session loads. */
function useRole(): UserRole {
  const proto = useProto()
  const session = useQuery('session', (c) => c.auth.session())
  return session.data?.user.role ?? proto.role
}

export const adminHref = (path: string) => `#/admin${path === '/' ? '' : path}`

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
  useEffect(() => {
    if (typeof title === 'string') document.title = `${title} · highsea`
  }, [title])
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
            aria-label="Menu"
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
  const [location] = useLocation()
  const current = pageAt(location)
  const server = useQuery('server', (c) => c.system.server(), ['server.updated'])
  const movies = useQuery('movies', (c) => c.movies.list(), ['item.updated'])
  const queue = useQuery('queue', (c) => c.queue.list(), ['queue.updated'])
  const playing = useQuery('sessions', (c) => c.sessions.list(), ['sessions.updated'])
  // the rail is 64px: the mark alone (brand.tsx: the lockup needs 96px)
  const auto = useSidebarMode()
  const health = useQuery('health', (c) => c.system.health(), ['health.updated'])
  const counts: Record<string, number | undefined> = {
    movies: movies.data?.length || undefined,
    activity: queue.data?.length || undefined,
    'now-playing': playing.data?.sessions.length || undefined,
  }

  const card =
    server.status === 'error' ? (
      <ServerCard name="Not connected" detail="Retrying every few seconds" status="offline" />
    ) : server.status === 'loading' ? (
      <ServerCard name="Connecting…" detail="Looking for the server" status="degraded" />
    ) : (
      <ServerCard
        name={server.data.name}
        detail={`v${server.data.version} · ${server.data.clientsConnected} ${server.data.clientsConnected === 1 ? 'client' : 'clients'}`}
        status={health.data?.some((h) => h.level === 'error') ? 'degraded' : 'online'}
      />
    )

  return (
    <Sidebar
      mode={mode}
      header={(mode ?? auto) === 'rail' ? <Mark size={28} label="highsea tv" /> : <Lockup />}
      footer={card}
      className={mode ? 'w-full border-0 bg-transparent p-0' : undefined}
    >
      {pageGroups.map((group, i) => (
        <NavGroup key={group[0]?.id}>
          {group.map((p) => (
            <NavItem
              key={p.id}
              icon={p.icon}
              label={p.label}
              href={adminHref(p.path)}
              count={counts[p.id]}
              active={current?.id === p.id}
              onClick={onNavigate}
            />
          ))}
          {/* the web client, for watching (checkpoint 4.2a): with your own things, last */}
          {i === pageGroups.length - 1 && (
            <NavItem icon="tv" label="Watch on highsea" href="#/web" onClick={onNavigate} />
          )}
        </NavGroup>
      ))}
    </Sidebar>
  )
}

// ---------------------------------------------------------------- palette

function usePaletteGroups(shell: Pick<Shell, 'setCustomizing'>): CommandGroup[] {
  const client = useClient()
  const [, navigate] = useLocation()
  const movies = useQuery('movies', (c) => c.movies.list(), ['item.updated'])
  return useMemo(() => {
    const go: CommandGroup = {
      heading: 'Go to',
      items: pageGroups.flat().map((p) => ({
        id: `go-${p.id}`,
        label: p.label,
        icon: p.icon,
        keywords: p.keywords,
        onSelect: () => navigate(p.path),
      })),
    }
    const actions: CommandGroup = {
      heading: 'Actions',
      items: [
        {
          id: 'add-movie',
          label: 'Add a movie',
          icon: 'add',
          keywords: ['tmdb', 'search'],
          onSelect: () => navigate('/discover'),
        },
        {
          id: 'customize',
          label: 'Customize the dashboard',
          icon: 'edit',
          keywords: ['widgets', 'layout'],
          onSelect: () => {
            navigate('/')
            shell.setCustomizing(true)
          },
        },
        {
          id: 'pause-all',
          label: 'Pause all downloads',
          icon: 'pause',
          keywords: ['torrents', 'stop'],
          onSelect: () =>
            client.downloads.pauseAll().then(
              () =>
                toast({
                  title: 'Downloads paused',
                  description: 'Seeding continues. Resume them from here or Downloads.',
                }),
              () => toast.error('Couldn’t pause downloads'),
            ),
        },
        {
          id: 'resume-all',
          label: 'Resume all downloads',
          icon: 'play',
          keywords: ['torrents', 'start'],
          onSelect: () =>
            client.downloads.resumeAll().then(
              () => toast({ title: 'Downloads resumed' }),
              () => toast.error('Couldn’t resume downloads'),
            ),
        },
        {
          id: 'watch',
          label: 'Watch on highsea',
          icon: 'tv',
          keywords: ['web', 'play', 'stream', 'client'],
          onSelect: () => navigate('~/web'),
        },
        {
          id: 'sign-out',
          label: 'Sign out',
          icon: 'sign-out',
          onSelect: () => navigate('/login'),
        },
      ],
    }
    const titles: CommandGroup = {
      heading: 'Movies',
      items: (movies.data ?? []).map((m) => ({
        id: `movie-${m.id}`,
        label: `${m.title} (${m.year})`,
        icon: 'movie',
        keywords: m.genres,
        onSelect: () => navigate(`/movies/${m.id}`),
      })),
    }
    return titles.items.length ? [go, actions, titles] : [go, actions]
  }, [movies.data, navigate, client, shell])
}

// ---------------------------------------------------------------- announcements

const tone = (a: Announcement) =>
  a.severity === 'critical' ? 'danger' : a.severity === 'warning' ? 'warning' : 'announcement'

function Announcements() {
  const client = useClient()
  const active = useQuery('announcements', (c) => c.announcements.active(), [
    'announcements.updated',
  ])
  const banners = (active.data ?? []).filter((a) => !a.seen && a.placements.includes('banner'))
  if (!banners.length) return null
  return (
    <div className="grid gap-2">
      {banners.map((a) => {
        const done = () => client.announcements.dismiss(a.id)
        return (
          <Banner
            key={a.id}
            title={a.title}
            tone={tone(a)}
            onDismiss={a.acknowledgement === 'dismiss' ? done : undefined}
            onAcknowledge={a.acknowledgement === 'require' ? done : undefined}
            action={a.cta ? <Cta cta={a.cta} /> : undefined}
          >
            <Inline text={a.body} />
          </Banner>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------- status bar

function AdminStatusBar() {
  const now = useNow()
  const server = useQuery('server', (c) => c.system.server(), ['server.updated'])
  const status = useQuery('status', (c) => c.system.status(), ['tick'])
  const jobs = useQuery('jobs', (c) => c.system.jobs(), ['jobs.updated', 'tick'])

  if (server.status === 'error')
    return (
      <StatusBar>
        <StatusItem dot="danger">Not connected</StatusItem>
        <StatusItem end>Retrying every few seconds</StatusItem>
      </StatusBar>
    )
  if (server.status === 'loading' || !status.data || !jobs.data)
    return (
      <StatusBar>
        <StatusItem dot="neutral">Connecting…</StatusItem>
      </StatusBar>
    )

  const s = status.data
  const running = jobs.data.filter((j) => j.state === 'running')
  const nextJob = jobs.data
    .filter((j) => j.state === 'idle' && j.nextRun)
    .sort((a, b) => Date.parse(a.nextRun ?? '') - Date.parse(b.nextRun ?? ''))[0]
  const free = s.disks.reduce((sum, d) => sum + d.free, 0)
  const clients = server.data.clientsConnected
  return (
    <StatusBar>
      <StatusItem dot="success">{server.data.name}</StatusItem>
      <StatusItem hideBelow="medium">v{server.data.version}</StatusItem>
      <StatusItem hideBelow="medium">
        {clients} {clients === 1 ? 'client' : 'clients'}
      </StatusItem>
      <StatusItem hideBelow="expanded">CPU {s.cpu}%</StatusItem>
      <StatusItem hideBelow="expanded">RAM {bytes(s.memory.used)}</StatusItem>
      <StatusItem hideBelow="expanded">{bytes(free)} free</StatusItem>
      <StatusItem end>
        {running.length
          ? `${running.length} ${running.length === 1 ? 'job' : 'jobs'} running`
          : 'No jobs running'}
        {nextJob?.nextRun ? ` · ${nextJob.name} ${relative(nextJob.nextRun, now)}` : ''}
      </StatusItem>
    </StatusBar>
  )
}

// ---------------------------------------------------------------- live toasts

/** Tells the owner when background work finishes, wherever they are in the admin. */
function useImportToasts() {
  const client = useClient()
  useEffect(
    () =>
      client.events.subscribe((e) => {
        if (e.type !== 'item.updated') return
        client.movies.get(e.id).then(
          (m) => {
            if (m.status === 'available')
              toast.success(`${m.title} is in the library`, {
                description: 'Imported and seeding. Subtitles are next.',
              })
          },
          () => {},
        )
      }),
    [client],
  )
}

// ---------------------------------------------------------------- the shell

/** The admin, or the web client for a user: no admin data loads for them. */
export function AdminShell({ children }: { children: ReactNode }) {
  const role = useRole()
  const [, navigate] = useLocation()
  useEffect(() => {
    if (role === 'user') navigate('~/web', { replace: true })
  }, [role, navigate])
  return role === 'user' ? null : <StaffShell role={role}>{children}</StaffShell>
}

function StaffShell({ role, children }: { role: StaffRole; children: ReactNode }) {
  const [palette, setPalette] = useState(false)
  const [menu, setMenu] = useState(false)
  const [customizing, setCustomizing] = useState(false)
  const [location] = useLocation()
  const main = useRef<HTMLElement>(null)
  const togglePalette = useCallback(() => setPalette((o) => !o), [])
  useCommandPaletteShortcut(togglePalette)
  useImportToasts()

  // leaving the dashboard ends customize mode, and each page starts at the top
  useEffect(() => {
    if (location !== '/') setCustomizing(false)
    main.current?.parentElement?.scrollTo({ top: 0 })
  }, [location])

  const shell = useMemo<Shell>(
    () => ({
      role,
      openPalette: () => setPalette(true),
      openMenu: () => setMenu(true),
      customizing,
      setCustomizing,
    }),
    [role, customizing],
  )
  const groups = usePaletteGroups(shell)

  return (
    <ShellContext.Provider value={shell}>
      <div className="flex h-screen bg-bg text-text">
        <button
          type="button"
          onClick={() => main.current?.focus()}
          className="sr-only z-50 rounded-sm bg-s3 px-3 py-2 text-ui focus:not-sr-only focus:fixed focus:start-3 focus:top-3"
        >
          Skip to content
        </button>
        <Navigation />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1 overflow-y-auto">
            {/* grid-cols-1: a wide table scrolls inside its frame, not the page */}
            <main
              ref={main}
              tabIndex={-1}
              className="grid grid-cols-1 content-start gap-5 p-4 outline-none medium:px-6.5 medium:py-5.5 [&>*]:min-w-0"
            >
              <Announcements />
              {children}
            </main>
          </div>
          <AdminStatusBar />
        </div>
        <Sheet open={menu} onOpenChange={setMenu}>
          <SheetContent side="left" title="Menu" hideTitle className="p-4">
            <Navigation mode="full" onNavigate={() => setMenu(false)} />
          </SheetContent>
        </Sheet>
        <CommandPalette open={palette} onOpenChange={setPalette} groups={groups} />
      </div>
    </ShellContext.Provider>
  )
}

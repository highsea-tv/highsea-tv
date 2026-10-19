// SPDX-License-Identifier: AGPL-3.0-only
// The mobile app's frame (mobile.md#home-tabs--carousel): the five-tab bar, translucent over the
// content above the home indicator; the header with the server switcher (a sheet) and the
// avatar; the owner's announcements (a card, or a dialog when it must be acknowledged); and what
// an unreachable server looks like. Sizes are in pt (≈ px here).
import {
  Banner,
  Button,
  cn,
  Dialog,
  DialogContent,
  EmptyState,
  Icon,
  type IconName,
  Mark,
  Sheet,
  SheetContent,
} from '@highsea/ui-web'
import { type ReactNode, useState } from 'react'
import { useLocation } from 'wouter'
import { relative } from '../admin/format.ts'
import {
  clientHref,
  useAnnouncements,
  useConnection,
  useKnownServers,
  useServer,
} from '../client/data.ts'
import { Cta, Inline } from '../kit/inline.tsx'
import { MobileScreen, safeArea } from '../kit/mobile/device.tsx'
import { useNow } from '../mock/hooks.tsx'

export const mobileHref = (path: string) => clientHref('mobile', path)

/** 16pt gutters (mobile.md#layout). */
export const gutter = 'px-4'

/** The tab bar's height, so content can scroll clear of it. */
export const TAB_BAR = 64

const tabs: { path: string; label: string; icon: IconName }[] = [
  { path: '/', label: 'Home', icon: 'dashboard' },
  { path: '/search', label: 'Search', icon: 'search' },
  { path: '/library', label: 'Library', icon: 'library' },
  { path: '/offline', label: 'Offline', icon: 'download' },
  { path: '/you', label: 'You', icon: 'user' },
]

function TabBar() {
  const [location] = useLocation()
  const active = (p: string) =>
    p === '/' ? location === '/' : location === p || location.startsWith(`${p}/`)
  return (
    <nav
      aria-label="Main"
      style={{ bottom: safeArea.bottom, height: TAB_BAR }}
      className="glass-bar absolute inset-x-0 z-20 grid grid-cols-5 border-line border-t"
    >
      {tabs.map((t) => (
        <a
          key={t.path}
          href={mobileHref(t.path)}
          aria-current={active(t.path) ? 'page' : undefined}
          className="grid place-content-center justify-items-center gap-0.5 text-[10px] text-text-3 outline-none transition-press focus-visible:ring-focus active:scale-97 aria-[current=page]:text-accent-text"
        >
          <Icon name={t.icon} size={22} />
          {t.label}
        </a>
      ))}
    </nav>
  )
}

function ServerSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const known = useKnownServers()
  const connection = useConnection()
  const now = useNow()
  const [, navigate] = useLocation()
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title="Servers">
        <ul className="grid gap-1">
          {(known.data ?? []).map((k) => {
            const current = k.id === 'srv-harbor'
            return (
              <li key={k.id}>
                <button
                  type="button"
                  onClick={() => {
                    onOpenChange(false)
                    if (!current) navigate('/connect')
                  }}
                  className="grid min-h-14 w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-3 py-2 text-start outline-none active:bg-s2 focus-visible:ring-focus"
                >
                  <Mark size={30} />
                  <span className="grid min-w-0">
                    <span className="truncate font-semibold text-[15px]">{k.name}</span>
                    <span className="truncate text-[13px] text-text-3">
                      {current
                        ? connection === 'remote'
                          ? 'Connected remotely'
                          : connection === 'offline'
                            ? 'Can’t reach it right now'
                            : 'On this network'
                        : `${k.signedIn ? 'Signed in' : 'Signed out'} · ${relative(k.lastSeen, now)}`}
                    </span>
                  </span>
                  {current && <Icon name="check" size={18} className="text-accent-text" />}
                </button>
              </li>
            )
          })}
        </ul>
        <Button
          icon="add"
          className="mt-3 w-full"
          onClick={() => {
            onOpenChange(false)
            navigate('/connect')
          }}
        >
          Add a server
        </Button>
      </SheetContent>
    </Sheet>
  )
}

/** Home's header: the server switcher on the left, the avatar on the right. */
export function Header({ title }: { title?: string }) {
  const server = useServer()
  const connection = useConnection()
  const [open, setOpen] = useState(false)
  return (
    <header className={cn('flex h-12 items-center gap-2', gutter)}>
      {title ? (
        <h1 className="font-semibold text-[28px] tracking-display">{title}</h1>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className="-ms-1.5 flex min-h-11 min-w-0 cursor-pointer items-center gap-2 rounded-sm px-1.5 outline-none focus-visible:ring-focus"
        >
          <Mark size={26} />
          <span className="grid min-w-0 text-start">
            <span className="truncate font-semibold text-[17px] leading-[1.15]">
              {server.data?.name ?? 'Harbor'}
            </span>
            {connection === 'remote' && (
              <span className="text-[11px] text-text-3 leading-[1.15]">Connected remotely</span>
            )}
          </span>
          <Icon name="chevron-down" size={16} className="text-text-3" />
        </button>
      )}
      <a
        href={mobileHref('/you')}
        aria-label="Ines: profile and settings"
        className="ms-auto grid size-9 place-items-center rounded-full bg-accent-soft font-semibold text-[15px] text-accent-text outline-none focus-visible:ring-focus"
      >
        I
      </a>
      <ServerSheet open={open} onOpenChange={setOpen} />
    </header>
  )
}

/** The owner's announcement as Home's card: dismissible unless it must be acknowledged. */
export function AnnouncementCard() {
  const a = useAnnouncements('mobile')
  const card = a.cards[0]
  if (!card) return null
  return (
    <div className={gutter}>
      <Banner
        title={card.title}
        tone="announcement"
        variant="card"
        onDismiss={() => a.dismiss(card.id)}
        action={card.cta ? <Cta cta={card.cta} /> : undefined}
      >
        <Inline text={card.body} />
      </Banner>
    </div>
  )
}

function AnnouncementDialog() {
  const a = useAnnouncements('mobile')
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
            <Button variant="primary" className="w-full" onClick={() => a.dismiss(m.id)}>
              Got it
            </Button>
          )
        }
      >
        {m && (
          <div className="grid gap-4">
            {m.image && (
              <img src={m.image} alt="" className="aspect-[16/9] w-full rounded-md object-cover" />
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

function Unreachable() {
  const server = useServer()
  const [, navigate] = useLocation()
  const name = server.data?.name ?? 'Harbor'
  return (
    <div className={cn('grid min-h-full place-items-center py-10', gutter)}>
      <EmptyState
        icon="network"
        title={`Can’t reach ${name}`}
        action={
          <div className="grid w-full gap-2">
            <Button variant="primary" icon="download" asChild>
              <a href={mobileHref('/offline')}>Watch downloads</a>
            </Button>
            <Button onClick={() => navigate('/connect')}>Switch server</Button>
          </div>
        }
      >
        highsea tried {name} on this network and at its remote address. Your downloads still play.
      </EmptyState>
    </div>
  )
}

/** A tab's screen: content scrolls under the status bar and clear of the tab bar. */
export function MobileShell({ children }: { children: ReactNode }) {
  const connection = useConnection()
  return (
    <MobileScreen tabBar={<TabBar />}>
      <div style={{ paddingBottom: TAB_BAR + 24 }} className="min-h-full">
        {connection === 'offline' ? <Unreachable /> : children}
      </div>
      {connection !== 'offline' && <AnnouncementDialog />}
    </MobileScreen>
  )
}

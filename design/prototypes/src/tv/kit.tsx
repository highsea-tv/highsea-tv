// SPDX-License-Identifier: AGPL-3.0-only
// Pieces every TV screen shares (tv.md): addresses, focus on arrival, buttons in screen units,
// the server identity, the announcement pill, and the global navigation, a top tab row that
// appears when focus moves Up from the hero actions (new design work, client-home.md#tv).
import { cn, Icon, type IconName, Mark } from '@highsea/ui-web'
import { type ComponentProps, type ReactNode, useEffect } from 'react'
import { useLocation } from 'wouter'
import { clientHref, useAnnouncements, useConnection, useServer } from '../client/data.ts'

export const tvHref = (path: string) => clientHref('tv', path)

/**
 * Focus the screen's first item once its content is in (the remote needs a focus): `data-initial`,
 * or what `selector` names.
 */
export function useInitialFocus(ready: boolean, key: unknown = null, selector = '[data-initial]') {
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` re-runs it on purpose
  useEffect(() => {
    if (!ready) return
    const t = requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(`[data-platform="tv"] ${selector}`)
        ?.focus({ preventScroll: true }),
    )
    return () => cancelAnimationFrame(t)
  }, [ready, key, selector])
}

const buttonBase =
  'flex items-center gap-[0.6cqw] rounded-(--tv-radius-button) px-[1.6cqw] py-[0.8cqw] font-semibold text-(length:--tv-text-button) whitespace-nowrap outline-none transition-lift focus-visible:scale-(--scale-button) focus-visible:shadow-(--tv-focus-shadow)'

/** Primary: a solid `text` fill. Secondary: `text` at 12%. Focus adds the ring and the scale. */
export function TvButton({
  primary = false,
  icon,
  initial = false,
  className,
  children,
  href,
  ...props
}: Omit<ComponentProps<'button'>, 'ref'> & {
  primary?: boolean
  icon?: IconName
  initial?: boolean
  href?: string
}) {
  const classes = cn(buttonBase, primary ? 'bg-text text-bg' : 'bg-text/12 text-text', className)
  const inner = (
    <>
      {icon && <Icon name={icon} size={24} className="size-[1.2cqw]" />}
      {children}
    </>
  )
  const focus = { 'data-focusable': '', ...(initial ? { 'data-initial': '' } : {}) }
  return href ? (
    <a href={href} className={classes} {...focus}>
      {inner}
    </a>
  ) : (
    <button type="button" className={classes} {...focus} {...props}>
      {inner}
    </button>
  )
}

/** Top left: the server's mark and name; "Connected remotely" under it when that's how. */
export function ServerIdentity() {
  const server = useServer()
  const connection = useConnection()
  return (
    <div className="absolute top-(--tv-safe-y) left-(--tv-safe-x) z-10 flex items-center gap-[0.8cqw]">
      <Mark size={32} className="size-[2cqw]" />
      <span className="grid">
        <span className="font-semibold text-(length:--tv-text-server-name) leading-[1.15]">
          {server.data?.name ?? 'Harbor'}
        </span>
        {connection === 'remote' && (
          <span className="text-(length:--tv-text-pill) text-text-2 leading-[1.15]">
            Connected remotely
          </span>
        )}
      </span>
    </div>
  )
}

/** Top right: the owner's newest announcement, as a pill. */
export function AnnouncementPill() {
  const a = useAnnouncements('tv')
  if (!a.latest || a.latest.acknowledgement === 'require') return null
  return (
    <div className="absolute top-(--tv-safe-y) right-(--tv-safe-x) z-10 flex max-w-[30cqw] items-center gap-[0.6cqw] rounded-full bg-s2/75 px-[1.2cqw] py-[0.5cqw] text-(length:--tv-text-pill) text-text-2 backdrop-blur-pill">
      <Icon name="announcement" size={24} className="size-[1.1cqw] shrink-0" />
      <span className="truncate">{a.latest.title}</span>
    </div>
  )
}

const destinations = [
  { path: '/', label: 'Home' },
  { path: '/search', label: 'Search' },
  { path: '/library', label: 'Library' },
  { path: '/settings', label: 'Settings' },
]

/**
 * The global navigation: hidden until focus moves Up into it from the hero actions (a focus guide),
 * then a tab row across the top. It's isolated, so focus enters it only that way, and Down returns
 * to the hero.
 */
export function GlobalNav({ down = 'hero' }: { down?: string }) {
  const [location] = useLocation()
  return (
    <nav
      aria-label="Main"
      data-group="nav"
      data-isolate=""
      data-go-down={down}
      className="group/nav absolute inset-x-0 top-0 z-20 flex justify-center pt-(--tv-safe-y) opacity-0 transition-opacity focus-within:opacity-100"
    >
      <div className="flex gap-[0.6cqw] rounded-full bg-s2/85 p-[0.4cqw] backdrop-blur-pill">
        {destinations.map((d) => {
          const active = d.path === '/' ? location === '/' : location.startsWith(d.path)
          return (
            <a
              key={d.path}
              href={tvHref(d.path)}
              data-focusable=""
              aria-current={active ? 'page' : undefined}
              className="rounded-full px-[1.4cqw] py-[0.5cqw] font-semibold text-(length:--tv-text-button) text-text-2 outline-none transition-lift focus-visible:scale-(--scale-button) focus-visible:bg-text focus-visible:text-bg not-focus-visible:aria-[current=page]:text-text"
            >
              {d.label}
            </a>
          )
        })}
      </div>
    </nav>
  )
}

/** A full-screen message (unreachable, nothing here yet), with its actions. */
export function TvMessage({
  title,
  children,
  actions,
}: {
  title: string
  children: ReactNode
  actions: ReactNode
}) {
  useInitialFocus(true)
  return (
    <main className="grid h-full place-items-center">
      <div className="grid max-w-[46cqw] justify-items-center gap-[1.4cqw] text-center">
        <h1 className="font-semibold text-[2.4cqw] leading-[1.15]">{title}</h1>
        <p className="text-(length:--tv-text-synopsis) text-text-2 leading-[1.45]">{children}</p>
        <div className="mt-[1cqw] flex gap-[1cqw]">{actions}</div>
      </div>
    </main>
  )
}

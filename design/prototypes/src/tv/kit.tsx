// SPDX-License-Identifier: AGPL-3.0-only
// Pieces every TV screen shares (tv.md): addresses, focus on arrival, buttons in screen units,
// posters with their titles, rows that scroll by focus, the server identity, the announcement
// pill, and the global navigation, a top tab row that appears when focus moves Up from the hero
// actions (new design work, client-home.md#tv).
import { cn, Icon, type IconName, Mark, Poster } from '@highsea-tv/ui-web'
import { type ComponentProps, type ReactNode, useEffect } from 'react'
import { useLocation } from 'wouter'
import { clientHref, left, useAnnouncements, useConnection, useServer } from '../client/data.ts'
import type { ClientItem } from '../mock/types.ts'

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

/** A key on an on-screen keyboard (sign-in, search): a grid cell that fills with `text` on focus. */
export const tvKey =
  'grid h-[3cqw] place-items-center rounded-[0.4cqw] bg-text/10 font-semibold text-(length:--tv-text-button) outline-none transition-lift focus-visible:scale-(--scale-button) focus-visible:bg-text focus-visible:text-bg'

/**
 * Top left: the server's mark and name; "Connected remotely" under it when that's how. It sits at
 * the top of the page and scrolls away with it, so it never covers the rows.
 */
export function ServerIdentity() {
  const server = useServer()
  const connection = useConnection()
  return (
    <div className="absolute top-(--tv-safe-y) left-(--tv-safe-x) flex items-center gap-[0.8cqw]">
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

/** Top right: the owner's newest announcement, as a pill. It scrolls with the page too. */
export function AnnouncementPill() {
  const a = useAnnouncements('tv')
  if (!a.latest || a.latest.acknowledgement === 'require') return null
  return (
    <div className="absolute top-(--tv-safe-y) right-(--tv-safe-x) flex max-w-[30cqw] items-center gap-[0.6cqw] rounded-full bg-s2/75 px-[1.2cqw] py-[0.5cqw] text-(length:--tv-text-pill) text-text-2 backdrop-blur-pill">
      <Icon name="announcement" size={24} className="size-[1.1cqw] shrink-0" />
      <span className="truncate">{a.latest.title}</span>
    </div>
  )
}

/**
 * A poster or a wide tile with its title and a caption under the art (the year, or the time left
 * on a wide tile). The art lifts on focus; the text stays put, clear of it.
 */
export function TvPoster({
  item,
  href,
  wide = false,
}: {
  item: ClientItem
  href: string
  wide?: boolean
}) {
  return (
    <TvTile
      title={item.title}
      caption={wide && item.progress !== null ? left(item) : String(item.year)}
      src={wide ? item.art.still : item.art.poster}
      href={href}
      wide={wide}
      progress={item.progress}
    />
  )
}

/** Any titled art as a focus stop: a movie (TvPoster), a collection. */
export function TvTile({
  title,
  caption,
  src,
  href,
  wide = false,
  progress = null,
}: {
  title: string
  caption: string
  src: string
  href: string
  wide?: boolean
  progress?: number | null
}) {
  return (
    <a
      href={href}
      data-focusable=""
      aria-label={`${title}, ${caption}`}
      className="group/link block rounded-(--tv-radius-poster) outline-none"
    >
      <Poster
        title={title}
        src={src}
        aspect={wide ? 'still' : 'poster'}
        progress={progress !== null ? progress * 100 : undefined}
      />
      <span className="mt-[1cqw] block truncate font-semibold text-(length:--tv-text-meta) text-text-2 leading-[1.3] transition-lift group-focus-visible/link:text-text">
        {title}
      </span>
      <span className="block truncate text-(length:--tv-text-pill) text-text-3 leading-[1.3]">
        {caption}
      </span>
    </a>
  )
}

/**
 * A titled row that scrolls sideways by transform to keep focus 30% in (tv.md#scrolling). The
 * track's column is `minmax(0, 1fr)`, so it stays the screen's width and its content overflows.
 */
export function TvRow({
  group,
  title,
  suffix,
  goUp,
  className,
  children,
}: {
  group: string
  title: string
  suffix?: string | null
  goUp?: string
  className?: string
  children: ReactNode
}) {
  return (
    <section
      data-group={group}
      data-go-up={goUp}
      aria-label={title}
      className={cn('grid grid-cols-1 gap-[0.8cqw]', className)}
    >
      <h2 className="px-(--tv-safe-x) font-semibold text-(length:--tv-text-row-title)">
        {title}
        {suffix && <span className="font-normal text-text-2"> {suffix}</span>}
      </h2>
      <div className="grid grid-cols-1">
        <ul
          data-scroll="x"
          data-keep="0.3"
          className="flex w-max gap-(--tv-poster-gap) px-(--tv-safe-x) py-[1cqw] transition-lift"
        >
          {children}
        </ul>
      </div>
    </section>
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

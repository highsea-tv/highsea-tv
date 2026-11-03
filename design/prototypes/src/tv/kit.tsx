// SPDX-License-Identifier: AGPL-3.0-only
// Pieces every TV screen shares (tv.md): addresses, focus on arrival, buttons in screen units,
// posters with their titles, rows that scroll by focus, the server identity, the announcement
// pill, and the global navigation, a top tab row on every screen but the player
// (client-home.md#tv), with the alternatives the owner asked to compare.

import type { ClientItem } from '@highsea-tv/mock/types'
import { tv } from '@highsea-tv/tokens'
import { Button, cn, Icon, type IconName, Mark, Poster, Skeleton, useSound } from '@highsea-tv/ui'
import {
  type ComponentProps,
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
} from 'react'
import { useLocation } from 'wouter'
import { clientHref, useAnnouncements, useConnection, useServer } from '../client/data.ts'
import { mediaCard } from '../client/media-card.tsx'
import { type Profile, toneClass, usePeople } from '../client/profiles.ts'
import { NowPlayingTab } from './now-playing.tsx'

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

/**
 * Moves focus as the spatial navigator does when a screen picks the item itself: the item left
 * drops its ring at once (navigator.ts's dropRing) and `navigate` plays.
 */
export function focusFrom(from: Element | null, to: HTMLElement, play: (e: 'navigate') => void) {
  to.focus({ preventScroll: true })
  if (from && typeof from.getAnimations === 'function')
    for (const a of from.getAnimations({ subtree: true }))
      if (a instanceof CSSTransition && a.transitionProperty === 'box-shadow') a.finish()
  play('navigate')
}

/**
 * Up and Down between a page's rows (`[data-row]` inside `ref`, in order) go to the next row with
 * something to focus, landing on the item it was left on, or the one marked `data-entry` (a
 * show's next episode), or its first. The navigator's nearest
 * centre would land mid-row, or pass over a film row, whose one stop sits at its left, from a card
 * far to the right (the owner, 2026-10-30). Past the first or last row, the navigator carries on.
 * It listens on `ref` itself, so it runs before the navigator on the TV's root; a screen that
 * renders its rows after loading passes `ready`, a new value for each set of rows.
 */
export function useRowNavigation(ref: RefObject<HTMLElement | null>, ready: unknown = true) {
  const play = useSound()
  useEffect(() => {
    const el = ref.current
    if (!el || !ready) return
    const left = new WeakMap<Element, HTMLElement>()
    const onFocus = (e: FocusEvent) => {
      const item = (e.target as HTMLElement).closest<HTMLElement>('[data-focusable]')
      const row = item?.closest('[data-row]')
      if (item && row) left.set(row, item)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      const by = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
      const from = (e.target as HTMLElement).closest('[data-row]')
      if (!by || !from) return
      const rows = [...el.querySelectorAll('[data-row]')]
      let i = rows.indexOf(from) + by
      while (rows[i] && !rows[i]?.querySelector('[data-focusable]')) i += by
      const row = rows[i]
      if (!row) return
      const was = left.get(row)
      const to = was?.isConnected
        ? was
        : (row.querySelector<HTMLElement>('[data-focusable][data-entry]') ??
          row.querySelector<HTMLElement>('[data-focusable]'))
      if (!to) return
      e.preventDefault()
      focusFrom(e.target as Element, to, play)
    }
    el.addEventListener('focusin', onFocus)
    el.addEventListener('keydown', onKey)
    return () => {
      el.removeEventListener('focusin', onFocus)
      el.removeEventListener('keydown', onKey)
    }
  }, [ref, play, ready])
}

/**
 * The TV's focus on a library control (tv.md › Focus appearance): the ring and the scale come from
 * the TV rule; the soft drop shadow under the ring is the TV's own.
 */
export const tvFocus = 'focus-visible:shadow-(--tv-focus-shadow)'

/** A chip as a D-pad stop: the library's Chip has no focus scale of its own, so the TV adds it. */
export const tvChip =
  'focus-visible:scale-(--scale-button) focus-visible:shadow-(--tv-focus-shadow)'

/**
 * The library's Button at the TV rule (controls.md), as a D-pad stop: primary for the view's main
 * action, overlay for the rest (tv.md › Hero buttons). Size, corner and colours are the library's.
 */
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
  const variant = primary ? 'primary' : 'overlay'
  // a disabled button can't take focus, so it isn't a D-pad stop (or a focus guide's target)
  const focus = props.disabled
    ? {}
    : { 'data-focusable': '', ...(initial ? { 'data-initial': '' } : {}) }
  return href ? (
    <Button
      asChild
      variant={variant}
      icon={icon}
      className={cn(tvFocus, className)}
      {...focus}
      {...props}
    >
      <a href={href}>{children}</a>
    </Button>
  ) : (
    <Button variant={variant} icon={icon} className={cn(tvFocus, className)} {...focus} {...props}>
      {children}
    </Button>
  )
}

/**
 * A key on an on-screen keyboard (sign-in, search) or the PIN pad: a grid cell that fills with
 * `text` on focus. Its button carries `data-item`: a key, not a control in a row (controls.md).
 */
export const tvKey =
  'grid h-[3cqw] place-items-center rounded-[0.4cqw] bg-text/10 font-semibold text-(length:--tv-text-button) outline-none transition-lift focus-visible:scale-(--scale-button) focus-visible:bg-text focus-visible:text-bg'

/**
 * The server's mark and name; "Connected remotely" under it when that's how. The head's left end,
 * and on a full-screen message the screen's top left.
 */
export function ServerIdentity({ className }: { className?: string }) {
  const server = useServer()
  const connection = useConnection()
  return (
    <div className={cn('flex h-[3cqw] items-center gap-[0.8cqw]', className)}>
      <Mark size={32} className="size-[2cqw]" />
      <span className="grid">
        <span className="font-semibold text-(length:--tv-text-server-name) leading-[1.15]">
          {server.data?.name ?? 'this server'}
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

/**
 * A poster or a wide tile with its title and a caption under the art (the year, or the time left
 * on a wide tile). The art lifts on focus; the text stays put, clear of it.
 */
export function TvPoster({
  item,
  href,
  wide = false,
  resume = false,
}: {
  item: ClientItem
  href: string
  wide?: boolean
  /** Continue watching: the time left for a caption, and the bar between the art and the title. */
  resume?: boolean
}) {
  // the card's rules are every client's (client/media-card.tsx): progress on Continue watching only
  const card = mediaCard(item, { wide, resume })
  return (
    <TvTile
      title={card.title}
      caption={card.caption}
      src={card.src}
      href={href}
      wide={card.aspect === 'still'}
      progress={card.progress}
      progressBelow={card.progressBelow}
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
  square = false,
  progress = null,
  progressBelow = false,
  status,
}: {
  title: string
  caption: string
  src: string
  href: string
  wide?: boolean
  /** An album's cover. */
  square?: boolean
  progress?: number | null
  progressBelow?: boolean
  /** A count or mark on the art (a show's unwatched episodes), as Poster draws it. */
  status?: ReactNode
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
        aspect={square ? 'square' : wide ? 'still' : 'poster'}
        progress={progress !== null ? progress * 100 : undefined}
        progressBelow={progressBelow}
        status={status}
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

/** A tile while its screen loads, laid out as `TvTile`: the art, then its title and caption. */
export function TvTileSkeleton({
  wide = false,
  square = false,
  round = false,
  resume = false,
}: {
  wide?: boolean
  square?: boolean
  /** An artist's round photo, its lines centred under it. */
  round?: boolean
  resume?: boolean
}) {
  return (
    <div aria-hidden>
      <Skeleton
        className={cn(
          round ? 'rounded-full' : 'rounded-(--tv-radius-poster)',
          square || round ? 'aspect-square' : wide ? 'aspect-still' : 'aspect-poster',
        )}
      />
      {resume && <Skeleton className="mt-3.5 h-1 rounded-full" />}
      <div
        className={cn('mt-[1cqw] grid gap-[0.5cqw] py-[0.2cqw]', round && 'justify-items-center')}
      >
        <Skeleton className="h-[1.05cqw] w-4/5" />
        <Skeleton className="h-[0.95cqw] w-2/5" />
      </div>
    </div>
  )
}

/** A row of tiles while its screen loads: its title, then `count` tiles of `width`. */
export function TvRowSkeleton({
  width,
  count,
  wide,
  resume,
}: {
  width: string
  count: number
  wide?: boolean
  resume?: boolean
}) {
  return (
    // positioned, so a screen's backdrop layer stays under it as it does under TvRow's
    <div aria-hidden className="relative grid grid-cols-1 gap-[0.8cqw]">
      <div className="px-(--tv-safe-x) py-[0.2cqw]">
        <Skeleton className="h-[1.2cqw] w-[14cqw]" />
      </div>
      <div className="flex gap-(--tv-poster-gap) overflow-hidden px-(--tv-safe-x) py-[1cqw]">
        {Array.from({ length: count }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
          <div key={i} className={cn('shrink-0', width)}>
            <TvTileSkeleton wide={wide} resume={resume} />
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * A titled row that scrolls sideways by transform to keep focus in its first slot, lined up with
 * the title, until the row's end comes into view (the owner, 2026-10-30; tv.md#scrolling). The
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
          data-keep="start"
          className="flex w-max gap-(--tv-poster-gap) px-(--tv-safe-x) py-[1cqw] transition-lift"
        >
          {children}
        </ul>
      </div>
    </section>
  )
}

const destinations: { path: string; label: string; icon: IconName }[] = [
  // Search first, as its icon alone (the owner, 2026-10-30)
  { path: '/search', label: 'Search', icon: 'search' },
  { path: '/', label: 'Home', icon: 'home' },
  // a destination per kind of media, Collections first since one can hold several kinds of the
  // same family, video or audio (the owner, 2026-10-30); the admin keeps them in one Library
  { path: '/collections', label: 'Collections', icon: 'library' },
  { path: '/movies', label: 'Movies', icon: 'movie' },
  { path: '/shows', label: 'Shows', icon: 'series' },
  { path: '/music', label: 'Music', icon: 'music' },
  // Settings isn't a destination: it's reached through the profile, the avatar at the head's
  // right (the owner, 2026-10-30)
]

/** Where Home lifts a row's title to when focus moves below the hero: the top safe area. */
export const pageTop = tv.safe.y

/**
 * The head, on every screen but the player: the server's mark at the left, the global navigation
 * centred, and the account at the right, all on one line. It's the first thing in the page's flow
 * and scrolls away with it (the owner, 2026-10-30), so nothing ever passes under it; the floating
 * bar and its alternatives (a pill, a fade, a band, a bar that slid away) are gone. Focus moves Up
 * into it from the hero actions or a screen's top row (a focus guide); it's isolated, so focus
 * enters it only that way, starting on the page's own destination, and Down returns to `down`.
 * A screen whose content is inset passes no `className`; one that runs to the edges insets it.
 */
export function TvHead({
  down = 'hero',
  exact = false,
  className,
}: {
  down?: string
  /**
   * Down always goes to `down`'s initial stop, or its first. Without it the navigator takes what's nearest under
   * the tabs, which on a page with its actions at the left is a row's tile (an album, an artist).
   */
  exact?: boolean
  className?: string
}) {
  const [location] = useLocation()
  const nav = useRef<HTMLElement>(null)
  const play = useSound()
  // on the head itself, so it runs before the navigator on the TV's root
  useEffect(() => {
    const el = nav.current
    if (!el || !exact) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowDown' || e.defaultPrevented) return
      const group = `[data-group="${CSS.escape(down)}"]`
      // the group's initial stop when it has one (Play among Previous and Next), else its first
      const to =
        document.querySelector<HTMLElement>(`${group} [data-focusable][data-initial]`) ??
        document.querySelector<HTMLElement>(`${group} [data-focusable], ${group}[data-focusable]`)
      if (!to) return
      e.preventDefault()
      focusFrom(e.target as Element, to, play)
    }
    el.addEventListener('keydown', onKey)
    return () => el.removeEventListener('keydown', onKey)
  }, [exact, down, play])
  const active = (path: string) => (path === '/' ? location === '/' : location.startsWith(path))
  return (
    <nav
      ref={nav}
      aria-label="Main"
      data-group="nav"
      data-isolate=""
      data-go-down={down}
      onFocus={(e) => {
        // arriving from the page, start on the page's own destination, as Menu does, rather than
        // wherever the navigator would land (Search, at the bar's left)
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
        const current = e.currentTarget.querySelector<HTMLElement>('[aria-current="page"]')
        if (current && current !== e.target) current.focus({ preventScroll: true })
      }}
      className={cn(
        'relative grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center pt-(--tv-safe-y)',
        className,
      )}
    >
      <ServerIdentity />
      {/* no background of its own (the owner, 2026-10-30): the tabs stand on the page */}
      <div className="flex h-[3cqw] items-center gap-[0.6cqw]">
        {destinations.map((d) => {
          const icon = d.path === '/search'
          return (
            <a
              key={d.path}
              href={tvHref(d.path)}
              data-focusable=""
              aria-label={icon ? d.label : undefined}
              aria-current={active(d.path) ? 'page' : undefined}
              className={cn(
                'flex h-[2.6cqw] items-center justify-center rounded-full font-semibold text-(length:--tv-text-button) text-text/65 outline-none transition-lift focus-visible:scale-(--scale-button) focus-visible:bg-text focus-visible:text-bg not-focus-visible:aria-[current=page]:text-text',
                icon ? 'w-[2.6cqw]' : 'px-[1.4cqw]',
              )}
            >
              {icon ? <Icon name="search" size={24} className="size-[1.4cqw]" /> : d.label}
            </a>
          )
        })}
      </div>
      <div className="flex items-center gap-[0.6cqw] justify-self-end">
        <NowPlayingTab current={active('/now-playing')} />
        <Alerts current={active('/alerts')} />
        <Account current={active('/settings')} />
      </div>
    </nav>
  )
}

/** A person's circle: their initial on their colour, sized by the caller's width. */
export function TvAvatar({
  person,
  className,
  style,
}: {
  person: Profile
  className?: string
  style?: CSSProperties
}) {
  return (
    <span
      aria-hidden
      style={style}
      className={cn(
        'grid aspect-square place-items-center rounded-full font-semibold text-[length:inherit] [container-type:inline-size]',
        toneClass[person.tone],
        className,
      )}
    >
      <span className="text-[45cqw] leading-none">{person.name.charAt(0)}</span>
    </span>
  )
}

/**
 * The avatar of whoever is watching, at the head's right: it opens their profile, with the people
 * on this TV, switching between them, and the TV's Settings (the owner, 2026-10-30).
 */
/**
 * Alerts, just left of the avatar (the owner, 2026-10-30): a bell, with a dot while any
 * announcement is new, opening every live one (tv/alerts.tsx).
 */
function Alerts({ current }: { current: boolean }) {
  const a = useAnnouncements('tv')
  const count = a.unread.length
  return (
    <a
      href={tvHref('/alerts')}
      data-focusable=""
      aria-label={count ? `Alerts, ${count} new` : 'Alerts'}
      aria-current={current ? 'page' : undefined}
      className="relative grid size-[2.6cqw] place-items-center rounded-full text-text/65 outline-none transition-lift focus-visible:scale-(--scale-button) focus-visible:bg-text focus-visible:text-bg not-focus-visible:aria-[current=page]:text-text"
    >
      <Icon name="notification" size={24} className="size-[1.4cqw]" />
      {count > 0 && (
        <span className="absolute end-[0.45cqw] top-[0.45cqw] size-[0.6cqw] rounded-full bg-accent" />
      )}
    </a>
  )
}

function Account({ current }: { current: boolean }) {
  const { me } = usePeople()
  return (
    <a
      href={tvHref('/settings')}
      data-focusable=""
      aria-label={`${me.name}: profile and settings`}
      aria-current={current ? 'page' : undefined}
      className="group/account grid size-[3cqw] place-items-center rounded-full outline-none transition-lift focus-visible:scale-(--scale-button) focus-visible:bg-text"
    >
      <TvAvatar person={me} className="w-[2.2cqw]" />
    </a>
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

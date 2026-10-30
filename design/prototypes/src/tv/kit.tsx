// SPDX-License-Identifier: AGPL-3.0-only
// Pieces every TV screen shares (tv.md): addresses, focus on arrival, buttons in screen units,
// posters with their titles, rows that scroll by focus, the server identity, the announcement
// pill, and the global navigation, a top tab row on every screen but the player
// (client-home.md#tv), with the alternatives the owner asked to compare.
import { cn, Icon, type IconName, Mark, Poster } from '@highsea-tv/ui-web'
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'wouter'
import { clientHref, left, useAnnouncements, useConnection, useServer } from '../client/data.ts'
import type { ClientItem } from '../mock/types.ts'
import type { TvNav } from '../proto/state.ts'
import { useProto } from '../screen/screen.tsx'

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
export function ServerIdentity({ always = false }: { always?: boolean }) {
  const server = useServer()
  const connection = useConnection()
  // with the left rail, the server's mark heads the rail instead; `always` keeps it on a screen
  // without the rail (Unreachable)
  const rail = useTvNav() === 'rail'
  if (rail && !always) return null
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
  resume = false,
}: {
  item: ClientItem
  href: string
  wide?: boolean
  /** Continue watching: the time left for a caption, and the bar between the art and the title. */
  resume?: boolean
}) {
  return (
    <TvTile
      title={item.title}
      caption={resume && item.progress !== null ? left(item) : String(item.year)}
      src={wide ? item.art.still : item.art.poster}
      href={href}
      wide={wide}
      // on Home only Continue watching shows how far you got
      progress={resume || !wide ? item.progress : null}
      progressBelow={resume}
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
  progressBelow = false,
}: {
  title: string
  caption: string
  src: string
  href: string
  wide?: boolean
  progress?: number | null
  progressBelow?: boolean
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
        progressBelow={progressBelow}
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

const destinations: { path: string; label: string; icon: IconName }[] = [
  { path: '/', label: 'Home', icon: 'home' },
  { path: '/search', label: 'Search', icon: 'search' },
  { path: '/library', label: 'Library', icon: 'library' },
  { path: '/settings', label: 'Settings', icon: 'settings' },
]

/** Which global navigation the prototype shows (the toolbar's TV nav; the owner, 2026-10-30). */
export const useTvNav = () => useProto().tvNav

/**
 * The left rail's spacing, in screen units (the owner, 2026-10-30): its icons sit `railGap` from
 * the screen's edge and the page `railGap` from the icons, so the page's inset is the sum.
 */
export const railGap = 3
const railIcon = 1.4
const railPad = 0.8
export const railInset = railGap * 2 + railIcon

/**
 * What the app hands the rail: the slot it's drawn into, outside the page so the page can move
 * aside for it; `push`, which moves the page right by that many pixels while the rail is open; and
 * `leave`, which puts focus back where it was in the page.
 */
export type RailHost = {
  slot: HTMLElement | null
  push: (px: number) => void
  leave: (fallback: string) => void
}
export const RailContext = createContext<RailHost | null>(null)

/**
 * Where Home lifts a row's title to when focus moves below the hero: under the top safe area, or
 * under the band when the band holds the navigation.
 */
/**
 * For a screen's full-screen backdrop: while the rail pushes the page right, it moves back left by
 * as much, so it stays still on the screen and only the content moves. Both are translations with
 * the same timing, so they cancel on every frame (a layout property such as left runs a frame
 * apart from the page's composited transform, and the backdrop showed through as it caught up).
 */
export const backdropReach =
  '-translate-x-(--tv-shift) transition-[translate] duration-300 ease-out motion-reduce:transition-none'

export const pageTop = (nav: TvNav) => (nav === 'band' ? 7.6 : 3.2)

/**
 * The global navigation, on every screen but the player. The owner had it always shown on
 * 2026-10-30 (it was hidden until focus moved Up), then asked for alternatives to compare once the
 * rows were seen scrolling under it:
 * - `pill`: a tab row floating at the top, as built;
 * - `scrim`: the same over a fade from the background, so it stays readable over posters;
 * - `band`: a solid strip of the background holding the tabs and the server's name, with the
 *   page's rows scrolling under it, so nothing focusable is ever covered;
 * - `rail`: icons down the left edge that open with their labels when focus moves Left into them,
 *   pushing the page aside (Max, Hulu, Disney+, Plex, and tvOS 18's sidebar); the owner chose it
 *   on 2026-10-30, since it's reachable from anywhere, however far a page has scrolled;
 * - `scroll`: Apple's tab bar (HIG, Tab bars): shown at the top of a page, sliding away once focus
 *   goes below the page's first group, and back with Up or Back.
 * Focus moves Up into it from the hero actions or a screen's top row (a focus guide), or Left into
 * the rail; it's isolated, so focus enters it only that way, and Down (Right from the rail)
 * returns to `down`. `lifted` says Home has moved past its hero.
 */
export function GlobalNav({ down = 'hero', lifted }: { down?: string; lifted?: boolean }) {
  const [location] = useLocation()
  const nav = useTvNav()
  const away = useAway(nav === 'scroll', down, lifted)
  const active = (path: string) => (path === '/' ? location === '/' : location.startsWith(path))
  if (nav === 'rail') return <Rail down={down} />
  return (
    <nav
      aria-label="Main"
      data-group="nav"
      data-isolate=""
      data-go-down={down}
      className={cn(
        'group/nav absolute inset-x-0 top-0 z-20 flex justify-center pt-(--tv-safe-y) transition-[translate,opacity] duration-300',
        away && '-translate-y-full opacity-0',
      )}
    >
      {nav === 'scrim' && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[11cqw] bg-[linear-gradient(var(--color-bg)_25%,transparent)]"
        />
      )}
      {nav === 'band' && (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-[8.6cqw] bg-[linear-gradient(var(--color-bg)_80%,transparent)]"
          />
          {/* the band covers the page's own top, so it carries what sits there */}
          <ServerIdentity />
          {location === '/' && <AnnouncementPill />}
        </>
      )}
      <div className="relative flex gap-[0.6cqw] rounded-full bg-s2/85 p-[0.4cqw] backdrop-blur-pill">
        {destinations.map((d) => (
          <a
            key={d.path}
            href={tvHref(d.path)}
            data-focusable=""
            aria-current={active(d.path) ? 'page' : undefined}
            className="rounded-full px-[1.4cqw] py-[0.5cqw] font-semibold text-(length:--tv-text-button) text-text-2 outline-none transition-lift focus-visible:scale-(--scale-button) focus-visible:bg-text focus-visible:text-bg not-focus-visible:aria-[current=page]:text-text"
          >
            {d.label}
          </a>
        ))}
      </div>
    </nav>
  )
}

/**
 * The left rail: a transparent column the screen's height, with the destinations' icons centred
 * in it. Left from any screen's edge focuses it, and it opens with its labels, pushing the page
 * right to make room rather than covering it; Right, or leaving it, closes it and returns focus to
 * where it was in the page (or to `down`). Up and Down stay inside it.
 */
function Rail({ down }: { down: string }) {
  const host = useContext(RailContext)
  const [location] = useLocation()
  const [open, setOpen] = useState(false)
  const list = useRef<HTMLDivElement>(null)
  const active = (path: string) => (path === '/' ? location === '/' : location.startsWith(path))
  useLayoutEffect(() => {
    const el = list.current
    const root = el?.closest<HTMLElement>('[data-platform="tv"]')
    if (!host || !el || !root) return
    const unit = root.clientWidth / 100
    // open, the page starts as far from the widest label as it does from the icons when closed
    const right = el.getBoundingClientRect().right - root.getBoundingClientRect().left
    host.push(open ? right + (railGap - railPad) * unit - railInset * unit : 0)
  }, [open, host])
  useEffect(() => () => host?.push(0), [host])
  if (!host?.slot) return null
  const items = () => [...(list.current?.querySelectorAll<HTMLElement>('[data-focusable]') ?? [])]
  return createPortal(
    <nav
      aria-label="Main"
      data-group="rail"
      data-isolate=""
      data-go-left=""
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false)
      }}
      onKeyDown={(e) => {
        const all = items()
        const at = all.indexOf(document.activeElement as HTMLElement)
        if (e.key === 'ArrowRight') host.leave(down)
        else if (e.key === 'ArrowUp') all[at - 1]?.focus()
        else if (e.key === 'ArrowDown') all[at + 1]?.focus()
        else return
        e.preventDefault()
      }}
      className="absolute inset-y-0 left-0 z-20 flex"
    >
      {/* the server's mark at the top, the destinations in the middle, the account at the foot */}
      <div
        ref={list}
        className="grid grid-rows-[auto_1fr_auto] items-center gap-[0.5cqw] py-(--tv-safe-y)"
        style={{ marginLeft: `${railGap - railPad}cqw` }}
      >
        <RailServer open={open} />
        <div className="grid gap-[0.5cqw]">
          {destinations.map((d) => (
            <a
              key={d.path}
              href={tvHref(d.path)}
              data-focusable=""
              aria-label={d.label}
              aria-current={active(d.path) ? 'page' : undefined}
              style={{ padding: `${railPad}cqw` }}
              className="flex items-center gap-[0.9cqw] rounded-full font-semibold text-(length:--tv-text-button) text-text-3 outline-none transition-lift focus-visible:scale-(--scale-button) focus-visible:bg-text focus-visible:text-bg not-focus-visible:aria-[current=page]:text-text"
            >
              <Icon name={d.icon} size={24} className="size-[1.4cqw] shrink-0" />
              {open && <span className="pe-[0.8cqw]">{d.label}</span>}
            </a>
          ))}
        </div>
        <RailAccount open={open} />
      </div>
    </nav>,
    host.slot,
  )
}

/**
 * Round art in the rail (the mark, the avatar): 2.2cqw, the icon and its padding less 0.4cqw a
 * side, so it sits in the icons' column and reads larger than an icon.
 */
const railArtPad = '0.4cqw'

/** The rail's head: the server's mark, with its name (and Connected remotely) while open. */
function RailServer({ open }: { open: boolean }) {
  const server = useServer()
  const connection = useConnection()
  return (
    <div style={{ padding: railArtPad }} className="flex items-center gap-[0.9cqw] self-start">
      <Mark size={32} className="size-[2.2cqw] shrink-0" />
      {open && (
        <span className="grid pe-[0.8cqw]">
          <span className="whitespace-nowrap font-semibold text-(length:--tv-text-button) leading-[1.15]">
            {server.data?.name ?? 'Harbor'}
          </span>
          {connection === 'remote' && (
            <span className="whitespace-nowrap text-(length:--tv-text-pill) text-text-2 leading-[1.15]">
              Connected remotely
            </span>
          )}
        </span>
      )}
    </div>
  )
}

/**
 * The rail's foot: the signed-in person's avatar, the last stop Down reaches. It will open
 * switching accounts and signing out; for now it's only a focus stop.
 */
function RailAccount({ open }: { open: boolean }) {
  return (
    <button
      type="button"
      data-focusable=""
      aria-label="Ines: switch account or sign out"
      style={{ padding: railArtPad }}
      className="group/account flex items-center gap-[0.9cqw] self-end rounded-full font-semibold text-(length:--tv-text-button) text-text-3 outline-none transition-lift focus-visible:scale-(--scale-button) focus-visible:bg-text focus-visible:text-bg"
    >
      {/* on the focused pill the circle turns dark, so the initial still reads */}
      <span className="grid size-[2.2cqw] shrink-0 place-items-center rounded-full bg-accent-soft text-(length:--tv-text-pill) text-accent-text group-focus-visible/account:bg-bg group-focus-visible/account:text-text">
        I
      </span>
      {open && <span className="pe-[0.8cqw]">Ines</span>}
    </button>
  )
}

/**
 * For the bar that scrolls away: away once focus is below the page's first group (`down`), or,
 * on Home, once the page has lifted past its hero.
 */
function useAway(enabled: boolean, top: string, lifted: boolean | undefined) {
  const [below, setBelow] = useState(false)
  useEffect(() => {
    if (!enabled || lifted !== undefined) return
    const onFocus = (e: FocusEvent) => {
      const el = e.target as HTMLElement
      setBelow(
        !el.closest('[data-group="nav"]') && !el.closest(`[data-group="${CSS.escape(top)}"]`),
      )
    }
    document.addEventListener('focusin', onFocus)
    return () => document.removeEventListener('focusin', onFocus)
  }, [enabled, top, lifted])
  return enabled && (lifted ?? below)
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

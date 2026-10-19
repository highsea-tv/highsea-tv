// SPDX-License-Identifier: AGPL-3.0-only
// C2 Home, TV (docs/product/client-home.md#tv): the locked Hero + rows layout (tv.md#layout).
// The hero follows focus through the featured row after a 220 ms dwell and cross-fades; the rows
// below it don't bind it: focus there lifts the page past the hero. Up from the featured row goes
// to the hero actions, and Up from those opens the global navigation. Rows remember their spot.
// An announcement that must be acknowledged comes first, on its own.
import { durations } from '@highsea/tokens'
import { Icon, QualityTag, springBase, useDwell } from '@highsea/ui-web'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { left, meta, qualityTags, useAnnouncements, useHome } from '../client/data.ts'
import { Inline } from '../kit/inline.tsx'
import type { ClientItem, HomeSection } from '../mock/types.ts'
import {
  AnnouncementPill,
  GlobalNav,
  ServerIdentity,
  TvButton,
  TvMessage,
  TvPoster,
  TvRow,
  tvHref,
  useInitialFocus,
} from './kit.tsx'

function HeroCopy({ item, eyebrow }: { item: ClientItem; eyebrow: string }) {
  return (
    <motion.div
      key={item.id}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0, transition: springBase }}
      exit={{
        opacity: 0,
        y: 4,
        transition: { duration: durations.fadeOut / 1000, ease: 'linear' },
      }}
      className="grid gap-[0.8cqw]"
    >
      <p className="font-semibold text-(length:--tv-text-eyebrow) text-accent-text uppercase tracking-eyebrow">
        {eyebrow}
      </p>
      <h1 className="font-semibold text-(length:--tv-text-hero-title) leading-[0.95] tracking-display">
        {item.title}
      </h1>
      <p className="flex items-center gap-[1cqw] text-(length:--tv-text-meta) text-text-2">
        {meta(item)}
        {item.progress !== null && <span>· {left(item)}</span>}
        {qualityTags(item).map((q) => (
          <QualityTag key={q} overlay className="text-(length:--tv-text-quality)">
            {q}
          </QualityTag>
        ))}
      </p>
      <p className="line-clamp-2 max-w-[34cqw] text-(length:--tv-text-synopsis) text-text-2 leading-[1.45]">
        {item.tagline ?? item.synopsis}
      </p>
    </motion.div>
  )
}

function Backdrop({ src }: { src: string }) {
  // two layers, cross-fading: the new one loads behind, then comes forward
  const [layers, setLayers] = useState({ a: src, b: '', front: 'a' as 'a' | 'b' })
  useEffect(() => {
    setLayers((l) =>
      l[l.front] === src
        ? l
        : { ...l, [l.front === 'a' ? 'b' : 'a']: src, front: l.front === 'a' ? 'b' : 'a' },
    )
  }, [src])
  // 62% of the 16:9 screen (56.25u tall)
  return (
    <>
      {(['a', 'b'] as const).map((k) =>
        layers[k] ? (
          <img
            key={k}
            src={layers[k]}
            alt=""
            className={`absolute inset-x-0 top-0 h-[34.9cqw] w-full object-cover transition-opacity duration-700 ${layers.front === k ? 'opacity-100' : 'opacity-0'}`}
          />
        ) : null,
      )}
      <div className="absolute inset-x-0 top-0 h-[34.9cqw] bg-[linear-gradient(90deg,var(--color-bg)_8%,transparent_60%),linear-gradient(0deg,var(--color-bg),transparent_45%)]" />
    </>
  )
}

function Row({
  section,
  featured,
  onFocusItem,
}: {
  section: HomeSection
  featured: boolean
  onFocusItem: (m: ClientItem) => void
}) {
  const wide = section.layout === 'continue'
  return (
    <TvRow
      group={section.id}
      title={section.title}
      suffix={section.suffix}
      goUp={featured ? 'hero' : undefined}
    >
      {section.items.map((m) => (
        <li
          key={m.id}
          className={wide ? 'w-[17cqw] shrink-0' : 'w-(--tv-poster-width) shrink-0'}
          // only the featured titles bind the hero
          onFocus={featured ? () => onFocusItem(m) : undefined}
        >
          <TvPoster
            item={m}
            wide={wide}
            href={tvHref(wide ? `/play/${m.id}` : `/movies/${m.id}`)}
          />
        </li>
      ))}
    </TvRow>
  )
}

/**
 * The page moves as one: while focus is on the hero or the featured row it rests at the top; on
 * any row below, it lifts so that row's title sits at the safe area's top, with the next row under
 * it, and the hero goes out of view.
 */
function usePageOffset() {
  const page = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const [offset, setOffset] = useState(0)
  useEffect(() => {
    const el = page.current
    const reveal = (target: EventTarget | null) => {
      const row = (target as HTMLElement | null)?.closest<HTMLElement>('[data-row]')
      if (!el?.parentElement) return
      if (!row || row.dataset.row === '0') return setOffset(0)
      // layout positions: both boxes carry the same transform
      const top = row.getBoundingClientRect().top - el.getBoundingClientRect().top
      const safe = (el.clientWidth / 100) * 3.2
      const max = el.scrollHeight - el.parentElement.clientHeight
      setOffset(Math.max(0, Math.min(top - safe, max)))
    }
    const onFocus = (e: FocusEvent) => reveal(e.target)
    // a curation preview (A11) asks for the section being edited, without moving focus
    const onReveal = (e: Event) => reveal((e as CustomEvent<HTMLElement>).detail)
    el?.addEventListener('focusin', onFocus)
    window.addEventListener('highsea:reveal', onReveal)
    return () => {
      el?.removeEventListener('focusin', onFocus)
      window.removeEventListener('highsea:reveal', onReveal)
    }
  }, [])
  const style = { transform: `translateY(${-offset}px)`, transition: reduced ? 'none' : undefined }
  return { page, style, lifted: offset > 0 }
}

function Home({ sections }: { sections: HomeSection[] }) {
  const hero = sections.find((s) => s.layout === 'hero')
  const first = hero?.items[0] ?? sections[0]?.items[0]
  const [focused, setFocused] = useState<ClientItem | undefined>(first)
  const shown = useDwell(focused) ?? first
  const { page, style, lifted } = usePageOffset()
  useInitialFocus(true)
  // the hero's own titles lead the rows, so focus can reach every featured title
  const rows: HomeSection[] = sections.map((s) =>
    s.layout === 'hero' ? { ...s, layout: 'row' } : s,
  )
  if (!shown) return null
  return (
    <>
      <GlobalNav />
      {/* lifted, the row above fades out under the top edge rather than being cut */}
      <div
        className={`absolute inset-0 overflow-hidden ${lifted ? '[mask-image:linear-gradient(transparent,black_3.2cqw)]' : ''}`}
      >
        <div ref={page} style={style} className="relative transition-lift">
          <Backdrop src={shown.art.backdrop} />
          <ServerIdentity />
          <AnnouncementPill />
          <div className="absolute top-[7.5cqw] left-(--tv-safe-x) grid max-w-[38cqw] gap-[1.6cqw]">
            <AnimatePresence mode="wait">
              <HeroCopy item={shown} eyebrow={hero?.title ?? 'On Harbor'} />
            </AnimatePresence>
            {/* Play acts on what the hero shows (tv.md#hero-behavior) */}
            <div data-group="hero" data-go-up="nav" className="flex gap-[1cqw]">
              <TvButton primary initial icon="play" href={tvHref(`/play/${shown.id}`)}>
                {shown.progress !== null ? 'Resume' : 'Play'}
              </TvButton>
              <TvButton icon="info" href={tvHref(`/movies/${shown.id}`)}>
                Details
              </TvButton>
            </div>
          </div>
          {/* the rows start about half way down, so the next row's title shows under the featured
          one; positioned, so they paint over the backdrop */}
          <div
            data-rows=""
            className="relative grid grid-cols-1 gap-[1.6cqw] pt-[28.5cqw] pb-(--tv-safe-y)"
          >
            {rows.map((s, i) => (
              <div key={s.id} data-row={i} data-section={s.id} className="grid grid-cols-1">
                <Row section={s} featured={s.id === hero?.id} onFocusItem={setFocused} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

function AcknowledgeScreen() {
  const a = useAnnouncements('tv')
  const m = a.modal
  useInitialFocus(!!m, m?.id)
  if (!m) return null
  return (
    <main className="grid h-full place-items-center bg-bg">
      <div className="grid max-w-[44cqw] gap-[1.4cqw] overflow-hidden rounded-[1cqw] bg-s1 p-[2.4cqw]">
        {m.image && (
          // the TV can't follow a link, so a call to action stays on the other apps
          <img
            src={m.image}
            alt=""
            className="-mx-[2.4cqw] -mt-[2.4cqw] mb-[0.4cqw] aspect-[21/9] w-[calc(100%+4.8cqw)] max-w-none object-cover"
          />
        )}
        <p className="flex items-center gap-[0.6cqw] font-semibold text-(length:--tv-text-eyebrow) text-accent-text uppercase tracking-eyebrow">
          <Icon name="announcement" size={24} className="size-[1.1cqw]" />
          From the server’s owner
        </p>
        <h1 className="font-semibold text-[2.4cqw] leading-[1.15]">{m.title}</h1>
        <p className="text-(length:--tv-text-synopsis) text-text-2 leading-[1.45]">
          <Inline text={m.body} />
        </p>
        <div data-group="ack" className="flex">
          <TvButton primary initial onClick={() => a.dismiss(m.id)}>
            Got it
          </TvButton>
        </div>
      </div>
    </main>
  )
}

export function TvHome() {
  const home = useHome('tv')
  const a = useAnnouncements('tv')
  if (a.modal) return <AcknowledgeScreen />
  if (home.status === 'loading')
    return (
      <main aria-busy className="grid h-full place-items-center">
        <Icon name="loading" size={48} className="size-[3cqw] animate-spin text-text-3" />
      </main>
    )
  if (home.status === 'error')
    return (
      <TvMessage
        title="Couldn’t load the home screen"
        actions={
          <TvButton primary initial onClick={home.refetch}>
            Try again
          </TvButton>
        }
      >
        {home.error.message}
      </TvMessage>
    )
  if (home.data.length === 0)
    return (
      <>
        <ServerIdentity />
        <TvMessage
          title="Nothing to watch yet"
          actions={
            <TvButton initial icon="library" href={tvHref('/library')}>
              Library
            </TvButton>
          }
        >
          When the server’s owner adds movies, they show up here.
        </TvMessage>
      </>
    )
  return <Home sections={home.data} />
}

// SPDX-License-Identifier: AGPL-3.0-only
// C2 Home, TV (docs/product/client-home.md#tv): the locked Hero + rows layout (tv.md#layout).
// The hero follows focus after a 220 ms dwell and cross-fades; Up from any row goes to the hero
// actions, and Up from those opens the global navigation. Rows remember where you left them.
// An announcement that must be acknowledged comes first, on its own.
import { durations } from '@highsea/tokens'
import { Icon, Poster, QualityTag, springBase, useDwell } from '@highsea/ui-web'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { left, meta, qualityTags, useAnnouncements, useHome } from '../client/data.ts'
import { Inline } from '../kit/inline.tsx'
import type { ClientItem, HomeSection } from '../mock/types.ts'
import {
  AnnouncementPill,
  GlobalNav,
  ServerIdentity,
  TvButton,
  TvMessage,
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
      <p className="line-clamp-3 max-w-[34cqw] text-(length:--tv-text-synopsis) text-text-2 leading-[1.45]">
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
  return (
    <>
      {(['a', 'b'] as const).map((k) =>
        layers[k] ? (
          <img
            key={k}
            src={layers[k]}
            alt=""
            className={`absolute inset-x-0 top-0 h-[62%] w-full object-cover transition-opacity duration-700 ${layers.front === k ? 'opacity-100' : 'opacity-0'}`}
          />
        ) : null,
      )}
      <div className="absolute inset-x-0 top-0 h-[62%] bg-[linear-gradient(90deg,var(--color-bg)_8%,transparent_60%),linear-gradient(0deg,var(--color-bg),transparent_45%)]" />
    </>
  )
}

function Row({
  section,
  onFocusItem,
}: {
  section: HomeSection
  onFocusItem: (m: ClientItem) => void
}) {
  const wide = section.layout === 'continue'
  return (
    <section
      data-group={section.id}
      data-go-up="hero"
      aria-label={section.title}
      className="grid gap-[0.8cqw]"
    >
      <h2 className="pl-(--tv-safe-x) font-semibold text-(length:--tv-text-row-title)">
        {section.title}
        {section.suffix && <span className="font-normal text-text-2"> {section.suffix}</span>}
      </h2>
      <div className="overflow-visible">
        <ul
          data-scroll="x"
          data-keep="0.3"
          className="flex gap-(--tv-poster-gap) px-(--tv-safe-x) py-[1cqw] transition-lift"
        >
          {section.items.map((m) => (
            <li
              key={m.id}
              className={wide ? 'w-[17cqw] shrink-0' : 'w-(--tv-poster-width) shrink-0'}
              onFocus={() => onFocusItem(m)}
            >
              <Poster
                title={m.title}
                src={wide ? m.art.still : m.art.poster}
                aspect={wide ? 'still' : 'poster'}
                progress={m.progress !== null ? m.progress * 100 : undefined}
                href={tvHref(wide ? `/play/${m.id}` : `/movies/${m.id}`)}
                focusable
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function AcknowledgeScreen() {
  const a = useAnnouncements('tv')
  const m = a.modal
  useInitialFocus(!!m, m?.id)
  if (!m) return null
  return (
    <main className="grid h-full place-items-center bg-bg">
      <div className="grid max-w-[44cqw] gap-[1.4cqw] rounded-[1cqw] bg-s1 p-[2.4cqw]">
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

function Home({ sections }: { sections: HomeSection[] }) {
  const hero = sections.find((s) => s.layout === 'hero')
  const first = hero?.items[0] ?? sections[0]?.items[0]
  const [focused, setFocused] = useState<ClientItem | undefined>(first)
  const shown = useDwell(focused) ?? first
  useInitialFocus(true)
  // the hero's own titles lead the rows, so focus can reach every featured title
  const rows: HomeSection[] = sections.map((s) =>
    s.layout === 'hero' ? { ...s, layout: 'row' } : s,
  )
  if (!shown) return null
  return (
    <>
      <Backdrop src={shown.art.backdrop} />
      <ServerIdentity />
      <AnnouncementPill />
      <GlobalNav />
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
      <div className="absolute inset-x-0 bottom-0 h-[47%] overflow-hidden">
        <div data-scroll="y" data-keep="0.32" className="grid gap-[2cqw] transition-lift">
          {rows.map((s) => (
            <Row key={s.id} section={s} onFocusItem={setFocused} />
          ))}
        </div>
      </div>
    </>
  )
}

export function TvHome() {
  const home = useHome()
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

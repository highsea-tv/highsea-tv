// SPDX-License-Identifier: AGPL-3.0-only
// The TV home (Hero + rows) on the real spatial navigator, in screen units on a 16:9 frame.
// A preview of the focus model for Phase 2, not the finished TV client.

import { art, byId, type Title, titles } from '@highsea-tv/fixtures'
import { durations } from '@highsea-tv/tokens'
import {
  Icon,
  Mark,
  Poster,
  QualityTag,
  springBase,
  useDwell,
  useSound,
  useSpatialNavigation,
} from '@highsea-tv/ui-web'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

const meta = {
  title: 'TV/Home',
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Click the frame, then use the arrow keys. Up from a row goes to the hero actions; rows remember where you left them; the hero follows focus after a 220ms dwell. Turn sound on in the toolbar to hear navigate.',
      },
    },
  },
} satisfies Meta
export default meta

const rows: { id: string; title: string; suffix?: string; items: Title[]; wide?: boolean }[] = [
  { id: 'continue', title: 'Continue watching', items: titles.slice(3, 8), wide: true },
  { id: 'featured', title: 'Staff picks', suffix: 'by Harbor', items: titles },
  { id: 'recent', title: 'Recently added', items: titles.slice().reverse() },
]

function HeroCopy({ t }: { t: Title }) {
  return (
    <motion.div
      key={t.id}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0, transition: springBase }}
      exit={{
        opacity: 0,
        y: 4,
        transition: { duration: durations.fadeOut / 1000, ease: 'linear' },
      }}
      className="grid gap-[0.8cqw]"
    >
      <p className="font-semibold text-accent-text text-(length:--tv-text-eyebrow) uppercase tracking-eyebrow">
        Featured on Harbor
      </p>
      <h2 className="font-semibold text-(length:--tv-text-hero-title) leading-[0.95] tracking-display">
        {t.title}
      </h2>
      <p className="flex items-center gap-[1cqw] text-(length:--tv-text-meta) text-text-2">
        {t.year} · {t.runtime} · {t.genre}
        {t.quality.map((q) => (
          <QualityTag key={q} overlay className="text-(length:--tv-text-quality)">
            {q}
          </QualityTag>
        ))}
      </p>
      <p className="max-w-[34cqw] text-(length:--tv-text-synopsis) text-text-2 leading-[1.45]">
        {t.synopsis}
      </p>
    </motion.div>
  )
}

function TvHome() {
  const root = useRef<HTMLDivElement>(null)
  const play = useSound()
  const [focused, setFocused] = useState<Title>(byId('sintel'))
  const shown = useDwell(focused)
  const [layers, setLayers] = useState({ a: art(shown).backdrop, b: '', front: 'a' as 'a' | 'b' })
  useSpatialNavigation(root)

  // OK and Back sounds; the navigator plays navigate itself
  useEffect(() => {
    const el = root.current
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') play('select')
      if (e.key === 'Escape') play('back')
    }
    el?.addEventListener('keydown', onKey)
    return () => el?.removeEventListener('keydown', onKey)
  }, [play])

  // cross-fade: load the new backdrop into the back layer, then bring it forward
  useEffect(() => {
    const src = art(shown).backdrop
    setLayers((l) =>
      l[l.front] === src
        ? l
        : { ...l, [l.front === 'a' ? 'b' : 'a']: src, front: l.front === 'a' ? 'b' : 'a' },
    )
  }, [shown])

  const button =
    'flex items-center gap-[0.6cqw] rounded-(--tv-radius-button) px-[1.6cqw] py-[0.8cqw] font-semibold text-(length:--tv-text-button) transition-lift focus-visible:scale-(--scale-button) outline-none focus-visible:shadow-(--tv-focus-shadow)'

  return (
    <div
      ref={root}
      data-platform="tv"
      // a click on the frame gives it focus, so the first arrow key lands on Play (data-initial)
      tabIndex={-1}
      className="relative aspect-[16/9] w-full overflow-hidden bg-bg text-text outline-none [container-type:inline-size]"
    >
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

      <div className="absolute top-(--tv-safe-y) left-(--tv-safe-x) flex items-center gap-[0.8cqw]">
        <Mark size={32} className="size-[2cqw]" />
        <span className="font-semibold text-(length:--tv-text-server-name)">Harbor</span>
      </div>
      <div className="absolute top-(--tv-safe-y) right-(--tv-safe-x) flex items-center gap-[0.6cqw] rounded-full bg-s2/75 px-[1.2cqw] py-[0.5cqw] text-(length:--tv-text-pill) text-text-2 backdrop-blur-pill">
        <Icon name="announcement" size={24} className="size-[1.1cqw]" />
        Movie night on Friday
      </div>

      <div className="absolute top-[7.5cqw] left-(--tv-safe-x) grid max-w-[38cqw] gap-[1.6cqw]">
        <AnimatePresence mode="wait">
          <HeroCopy t={shown} />
        </AnimatePresence>
        <div data-group="hero" className="flex gap-[1cqw]">
          <button
            type="button"
            data-focusable=""
            data-initial=""
            className={`${button} bg-text text-bg`}
          >
            <Icon name="play" size={24} className="size-[1.2cqw]" /> Play
          </button>
          <button type="button" data-focusable="" className={`${button} bg-text/12 text-text`}>
            <Icon name="info" size={24} className="size-[1.2cqw]" /> Details
          </button>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 h-[47%] overflow-hidden">
        <div data-scroll="y" data-keep="0.32" className="grid gap-[2cqw] transition-lift">
          {rows.map((row) => (
            <section
              key={row.id}
              data-group={row.id}
              data-go-up="hero"
              aria-label={row.title}
              className="grid gap-[0.8cqw]"
            >
              <h3 className="pl-(--tv-safe-x) font-semibold text-(length:--tv-text-row-title)">
                {row.title}
                {row.suffix && <span className="font-normal text-text-2"> {row.suffix}</span>}
              </h3>
              <div className="overflow-visible">
                <ul
                  data-scroll="x"
                  data-keep="0.3"
                  className="flex gap-(--tv-poster-gap) px-(--tv-safe-x) py-[1cqw] transition-lift"
                >
                  {row.items.map((t) => (
                    <li
                      key={t.id}
                      className={row.wide ? 'w-[17cqw] shrink-0' : 'w-(--tv-poster-width) shrink-0'}
                      onFocus={() => setFocused(t)}
                    >
                      <Poster
                        title={t.title}
                        src={row.wide ? art(t).still : art(t).poster}
                        aspect={row.wide ? 'still' : 'poster'}
                        progress={row.wide ? 35 : undefined}
                        href={`#${t.id}`}
                        focusable
                      />
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

export const Home: StoryObj = {
  render: () => (
    <div className="grid min-h-screen place-items-center bg-[#000] p-6">
      <div className="w-full max-w-[1600px]">
        <TvHome />
      </div>
    </div>
  ),
}

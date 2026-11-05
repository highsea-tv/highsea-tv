'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// The backdrop hero: artwork cross-fading between two layers (never a blank frame) and the copy
// swap choreography: old copy fades out 140ms moving down 4px, new copy enters from −6px with
// spring.base (motion.md#choreography). Bind it to a dwelled value (`useDwell`) on TV.
import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useEffect, useState } from 'react'
import { cn } from '../lib/cn.ts'
import { fadeOut, springBase } from '../lib/motion.ts'

export type HeroItem = {
  id: string
  title: ReactNode
  /** Backdrop artwork, 16:9, cropped to fill. Decorative. */
  backdrop?: string
  /** A short kicker above the title ("New · Featured"). */
  eyebrow?: ReactNode
  /** Year, runtime, genre, quality tags. */
  meta?: ReactNode
  synopsis?: ReactNode
}

export type BackdropHeroProps = {
  item: HeroItem
  /** Play, Details. One primary action. */
  actions?: ReactNode
  className?: string
}

type Layers = { a?: string; b?: string; front: 'a' | 'b' }

export function BackdropHero({ item, actions, className }: BackdropHeroProps) {
  const [layers, setLayers] = useState<Layers>({ a: item.backdrop, front: 'a' })
  const back = layers.front === 'a' ? 'b' : 'a'

  // load the next artwork into the back layer; it comes forward once it has decoded
  useEffect(() => {
    setLayers((l) => {
      if (!item.backdrop || l[l.front] === item.backdrop) return l
      const behind = l.front === 'a' ? 'b' : 'a'
      // already loaded behind (focus went back and forth): bring it forward
      if (l[behind] === item.backdrop) return { ...l, front: behind }
      return { ...l, [behind]: item.backdrop }
    })
  }, [item.backdrop])

  return (
    <section
      aria-roledescription="featured"
      aria-label={typeof item.title === 'string' ? item.title : undefined}
      className={cn(
        'relative isolate flex min-h-80 w-full items-end overflow-hidden bg-bg medium:h-[min(60svh,56.25vw)]',
        className,
      )}
    >
      <div aria-hidden className="-z-10 absolute inset-0">
        {(['a', 'b'] as const).map((key) =>
          layers[key] ? (
            <img
              key={key}
              src={layers[key]}
              alt=""
              decoding="async"
              onLoad={() => {
                if (key === back && layers[key] === item.backdrop)
                  setLayers((l) => ({ ...l, front: key }))
              }}
              className={cn(
                'absolute inset-0 size-full object-cover transition-opacity duration-(--duration-spring) ease-out',
                layers.front === key ? 'opacity-100' : 'opacity-0',
              )}
            />
          ) : null,
        )}
        {/* scrims fade to `bg`, never to black or a hue (elevation.md#scrims-over-artwork) */}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,var(--color-bg)_6%,color-mix(in_srgb,var(--color-bg)_60%,transparent)_42%,transparent_70%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(0deg,var(--color-bg),transparent_45%)]" />
      </div>

      <div className="w-full px-4 pt-24 pb-8 medium:px-8 medium:pb-12 wide:px-16">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0, transition: springBase }}
            exit={{ opacity: 0, y: 4, transition: fadeOut }}
            className="grid max-w-[38rem] gap-3"
          >
            {item.eyebrow && (
              <p className="font-semibold text-[12px] text-accent-text uppercase tracking-eyebrow">
                {item.eyebrow}
              </p>
            )}
            <h2 className="text-balance text-display">{item.title}</h2>
            {item.meta && (
              <div className="flex flex-wrap items-center gap-2 text-text-2 text-ui">
                {item.meta}
              </div>
            )}
            {item.synopsis && <p className="line-clamp-3 text-body text-text-2">{item.synopsis}</p>}
          </motion.div>
        </AnimatePresence>
        {actions && <div className="mt-5 flex flex-wrap gap-2">{actions}</div>}
      </div>
    </section>
  )
}

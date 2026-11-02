// SPDX-License-Identifier: AGPL-3.0-only
// Alerts, TV: the bell left of the avatar in the head opens it, in place of the banner across
// Home's top (the owner, 2026-10-30). Every live announcement, newest first, each a focus stop the
// D-pad moves down through. Opening it counts the new ones as seen; they keep their mark while it's
// open. The TV can't follow a link, so a call to action stays on the other apps.
import { cn, Icon } from '@highsea-tv/ui'
import { useEffect, useRef, useState } from 'react'
import { useAnnouncements } from '../client/data.ts'
import { Inline } from '../kit/inline.tsx'
import { TvButton, TvHead, tvHref, useInitialFocus } from './kit.tsx'

export function TvAlerts() {
  const a = useAnnouncements('tv')
  const [fresh, setFresh] = useState<string[] | null>(null)
  const counted = useRef(false)
  useEffect(() => {
    if (counted.current || a.all.length === 0) return
    counted.current = true
    const read = a.unread
    setFresh(read.map((x) => x.id))
    for (const x of read) a.dismiss(x.id)
  }, [a])
  useInitialFocus(true, a.all.length)
  return (
    <main className="absolute inset-0 grid grid-rows-[auto_auto_minmax(0,1fr)] gap-y-[1.6cqw] px-(--tv-safe-x) pb-(--tv-safe-y)">
      <TvHead down="alerts" />
      <h1 className="font-semibold text-[2.6cqw] leading-none tracking-display">Alerts</h1>
      {a.all.length === 0 ? (
        <div className="grid place-items-center">
          <div
            data-group="alerts"
            data-go-up="nav"
            className="grid max-w-[46cqw] justify-items-center gap-[1.4cqw] text-center"
          >
            <p className="text-(length:--tv-text-synopsis) text-text-2 leading-[1.45]">
              No announcements right now.
            </p>
            <TvButton initial icon="home" href={tvHref('/')}>
              Home
            </TvButton>
          </div>
        </div>
      ) : (
        <div className="-m-[1cqw] overflow-hidden p-[1cqw]">
          <ul
            data-group="alerts"
            data-go-up="nav"
            data-scroll="y"
            data-keep="0.3"
            className="grid max-w-[60cqw] gap-[1.2cqw] transition-lift"
          >
            {a.all.map((x, i) => (
              <li key={x.id}>
                <article
                  tabIndex={-1}
                  data-focusable=""
                  {...(i === 0 ? { 'data-initial': '' } : {})}
                  aria-label={x.title}
                  className="flex gap-[1.2cqw] rounded-(--tv-radius-poster) bg-s1 p-[1.6cqw] outline-none transition-lift focus-visible:scale-[1.015] focus-visible:bg-s2 focus-visible:shadow-(--tv-focus-shadow)"
                >
                  <Icon
                    name="announcement"
                    size={32}
                    className={cn(
                      'mt-[0.2cqw] size-[1.6cqw] shrink-0',
                      x.severity === 'warning' ? 'text-badge-warning' : 'text-accent-text',
                    )}
                  />
                  <div className="grid min-w-0 gap-[0.6cqw]">
                    <h2 className="flex items-center gap-[0.8cqw] font-semibold text-(length:--tv-text-button)">
                      {x.title}
                      {fresh?.includes(x.id) && (
                        <span className="rounded-full bg-accent-soft px-[0.6cqw] py-[0.1cqw] text-(length:--tv-text-pill) text-accent-text">
                          New
                        </span>
                      )}
                    </h2>
                    <p className="text-(length:--tv-text-synopsis) text-text-2 leading-[1.45]">
                      <Inline text={x.body} />
                    </p>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  )
}

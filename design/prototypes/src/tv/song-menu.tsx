// SPDX-License-Identifier: AGPL-3.0-only
// Menus over the page from OK held, as Continue watching's is on Home (client-home.md): a song's
// (prototype-gaps.md › 3.4: Play next, Add to queue, Go to the album, Go to the artist; the TV
// leaves playlists to the other apps) and a song's in Up next on Now playing (Play now, Remove
// from the queue). Back closes them, and focus goes back to where OK was held.
import type { IconName } from '@highsea-tv/ui-web'
import { useRef } from 'react'
import { useLocation } from 'wouter'
import { type SongMenuTarget, useSongMenu } from '../client/song-menu.ts'
import { useBack } from './back.ts'
import { TvButton, useInitialFocus } from './kit.tsx'

export type TvMenuItem = {
  icon?: IconName
  label: string
  run: () => void
  /** The choice in force (a library's genre): focused first, and marked. */
  current?: boolean
}

/** The menu's width, and its choices in columns for a long list (a library's genres). */
const widths = { 1: 'w-[30cqw]', 3: 'w-[54cqw]' } as const
const columns = { 1: '', 3: 'grid-cols-3' } as const

/**
 * A menu over the page: the name, a line under it, and its choices, the current one focused, or
 * the first.
 */
export function TvMenu({
  name,
  line,
  items,
  cols = 1,
  onClose,
}: {
  name: string
  line?: string
  items: TvMenuItem[]
  cols?: keyof typeof widths
  onClose: () => void
}) {
  const first = Math.max(
    0,
    items.findIndex((x) => x.current),
  )
  // focus goes back where OK was held, when that's still there
  const from = useRef(document.activeElement as HTMLElement | null)
  const close = () => {
    onClose()
    requestAnimationFrame(() => {
      if (from.current?.isConnected) from.current.focus({ preventScroll: true })
    })
  }
  useBack(close)
  useInitialFocus(true, name, '[data-tv-menu] [data-initial]')
  return (
    <div
      data-isolate=""
      data-tv-menu=""
      role="dialog"
      aria-label={name}
      className="absolute inset-0 z-20 grid place-items-center bg-[rgb(0_0_0/0.72)]"
    >
      <div className={`grid gap-[1.2cqw] ${widths[cols]}`}>
        <div className="grid gap-[0.3cqw]">
          <h2 className="font-semibold text-(length:--tv-text-row-title)">{name}</h2>
          {line && <p className="text-(length:--tv-text-meta) text-text-2">{line}</p>}
        </div>
        <div data-group="tv-menu" className={`grid gap-[0.6cqw] ${columns[cols]}`}>
          {items.map((x, i) => (
            <TvButton
              key={x.label}
              initial={i === first}
              icon={x.icon ?? (x.current ? 'check' : undefined)}
              aria-current={x.current || undefined}
              onClick={() => {
                close()
                x.run()
              }}
            >
              {x.label}
            </TvButton>
          ))}
        </div>
      </div>
    </div>
  )
}

/** A song's menu, or an album's, from OK held on its row or Play. */
export function TvSongMenu({
  target,
  on,
  line,
  onClose,
}: {
  target: SongMenuTarget
  /** The page it's on, so it doesn't offer to go there. */
  on?: 'album' | 'artist'
  line?: string
  onClose: () => void
}) {
  const menu = useSongMenu(target)
  const [, navigate] = useLocation()
  const items: TvMenuItem[] = [
    { icon: 'next', label: 'Play next', run: menu.playNext },
    { icon: 'queue', label: 'Add to queue', run: menu.addToQueue },
    ...(on === 'album'
      ? []
      : [{ icon: 'music' as const, label: 'Go to the album', run: () => navigate(menu.album) }]),
    ...(on === 'artist'
      ? []
      : [{ icon: 'user' as const, label: 'Go to the artist', run: () => navigate(menu.artist) }]),
  ]
  return <TvMenu name={target.name} line={line} items={items} onClose={onClose} />
}

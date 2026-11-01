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

export type TvMenuItem = { icon: IconName; label: string; run: () => void }

/** A menu over the page: the name, a line under it, and its choices, the first focused. */
export function TvMenu({
  name,
  line,
  items,
  onClose,
}: {
  name: string
  line?: string
  items: TvMenuItem[]
  onClose: () => void
}) {
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
      <div className="grid w-[30cqw] gap-[1.2cqw]">
        <div className="grid gap-[0.3cqw]">
          <h2 className="font-semibold text-(length:--tv-text-row-title)">{name}</h2>
          {line && <p className="text-(length:--tv-text-meta) text-text-2">{line}</p>}
        </div>
        <div data-group="tv-menu" className="grid gap-[0.6cqw]">
          {items.map((x, i) => (
            <TvButton
              key={x.label}
              initial={i === 0}
              icon={x.icon}
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

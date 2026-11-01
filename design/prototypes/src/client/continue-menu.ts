// SPDX-License-Identifier: AGPL-3.0-only
// Continue watching's menu (client-home.md › Continue watching), the same on every app: ⋯ on the
// card on the web and desktop, a long press on the phone, a long press of OK on the TV. Go to the
// film or the show (at the episode), Mark as watched, and Remove from Continue watching, which
// forgets the place without marking the title watched.
import { toast } from '@highsea-tv/ui-web'
import { useRef } from 'react'
import { useAction } from '../mock/hooks.tsx'
import type { ClientItem } from '../mock/types.ts'

/** The film's page, or the show's at the episode. */
export const cardPage = (item: ClientItem) =>
  item.show ? `/shows/${item.show.id}/episodes/${item.id}` : `/movies/${item.id}`

export function useContinueMenu(item: ClientItem) {
  const film = useAction((c) => c.playback.setWatched(item.id, true))
  const episode = useAction((c) => c.library.setEpisodeWatched(item.id, true))
  const dismiss = useAction((c) => c.playback.dismiss(item.id))
  const name = item.show ? `${item.show.title}, ${item.show.code}` : item.title
  return {
    /** "Go to the show", with the path on this app's routes. */
    goTo: { label: item.show ? 'Go to the show' : 'Go to the film', path: cardPage(item) },
    markWatched: async () => {
      await (item.show ? episode : film).run()
      toast({ title: `${name} marked as watched` })
    },
    remove: async () => {
      await dismiss.run()
      toast({
        title: `${name} removed from Continue watching`,
        description: 'It isn’t marked as watched.',
      })
    },
  }
}

/** How long a press is held before it opens the menu: the film page's hold of OK (client-detail.md). */
export const LONG_PRESS_MS = 600

/**
 * A long press on a card: a touch held (the phone), or OK held (the TV's remote, Enter here). The
 * click that ends a long press is swallowed, so the card doesn't also open. The context menu key
 * and a right click open it too, for the keyboard and the mouse.
 */
export function useLongPress(onLong: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const fired = useRef(false)
  // OK pressed on this card: a key-up after focus arrived from elsewhere (a menu that closed on
  // the key going down) isn't a press here
  const held = useRef(false)
  const start = () => {
    fired.current = false
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      fired.current = true
      onLong()
    }, LONG_PRESS_MS)
  }
  const cancel = () => clearTimeout(timer.current)
  return {
    onPointerDown: start,
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onKeyDown: (e: { key: string; repeat: boolean; preventDefault: () => void }) => {
      if (e.key === 'ContextMenu') {
        e.preventDefault()
        onLong()
      } else if (e.key === 'Enter') {
        // held: the first press starts the timer, the key's repeats don't click
        e.preventDefault()
        if (!e.repeat) {
          held.current = true
          start()
        }
      }
    },
    onKeyUp: (e: { key: string; target: EventTarget }) => {
      if (e.key !== 'Enter' || !held.current) return
      held.current = false
      cancel()
      if (!fired.current) (e.target as HTMLElement).click()
    },
    onBlur: () => {
      held.current = false
    },
    onContextMenu: (e: { preventDefault: () => void }) => {
      e.preventDefault()
      onLong()
    },
    onClickCapture: (e: { preventDefault: () => void; stopPropagation: () => void }) => {
      if (!fired.current) return
      fired.current = false
      e.preventDefault()
      e.stopPropagation()
    },
  }
}

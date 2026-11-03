// SPDX-License-Identifier: AGPL-3.0-only
// Continue watching's menu (client-home.md › Continue watching), the same on every app: ⋯ on the
// card on the web and desktop, a long press on the phone, a long press of OK on the TV. Go to the
// film or the show (at the episode), Mark as watched, and Remove from Continue watching, which
// forgets the place without marking the title watched.
import { createLibraryText, LONG_PRESS_MS } from '@highsea-tv/client/library'
import type { ClientItem } from '@highsea-tv/mock/types'
import { toast } from '@highsea-tv/ui'
import { useRef } from 'react'
import { useAction } from '../mock/hooks.tsx'

export { cardPage } from '@highsea-tv/client/library'
export { LONG_PRESS_MS }

const text = createLibraryText('en')

export function useContinueMenu(item: ClientItem) {
  const film = useAction((c) => c.playback.setWatched(item.id, true))
  const episode = useAction((c) => c.library.setEpisodeWatched(item.id, true))
  const dismiss = useAction((c) => c.playback.dismiss(item.id))
  const words = text.continueMenu(item)
  return {
    /** "Go to the show", with the path on this app's routes. */
    goTo: words.goTo,
    markWatched: async () => {
      await (item.show ? episode : film).run()
      toast({ title: words.marked })
    },
    remove: async () => {
      await dismiss.run()
      toast(words.removed)
    },
  }
}

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

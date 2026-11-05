// SPDX-License-Identifier: AGPL-3.0-only
// The remote's Back in a browser: the TV's parts take the keyboard's Escape and Backspace as the
// remote's `menu` (@highsea-tv/ui/tv's useRemote, ./engine.web.tsx), and Back is that press. A
// browser has nowhere to leave to, so a press nothing takes does nothing.
import { useRemote } from '@highsea-tv/ui/tv'
import type { useBackKey as native, holdMenuKey as nativeHold } from './back-key.ts'

export const useBackKey: typeof native = (handler) => {
  useRemote((event) => {
    if (event.eventType === 'menu') handler()
  })
}

export const holdMenuKey: typeof nativeHold = () => {}

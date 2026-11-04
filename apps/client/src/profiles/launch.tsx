// SPDX-License-Identifier: AGPL-3.0-only
// The TV's opening (client-settings.md › TV; the prototype's tv/who.tsx, TvLaunch), once each time
// highsea opens, and only when the server serves profiles: when this TV asks who's watching and
// the account has more than one profile, Who's watching (`/who?launch=1`); otherwise, when the
// profile last used has a PIN, its PIN. A phone and a pointer open as the profile last used.
import { useFormFactor } from '@highsea-tv/ui'
import { type Href, router } from 'expo-router'
import { useEffect } from 'react'
import { useAskOnLaunch, useProfilesState } from './state.tsx'

let opened = false

/** For the tests: open again as highsea does when it starts. */
export const forgetLaunch = () => {
  opened = false
}

/** Sends the TV to its opening once, as the shell mounts; draws nothing. */
export function TvOpening() {
  const tv = useFormFactor().input === 'tv'
  const p = useProfilesState()
  const [ask] = useAskOnLaunch()
  const ready = tv && !!p?.ready && !!p.me && ask !== null
  const asks = ready && ((ask && (p?.profiles.length ?? 0) > 1) || !!p?.me?.hasPin)
  useEffect(() => {
    if (!ready || opened) return
    opened = true
    if (asks) router.push('/who?launch=1' as Href)
  }, [ready, asks])
  return null
}

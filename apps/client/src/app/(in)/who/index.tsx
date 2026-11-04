// SPDX-License-Identifier: AGPL-3.0-only
// `/who`, Who's watching (client-settings.md › Switch profile), once for every client, only when
// the server serves profiles (a real server's address goes Home):
// - a pointer: the page of its own (../../../profiles/who.tsx, WhoPage);
// - touch: the sheet over You, so the address opens Settings with it (`?who=1`);
// - the TV: its own composition (../../../profiles/tv.tsx), and with `?launch=1` the opening the
//   shell sends it to as highsea opens (TvLaunch).
import { useFormFactor } from '@highsea-tv/ui'
import { type Href, Redirect, useLocalSearchParams } from 'expo-router'
import { useAskOnLaunch, useProfilesState } from '../../../profiles/state.tsx'
import { TvLaunch, TvWho } from '../../../profiles/tv.tsx'
import { WhoPage } from '../../../profiles/who.tsx'

export default function Who() {
  const p = useProfilesState()
  const { input } = useFormFactor()
  const launch = useLocalSearchParams<{ launch?: string }>().launch === '1'
  const [ask] = useAskOnLaunch()
  if (!p) return <Redirect href="/" />
  if (input === 'touch') return <Redirect href={'/settings?who=1' as Href} />
  if (!p.ready) return null
  if (input === 'tv') {
    if (!launch) return <TvWho />
    if (ask === null) return null
    return <TvLaunch ask={ask && p.profiles.length > 1} />
  }
  return <WhoPage />
}

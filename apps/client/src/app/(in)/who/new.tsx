// SPDX-License-Identifier: AGPL-3.0-only
// `/who/new`: Add a profile, on the TV (the prototype adds profiles there only), when the server
// serves profiles; elsewhere the address goes to Who's watching.
import { useFormFactor } from '@highsea-tv/ui'
import { type Href, Redirect } from 'expo-router'
import { useProfilesState } from '../../../profiles/state.tsx'
import { TvNewProfile } from '../../../profiles/tv-new.tsx'

export default function NewProfile() {
  const p = useProfilesState()
  const tv = useFormFactor().input === 'tv'
  if (!p) return <Redirect href="/" />
  if (!tv) return <Redirect href={'/who' as Href} />
  if (!p.ready) return null
  return <TvNewProfile />
}

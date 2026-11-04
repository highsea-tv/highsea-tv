// SPDX-License-Identifier: AGPL-3.0-only
// `/who/{id}`: a profile's PIN before watching as it (client-settings.md › Switch profile), only
// when the server serves profiles. The TV asks on its number pad (TvAskPin), Back going to Who's
// watching; a pointer starts the page at the PIN's field; touch asks in You's sheet. A profile the
// account doesn't have, or one that needs no PIN, goes back to Who's watching.
import { needsPin } from '@highsea-tv/client/profiles'
import { useFormFactor } from '@highsea-tv/ui'
import { type Href, Redirect, router, useLocalSearchParams } from 'expo-router'
import { useProfilesState } from '../../../profiles/state.tsx'
import { TvAskPin } from '../../../profiles/tv.tsx'
import { WhoPage } from '../../../profiles/who.tsx'

export default function WhoPin() {
  const p = useProfilesState()
  const { input } = useFormFactor()
  const id = useLocalSearchParams<{ id: string }>().id
  if (!p) return <Redirect href="/" />
  if (input === 'touch') return <Redirect href={'/settings?who=1' as Href} />
  if (!p.ready) return null
  const person = p.profiles.find((x) => x.id === id)
  if (!person || !needsPin(person, p.me?.id)) return <Redirect href={'/who' as Href} />
  if (input === 'tv')
    return (
      <TvAskPin
        person={person}
        onCancel={() => (router.canGoBack() ? router.back() : router.replace('/who' as Href))}
      />
    )
  return <WhoPage asking={person} />
}

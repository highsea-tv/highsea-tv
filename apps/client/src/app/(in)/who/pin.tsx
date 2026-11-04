// SPDX-License-Identifier: AGPL-3.0-only
// `/who/pin`: choosing the PIN of the profile watching now, from the TV's Settings › PIN, when the
// server serves profiles; elsewhere the address goes to Settings.
import { useFormFactor } from '@highsea-tv/ui'
import { type Href, Redirect } from 'expo-router'
import { useProfilesState } from '../../../profiles/state.tsx'
import { TvPinSteps } from '../../../profiles/tv-settings.tsx'

export default function ChoosePin() {
  const p = useProfilesState()
  const tv = useFormFactor().input === 'tv'
  if (!p) return <Redirect href="/" />
  if (!tv) return <Redirect href={'/settings' as Href} />
  if (!p.ready) return null
  return <TvPinSteps />
}

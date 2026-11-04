// SPDX-License-Identifier: AGPL-3.0-only
// An artist's page (C3), one screen for every client: ../../../../music/artist.tsx. A server that
// doesn't serve music sends its address Home.
import { usePublicInfo, useServes } from '@highsea-tv/client/data'
import { Redirect } from 'expo-router'
import { ArtistScreen } from '../../../../music/artist.tsx'

export default function ArtistRoute() {
  const info = usePublicInfo()
  const serves = useServes('music')
  if (info.status === 'success' && !serves) return <Redirect href="/" />
  return <ArtistScreen />
}

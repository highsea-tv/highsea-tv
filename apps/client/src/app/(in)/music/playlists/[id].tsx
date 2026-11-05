// SPDX-License-Identifier: AGPL-3.0-only
// A playlist's page (C3), one screen for every client: ../../../../music/playlist.tsx. A server
// that doesn't serve music sends its address Home.
import { usePublicInfo, useServes } from '@highsea-tv/client/data'
import { Redirect } from 'expo-router'
import { PlaylistScreen } from '../../../../music/playlist.tsx'

export default function PlaylistRoute() {
  const info = usePublicInfo()
  const serves = useServes('music')
  if (info.status === 'success' && !serves) return <Redirect href="/" />
  return <PlaylistScreen />
}

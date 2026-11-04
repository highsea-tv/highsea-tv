// SPDX-License-Identifier: AGPL-3.0-only
// An album's page (C3), one screen for every client: ../../../../music/album.tsx. A server that
// doesn't serve music sends its address Home.
import { usePublicInfo, useServes } from '@highsea-tv/client/data'
import { Redirect } from 'expo-router'
import { AlbumScreen } from '../../../../music/album.tsx'

export default function AlbumRoute() {
  const info = usePublicInfo()
  const serves = useServes('music')
  if (info.status === 'success' && !serves) return <Redirect href="/" />
  return <AlbumScreen />
}

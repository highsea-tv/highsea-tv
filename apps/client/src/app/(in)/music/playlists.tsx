// SPDX-License-Identifier: AGPL-3.0-only
// Music's playlists (client-library.md › Music), a destination of its own with a pointer and on the TV
// (src/music/library.tsx's MusicPage). On the phone it's the Library tab's Music view. A server
// that doesn't serve music has none: the address goes Home.
import { usePublicInfo, useServes } from '@highsea-tv/client/data'
import { useFormFactor } from '@highsea-tv/ui'
import { type Href, Redirect } from 'expo-router'
import { MusicPage } from '../../../music/library.tsx'

export default function MusicPlaylists() {
  const input = useFormFactor().input
  const info = usePublicInfo()
  const serves = useServes('music')
  // the phone's view only once public info says music is served, so a real server's goes Home
  if (info.status !== 'success') return null
  if (!serves) return <Redirect href={'/' as Href} />
  if (input === 'touch') return <Redirect href={'/library?view=music&music=playlists' as Href} />
  return <MusicPage view="playlists" />
}

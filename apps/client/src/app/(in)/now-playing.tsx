// SPDX-License-Identifier: AGPL-3.0-only
// Now playing (one-client-platform-b.md › B3, the prototype's {mobile,tv}/now-playing.tsx): the
// music player as a screen of its own, by touch and on the TV. With a pointer the player is the bar
// along the window's foot (../../music-player/bar.tsx), so the address goes Home. Only a server that
// serves music has it; on any other it goes Home too, so a real server's client is as at B2.
import { usePublicInfo } from '@highsea-tv/client/data'
import { useFormFactor } from '@highsea-tv/ui'
import { Redirect, Stack } from 'expo-router'
import { TouchNowPlaying } from '../../music-player/now-playing.tsx'
import { TvNowPlaying } from '../../music-player/now-playing-tv.tsx'

export default function NowPlaying() {
  const input = useFormFactor().input
  const info = usePublicInfo()
  // nothing until the server says what it serves, so an address opened cold isn't sent Home
  if (!info.data) return null
  const serves = info.data.sources.includes('music')
  if (!serves || input === 'pointer') return <Redirect href="/" />
  if (input === 'tv') return <TvNowPlaying />
  // by touch it rises from the foot, as the mini player it opens from sits there
  return (
    <>
      <Stack.Screen options={{ animation: 'slide_from_bottom' }} />
      <TouchNowPlaying />
    </>
  )
}

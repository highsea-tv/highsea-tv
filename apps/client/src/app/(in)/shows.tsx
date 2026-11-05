// SPDX-License-Identifier: AGPL-3.0-only
// Shows (client-library.md), a destination of its own with a pointer and on the TV, each its own
// composition (src/library/shows.tsx). On the phone it's the Library tab's Shows view. A server
// that doesn't serve shows has none: the address goes Home.
import { usePublicInfo, useServes } from '@highsea-tv/client/data'
import { useFormFactor } from '@highsea-tv/ui'
import { type Href, Redirect } from 'expo-router'
import { PointerShows, TvShows } from '../../library/shows.tsx'

export default function Shows() {
  const input = useFormFactor().input
  const info = usePublicInfo()
  const serves = useServes('shows')
  if (info.status === 'success' && !serves) return <Redirect href={'/' as Href} />
  if (input === 'touch') return <Redirect href={'/library?view=shows' as Href} />
  return input === 'tv' ? <TvShows /> : <PointerShows />
}

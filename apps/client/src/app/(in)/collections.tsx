// SPDX-License-Identifier: AGPL-3.0-only
// Collections (collections.md#in-the-apps), a destination of its own with a pointer and on the TV,
// each its own composition (src/library/collections.tsx). On the phone it's a view of the Library
// tab.
import { useFormFactor } from '@highsea-tv/ui'
import { type Href, Redirect } from 'expo-router'
import { PointerCollections, TvCollections } from '../../library/collections.tsx'

export default function Collections() {
  const input = useFormFactor().input
  if (input === 'touch') return <Redirect href={'/library?view=collections' as Href} />
  return input === 'tv' ? <TvCollections /> : <PointerCollections />
}

// SPDX-License-Identifier: AGPL-3.0-only
// C3 Library (client-library.md): the phone's Library tab, with Movies and Collections in it
// (src/library/library.tsx). A pointer and the TV reach Movies and Collections as destinations of
// their own, so here they go to the one asked for.
import { useFormFactor } from '@highsea-tv/ui'
import { type Href, Redirect, useLocalSearchParams } from 'expo-router'
import { TouchLibrary } from '../../library/library.tsx'

export default function Library() {
  const { view } = useLocalSearchParams<{ view?: string }>()
  if (useFormFactor().input !== 'touch')
    return <Redirect href={(view === 'collections' ? '/collections' : '/movies') as Href} />
  return <TouchLibrary />
}

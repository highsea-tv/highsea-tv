// SPDX-License-Identifier: AGPL-3.0-only
// C3 Movies (client-library.md), a destination of its own with a pointer and on the TV, each its
// own composition (src/library/movies.tsx). On the phone it's the Library tab's first view.
import { useFormFactor } from '@highsea-tv/ui'
import { type Href, Redirect } from 'expo-router'
import { PointerMovies, TvMovies } from '../../library/movies.tsx'

export default function Movies() {
  const input = useFormFactor().input
  if (input === 'touch') return <Redirect href={'/library' as Href} />
  return input === 'tv' ? <TvMovies /> : <PointerMovies />
}

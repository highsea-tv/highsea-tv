// SPDX-License-Identifier: AGPL-3.0-only
// A collection's page (client-search.md#collections), one composition per form factor
// (src/library/collection.tsx): touch, a pointer and the TV.
import { useFormFactor } from '@highsea-tv/ui'
import { useLocalSearchParams } from 'expo-router'
import { PointerCollection, TouchCollection, TvCollection } from '../../../library/collection.tsx'

export default function Collection() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const input = useFormFactor().input
  if (input === 'tv') return <TvCollection id={id} />
  return input === 'touch' ? <TouchCollection id={id} /> : <PointerCollection id={id} />
}

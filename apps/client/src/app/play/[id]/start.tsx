// SPDX-License-Identifier: AGPL-3.0-only
// C5, the player, from the beginning: the film page's Play from the beginning
// (../../../player/screen.tsx).
import { useLocalSearchParams } from 'expo-router'
import { PlayerScreen } from '../../../player/screen.tsx'

export default function PlayFromStartRoute() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <PlayerScreen id={id} fromStart />
}

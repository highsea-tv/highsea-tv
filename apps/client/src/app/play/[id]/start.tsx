// SPDX-License-Identifier: AGPL-3.0-only
// C5, the player, from the beginning: the film page's Play from the beginning
// (../../../player/screen.tsx); with `?shuffle=1`,
// an item of a shuffle (@highsea-tv/client/shuffle).
import { useLocalSearchParams } from 'expo-router'
import { PlayerScreen } from '../../../player/screen.tsx'

export default function PlayFromStartRoute() {
  const { id, shuffle } = useLocalSearchParams<{ id: string; shuffle?: string }>()
  return <PlayerScreen id={id} fromStart shuffle={shuffle === '1'} />
}

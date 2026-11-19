// SPDX-License-Identifier: AGPL-3.0-only
// C5, the player, from where the person left off (../../../player/screen.tsx).
import { useLocalSearchParams } from 'expo-router'
import { PlayerScreen } from '../../../player/screen.tsx'

export default function PlayRoute() {
  // `?queue=1`: the first film of a collection's Play, resumed (player.md › Play in order)
  const { id, queue } = useLocalSearchParams<{ id: string; queue?: string }>()
  return <PlayerScreen id={id} fromStart={false} queue={queue === '1'} />
}

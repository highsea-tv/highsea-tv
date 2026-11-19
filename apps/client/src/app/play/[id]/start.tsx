// SPDX-License-Identifier: AGPL-3.0-only
// C5, the player, from the beginning: the film page's Play from the beginning
// (../../../player/screen.tsx); with `?queue=1`,
// an item of a shuffle or a collection’s Play (@highsea-tv/client/shuffle).
import { useLocalSearchParams } from 'expo-router'
import { PlayerScreen } from '../../../player/screen.tsx'

export default function PlayFromStartRoute() {
  const { id, queue } = useLocalSearchParams<{ id: string; queue?: string }>()
  return <PlayerScreen id={id} fromStart queue={queue === '1'} />
}

// SPDX-License-Identifier: AGPL-3.0-only
// C5, the player, from where the person left off (../../../player/screen.tsx).
import { useLocalSearchParams } from 'expo-router'
import { PlayerScreen } from '../../../player/screen.tsx'

export default function PlayRoute() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <PlayerScreen id={id} fromStart={false} />
}

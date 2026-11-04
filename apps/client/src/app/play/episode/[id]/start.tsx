// SPDX-License-Identifier: AGPL-3.0-only
// C5, the player, playing an episode from the beginning: the show page's Watch again
// (../../../../player/screen.tsx).
import { useLocalSearchParams } from 'expo-router'
import { PlayerScreen } from '../../../../player/screen.tsx'

export default function PlayEpisodeFromStartRoute() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <PlayerScreen id={id} fromStart type="episode" />
}

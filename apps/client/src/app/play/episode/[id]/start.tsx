// SPDX-License-Identifier: AGPL-3.0-only
// C5, the player, playing an episode from the beginning: the show page's Watch again
// (../../../../player/screen.tsx); with `?shuffle=1`, an item of a shuffle (@highsea-tv/client/shuffle).
import { useLocalSearchParams } from 'expo-router'
import { PlayerScreen } from '../../../../player/screen.tsx'

export default function PlayEpisodeFromStartRoute() {
  const { id, shuffle } = useLocalSearchParams<{ id: string; shuffle?: string }>()
  return <PlayerScreen id={id} fromStart type="episode" shuffle={shuffle === '1'} />
}

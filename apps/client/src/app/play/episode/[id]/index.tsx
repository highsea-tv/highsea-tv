// SPDX-License-Identifier: AGPL-3.0-only
// C5, the player, playing an episode from where the person left off (../../../../player/screen.tsx).
// A static segment, so Expo Router matches it before /play/[id] (docs.expo.dev/router/basics/notation).
import { useLocalSearchParams } from 'expo-router'
import { PlayerScreen } from '../../../../player/screen.tsx'

export default function PlayEpisodeRoute() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <PlayerScreen id={id} fromStart={false} type="episode" />
}

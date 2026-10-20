'use client'
// SPDX-License-Identifier: AGPL-3.0-only
import type { SoundEvent, SoundPack } from '@highsea/tokens'
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react'
import { createSoundPlayer, type SoundPlayer } from './player.ts'

const SoundContext = createContext<SoundPlayer | null>(null)

export type SoundProviderProps = {
  children: ReactNode
  pack?: SoundPack
  enabled?: boolean
  /** Linear volume, 0–1. */
  volume?: number
  /** Supply your own player (tests, or one shared outside React). */
  player?: SoundPlayer
}

/** Gives components a sound player. Components map interactions to events, never to sounds. */
export function SoundProvider({
  children,
  pack,
  enabled = false,
  volume = 1,
  player: external,
}: SoundProviderProps) {
  const [player] = useState(() => external ?? createSoundPlayer({ enabled, volume }))
  useEffect(() => player.setEnabled(enabled), [player, enabled])
  useEffect(() => player.setVolume(volume), [player, volume])
  useEffect(() => {
    if (pack) player.setPack(pack)
  }, [player, pack])
  useEffect(() => (external ? undefined : () => player.dispose()), [player, external])
  return <SoundContext.Provider value={player}>{children}</SoundContext.Provider>
}

/** Returns a stable `play(event)`. Without a provider it does nothing. */
export function useSound(): (event: SoundEvent) => void {
  const player = useContext(SoundContext)
  return useCallback((event: SoundEvent) => player?.play(event), [player])
}

/** The provider's player, for settings screens that preview or toggle sound. */
export function useSoundPlayer(): SoundPlayer | null {
  return useContext(SoundContext)
}

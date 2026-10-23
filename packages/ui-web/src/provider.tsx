'use client'
// SPDX-License-Identifier: AGPL-3.0-only
import type { SoundPack } from '@highsea-tv/tokens'
import { MotionConfig } from 'motion/react'
import type { ReactNode } from 'react'
import { Toaster } from './components/toast.tsx'
import { TooltipProvider } from './components/tooltip.tsx'
import { SoundProvider } from './sound/context.tsx'

export type UIProviderProps = {
  children: ReactNode
  /** UI sound. Off by default everywhere except TV (sound.md#defaults). */
  sound?: { enabled?: boolean; volume?: number; pack?: SoundPack }
  /** Mounts the toast stack. Default true. */
  toaster?: boolean
}

/**
 * The root every app wraps itself in: reduced motion follows the OS (motion/react drops
 * transforms and keeps opacity), tooltips share one delay, toasts and sound are available.
 */
export function UIProvider({ children, sound, toaster = true }: UIProviderProps) {
  return (
    <MotionConfig reducedMotion="user">
      <SoundProvider enabled={sound?.enabled} volume={sound?.volume} pack={sound?.pack}>
        <TooltipProvider delayDuration={400} skipDelayDuration={200}>
          {children}
          {toaster && <Toaster />}
        </TooltipProvider>
      </SoundProvider>
    </MotionConfig>
  )
}

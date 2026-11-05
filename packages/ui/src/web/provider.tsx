'use client'
// SPDX-License-Identifier: AGPL-3.0-only
import type { SoundPack } from '@highsea-tv/tokens'
import { MotionConfig } from 'motion/react'
import type { ReactNode } from 'react'
import { Toaster } from './components/toast.tsx'
import { TooltipProvider } from './components/tooltip.tsx'
import { type ControlPlatform, PlatformScope } from './lib/platform.tsx'
import { SoundProvider } from './sound/context.tsx'

export type UIProviderProps = {
  children: ReactNode
  /** UI sound. Off by default everywhere except TV (sound.md#defaults). */
  sound?: { enabled?: boolean; volume?: number; pack?: SoundPack }
  /** Mounts the toast stack. Default true. */
  toaster?: boolean
  /**
   * Draws the app's controls at this platform's rule whatever the pointer (controls.md): the TV's
   * web build, for example. Left out, a pointer or touch follows the device.
   */
  platform?: ControlPlatform
}

/**
 * The root every app wraps itself in: reduced motion follows the OS (motion/react drops
 * transforms and keeps opacity), tooltips share one delay, toasts and sound are available.
 */
export function UIProvider({ children, sound, toaster = true, platform }: UIProviderProps) {
  const content = (
    <MotionConfig reducedMotion="user">
      <SoundProvider enabled={sound?.enabled} volume={sound?.volume} pack={sound?.pack}>
        <TooltipProvider delayDuration={400} skipDelayDuration={200}>
          {children}
          {toaster && <Toaster />}
        </TooltipProvider>
      </SoundProvider>
    </MotionConfig>
  )
  if (!platform) return content
  // `contents`: the scope sets the variables without a box of its own, so the layout is the app's
  return (
    <PlatformScope platform={platform} className="contents">
      {content}
    </PlatformScope>
  )
}

'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// The platform a control is drawn for (controls.md › One rule per platform). The tokens' CSS sets
// the `--control-*` variables for a pointer on :root and for touch under `@media (pointer: coarse)`
// (https://developer.mozilla.org/en-US/docs/Web/CSS/@media/pointer); an element with
// `data-platform` sets them for everything inside it, whatever the pointer. Custom properties
// inherit through the DOM, `display: contents` elements included, so a scope needs no box of its
// own. Components read sizes from the variables, so they mostly never ask; the hook is for those
// that draw differently per platform (the TV's focus, for example).
import type { ControlPlatform } from '@highsea-tv/tokens'
import { Slot } from 'radix-ui'
import { type ComponentProps, createContext, useContext, useSyncExternalStore } from 'react'

export type { ControlPlatform }

const PlatformContext = createContext<ControlPlatform | null>(null)

export type PlatformScopeProps = ComponentProps<'div'> & {
  platform: ControlPlatform
  /** Sets the platform on the child element instead of a `div` of its own. */
  asChild?: boolean
}

/**
 * Draws everything inside at a platform's rule: the prototypes' phone frame at touch, the TV's
 * frame at the TV's (which also needs `container-type: inline-size` around it, for its cqw).
 */
export function PlatformScope({ platform, asChild, ...props }: PlatformScopeProps) {
  const Root = asChild ? Slot.Root : 'div'
  return (
    <PlatformContext.Provider value={platform}>
      <Root data-platform={platform} {...props} />
    </PlatformContext.Provider>
  )
}

const COARSE = '(pointer: coarse)'

function subscribe(change: () => void) {
  if (typeof matchMedia === 'undefined') return () => {}
  const query = matchMedia(COARSE)
  query.addEventListener('change', change)
  return () => query.removeEventListener('change', change)
}

const coarse = () => typeof matchMedia !== 'undefined' && matchMedia(COARSE).matches

/**
 * The platform controls here are drawn for: the nearest `PlatformScope`'s, else touch on a coarse
 * pointer and a pointer otherwise. The server renders a pointer, then the browser corrects it.
 */
export function useControlPlatform(): ControlPlatform {
  const scoped = useContext(PlatformContext)
  const touch = useSyncExternalStore(subscribe, coarse, () => false)
  return scoped ?? (touch ? 'touch' : 'pointer')
}

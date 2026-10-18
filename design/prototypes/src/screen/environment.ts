// SPDX-License-Identifier: AGPL-3.0-only
// Applies the toolbar's theme, reduced motion and text size to the screen's document, without
// changing ui-web or the OS: attributes on <html>, the custom theme's CSS, and a matchMedia shim
// so hooks that read `prefers-reduced-motion` (spatial navigation, carousels) see the toggle.
import { createTheme, themeCss } from '@highsea/tokens'
import type { ProtoState } from '../proto/state.ts'

/** The custom theme: what an owner might build in Appearance (A12). OLED base, a sea-glass accent. */
export const harbor = createTheme({ base: 'oled', accent: '#8fbfb7', name: 'Harbor', id: 'harbor' })

const REDUCED = /\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/

let forced = false
const shimmed = new Set<{ notify: () => void }>()

/**
 * Wraps `window.matchMedia` once: reduced-motion queries report true while the toggle is on, and
 * their listeners hear about changes. Every other query passes through.
 */
function installShim() {
  const w = window as Window & { __hsShim?: boolean }
  if (w.__hsShim || typeof w.matchMedia !== 'function') return
  w.__hsShim = true
  const native = w.matchMedia.bind(w)
  w.matchMedia = (query: string) => {
    const list = native(query)
    if (!REDUCED.test(query)) return list
    const listeners = new Set<(e: MediaQueryListEvent) => void>()
    const entry = {
      notify: () => {
        const event = { matches: forced || list.matches, media: query } as MediaQueryListEvent
        for (const l of listeners) l(event)
      },
    }
    return {
      media: query,
      get matches() {
        return forced || list.matches
      },
      onchange: null,
      addEventListener(_type: string, l: (e: MediaQueryListEvent) => void) {
        if (!listeners.size) shimmed.add(entry)
        listeners.add(l)
        list.addEventListener('change', l)
      },
      removeEventListener(_type: string, l: (e: MediaQueryListEvent) => void) {
        listeners.delete(l)
        if (!listeners.size) shimmed.delete(entry)
        list.removeEventListener('change', l)
      },
      addListener(l: (e: MediaQueryListEvent) => void) {
        this.addEventListener('change', l)
      },
      removeListener(l: (e: MediaQueryListEvent) => void) {
        this.removeEventListener('change', l)
      },
      dispatchEvent: () => true,
    } as MediaQueryList
  }
}

function setFlag(el: HTMLElement, name: string, on: boolean) {
  if (on) el.setAttribute(name, '')
  else el.removeAttribute(name)
}

export function applyEnvironment(state: ProtoState): void {
  const root = document.documentElement
  if (state.theme === 'harbor' && !document.getElementById('hs-theme-harbor')) {
    const style = document.createElement('style')
    style.id = 'hs-theme-harbor'
    style.textContent = themeCss(harbor.theme)
    document.head.append(style)
  }
  root.dataset.theme = state.theme
  setFlag(root, 'data-reduced-motion', state.reducedMotion)
  setFlag(root, 'data-large-text', state.largeText)
  installShim()
  if (forced !== state.reducedMotion) {
    forced = state.reducedMotion
    for (const s of shimmed) s.notify()
  }
}

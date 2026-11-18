// SPDX-License-Identifier: AGPL-3.0-only
// The web's side of ./above-modals.tsx. react-native-web draws each Modal through a portal into a
// `<div>` it appends to `<body>` (exports/Modal/ModalPortal.js), in a fixed box at `zIndex: 9999`
// (exports/Modal/ModalAnimation.js, styles.container), so anything drawn inside the app's root,
// whatever its own z-index, is beneath an open sheet or dialog: a z-index only orders boxes within
// the same stacking context (https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_positioned_layout/Stacking_context).
// So these children go through React's own portal (https://react.dev/reference/react-dom/createPortal)
// into a `<div>` of their own on `<body>`, one layer above the Modals'.
import { type ReactNode, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AboveModals as Native } from './above-modals.tsx'

/** react-native-web's Modal layer (ModalAnimation.js), and the one above it. */
const MODAL_LAYER = 9999
const ABOVE = String(MODAL_LAYER + 1)

export const AboveModals: typeof Native = ({ children }: { children: ReactNode }) => {
  // made after the first render, so the server's page and the browser's first agree
  // (https://react.dev/reference/react-dom/client/hydrateRoot#handling-different-client-and-server-content)
  const [host, setHost] = useState<HTMLElement | null>(null)
  useEffect(() => {
    const el = document.createElement('div')
    el.dataset.highseaLayer = 'above-modals'
    // a box of no size at the top of the page, its own stacking context above the Modals', whose
    // fixed children are placed by the window (https://developer.mozilla.org/en-US/docs/Web/CSS/position#fixed)
    Object.assign(el.style, { position: 'relative', zIndex: ABOVE })
    document.body.appendChild(el)
    setHost(el)
    return () => {
      el.remove()
    }
  }, [])
  return host ? createPortal(children, host) : null
}

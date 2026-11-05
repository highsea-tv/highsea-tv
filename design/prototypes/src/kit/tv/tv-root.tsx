// SPDX-License-Identifier: AGPL-3.0-only
// The TV screen's root: the 16:9 container (cqw screen units), spatial navigation and the remote's
// OK and Back. The frame sizes the viewport to 16:9, so the root just fills it. It draws the
// library's controls at the TV rule (controls.md › One rule per platform): the `--control-*`
// variables in cqw, which resolve against this root's inline-size container (1cqw = 1u, 19.2px at
// 1080p), so a 36 control is 3.28u.
//
// Only the prototype's own TV screens run this navigator. On a route apps/client holds, the frame
// loads the client's web export in its iframe instead (chrome/stage.tsx, `clientSrc`), a document
// of its own whose stops the library's engine moves (@highsea-tv/ui's tv/engine.web.tsx). Two
// navigators on one document would each move focus on every arrow, so this root must never be
// drawn around the client.
import { PlatformScope, useSound, useSpatialNavigation } from '@highsea-tv/ui'
import { type ReactNode, useEffect, useLayoutEffect, useRef } from 'react'

export function TvRoot({ children, onBack }: { children: ReactNode; onBack?: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  const play = useSound()
  // the latest Back, so a new one each render doesn't re-run the effects below
  const back = useRef(onBack)
  back.current = onBack
  useSpatialNavigation(root)

  // the document too, so anything portalled to the body is drawn at the TV rule; outside the
  // container, cqw falls back to the iframe's own 16:9 viewport (chrome/stage.tsx), the same width
  useLayoutEffect(() => {
    const doc = document.documentElement
    const was = doc.dataset.platform
    doc.dataset.platform = 'tv'
    return () => {
      if (was === undefined) delete doc.dataset.platform
      else doc.dataset.platform = was
    }
  }, [])

  // focus starts inside the root, where the navigator listens (data-initial picks the item)
  useEffect(() => root.current?.focus({ preventScroll: true }), [])

  useEffect(() => {
    const el = root.current
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') play('select')
      if (e.key === 'Escape') {
        play('back')
        back.current?.()
      }
    }
    el?.addEventListener('keydown', onKey)
    return () => el?.removeEventListener('keydown', onKey)
  }, [play])

  return (
    <PlatformScope
      platform="tv"
      ref={root}
      // a click on the frame gives it focus, so the first arrow key lands on data-initial
      tabIndex={-1}
      className="relative h-screen w-full overflow-hidden bg-bg text-text outline-none [container-type:inline-size]"
    >
      {children}
    </PlatformScope>
  )
}

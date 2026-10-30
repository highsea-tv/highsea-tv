// SPDX-License-Identifier: AGPL-3.0-only
// The TV screen's root: the 16:9 container (cqw screen units), spatial navigation and the remote's
// OK and Back. The frame sizes the viewport to 16:9, so the root just fills it.
import { useSound, useSpatialNavigation } from '@highsea-tv/ui-web'
import { type ReactNode, useEffect, useRef } from 'react'

export function TvRoot({ children, onBack }: { children: ReactNode; onBack?: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  const play = useSound()
  // the latest Back, so a new one each render doesn't re-run the effects below
  const back = useRef(onBack)
  back.current = onBack
  useSpatialNavigation(root)

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
    <div
      ref={root}
      data-platform="tv"
      // a click on the frame gives it focus, so the first arrow key lands on data-initial
      tabIndex={-1}
      className="relative h-screen w-full overflow-hidden bg-bg text-text outline-none [container-type:inline-size]"
    >
      {children}
    </div>
  )
}

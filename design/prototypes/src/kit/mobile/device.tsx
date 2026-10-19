// SPDX-License-Identifier: AGPL-3.0-only
// The phone screen: a 390 × 844 pt viewport with the status bar and home indicator drawn in (the
// safe areas), and a momentum-scrolling content area between them. React Native comes in Phase 4;
// these approximate it with web primitives (pt ≈ px).
import { Icon } from '@highsea/ui-web'
import type { ReactNode } from 'react'
import { useNow } from '../../mock/hooks.tsx'

/** The phone's screen, in pt. */
export const PHONE = { w: 390, h: 844 }

/** Safe-area insets of a current notched phone, in pt. */
export const safeArea = { top: 54, bottom: 34 }

const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' })

function StatusBar() {
  const now = useNow()
  return (
    <div
      aria-hidden
      style={{ height: safeArea.top }}
      className="flex shrink-0 items-center justify-between px-8 pt-2 font-semibold text-[15px] text-text"
    >
      <span data-figures="">{time.format(now)}</span>
      <span className="flex items-center gap-1.5">
        <Icon name="network" size={16} />
        <span className="h-3 w-6 rounded-[4px] border border-text/60 p-px">
          <span className="block h-full w-4/5 rounded-[2px] bg-text" />
        </span>
      </span>
    </div>
  )
}

export function MobileScreen({ children, tabBar }: { children: ReactNode; tabBar?: ReactNode }) {
  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-bg text-text">
      <StatusBar />
      <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      {tabBar}
      <div
        aria-hidden
        style={{ height: safeArea.bottom }}
        className="grid shrink-0 place-items-center"
      >
        <span className="h-[5px] w-[134px] rounded-full bg-text" />
      </div>
    </div>
  )
}

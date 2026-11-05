'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Tabs in the address (admin-shell.md › Interactions, prototype-gaps.md stage 5): the first tab is
// the page's own address and the rest a segment after it, so a tab can be linked, reloaded and
// reached with Back. Each tab's address is a page under `app/(admin)/`, which draws not found for
// a tab the page doesn't have.
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'

/**
 * Moves to a tab's address. Radix's Tabs call `onValueChange` on pointer down and again as the tab
 * takes focus, both before the page draws again, so the second call is dropped: one step in
 * history, not two.
 */
export function useTabAddress<T extends string>(base: string, first: T): (tab: T) => void {
  const router = useRouter()
  const pathname = usePathname()
  const pending = useRef<string | null>(null)
  useEffect(() => {
    pending.current = null
  })
  return (tab) => {
    const to = tab === first ? base : `${base}/${tab}`
    if (to === pathname || to === pending.current) return
    pending.current = to
    router.push(to)
  }
}

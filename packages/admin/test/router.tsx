// SPDX-License-Identifier: AGPL-3.0-only
// The host's router stood in for a page whose tabs are in its address (admin-shell.md › Interactions):
// a push within the page draws it again at the new tab, as moving between its `[tab]` routes does.
// Mock the admin's navigation (src/navigation.tsx) with `navigation`, and render the page inside `Routed`.
import { type ReactNode, useState } from 'react'

export const router = {
  /** The address the page is at. */
  path: '/',
  /** Every push, in order. */
  history: [] as string[],
  follow: null as ((path: string) => void) | null,
}

const push = (path: string) => {
  router.history.push(path)
  router.follow?.(path)
}

export const navigation = {
  useRouter: () => ({ push, replace: push, back: () => {}, refresh: () => {} }),
  usePathname: () => router.path,
  useSearchParams: () => new URLSearchParams(),
}

/** The page at `base` (or one of its tabs, `at`), given the tab its address names. */
export function Routed<T extends string>({
  base,
  at = base,
  children,
}: {
  base: string
  at?: string
  children: (tab: T | undefined) => ReactNode
}) {
  const [path, setPath] = useState(() => {
    router.path = at
    router.history = []
    return at
  })
  router.follow = (to) => {
    if (to !== base && !to.startsWith(`${base}/`)) return
    router.path = to
    setPath(to)
  }
  return children((path.slice(base.length + 1) || undefined) as T | undefined)
}

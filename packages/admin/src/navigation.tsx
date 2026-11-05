'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Where the admin is and how it moves (one-client-platform-d.md › One copy of each admin screen):
// the one thing a screen needs from its host besides the API. The admin on Next.js gives Next's
// router (`next/navigation`'s useRouter, usePathname and useSearchParams,
// https://nextjs.org/docs/app/api-reference/functions/use-router); the prototype gives its own
// address. The hooks keep the names and shapes of Next's, so a screen reads as it did.
import { createContext, type ReactNode, useContext } from 'react'

export type AdminRouter = {
  push: (href: string) => void
  replace: (href: string) => void
}

export type AdminNavigation = {
  router: AdminRouter
  pathname: string
  searchParams: URLSearchParams
}

const NavigationContext = createContext<AdminNavigation | null>(null)

/** Where the admin's screens are drawn: the host's router and address. */
export function NavigationProvider({
  value,
  children,
}: {
  value: AdminNavigation
  children: ReactNode
}) {
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>
}

function useNavigation(): AdminNavigation {
  const navigation = useContext(NavigationContext)
  if (!navigation) throw new Error('The admin’s screens need a NavigationProvider')
  return navigation
}

export const useRouter = (): AdminRouter => useNavigation().router
export const usePathname = (): string => useNavigation().pathname
export const useSearchParams = (): URLSearchParams => useNavigation().searchParams

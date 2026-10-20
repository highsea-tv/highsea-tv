'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// A page's search, tab, filter and sort kept in the address, so Back returns to the same view
// (movies.md › Decisions: "Discover keeps its search in the history entry"). Written with the
// native `history.replaceState`, which Next's router integrates with `useSearchParams` without a
// navigation or a server round trip (nextjs.org/docs/app/getting-started/linking-and-navigating,
// "Native History API"). Replace, not push: typing a title shouldn't add a Back step per letter.
import { useSearchParams } from 'next/navigation'
import { useCallback, useState } from 'react'

/** One search parameter as state: `fallback` when it's absent, and absent when it's `fallback`. */
export function useAddressParam<T extends string>(
  name: string,
  fallback: T,
  allowed?: readonly T[],
): [T, (value: T) => void] {
  const params = useSearchParams()
  const [value, setValue] = useState<T>(() => {
    const v = params.get(name)
    return v !== null && (!allowed || allowed.includes(v as T)) ? (v as T) : fallback
  })
  const set = useCallback(
    (next: T) => {
      setValue(next)
      const url = new URL(window.location.href)
      if (next === fallback) url.searchParams.delete(name)
      else url.searchParams.set(name, next)
      window.history.replaceState(null, '', url.pathname + url.search + url.hash)
    },
    [name, fallback],
  )
  return [value, set]
}

'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// "in 9m", "4m ago" and "Just now", kept current by a clock that ticks every 30 seconds.

import { duration } from '@highsea/core/format'
import { useLocale, useT } from '@highsea/i18n/react'
import { useEffect, useState } from 'react'
import { shell } from './messages.ts'

export function useNow(every = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), every)
    return () => clearInterval(timer)
  }, [every])
  return now
}

export function useRelative() {
  const t = useT(shell)
  const locale = useLocale()
  const now = useNow()
  return {
    now,
    /** "in 9m" or "4m ago". */
    relative: (iso: string) => {
      const d = (Date.parse(iso) - now) / 1000
      return d >= 0
        ? t('time.in', { duration: duration(d, locale) })
        : t('time.ago', { duration: duration(-d, locale) })
    },
    /** "Just now" within a minute, then "3h ago". */
    seen: (iso: string) => {
      const d = (Date.parse(iso) - now) / 1000
      if (Math.abs(d) < 60) return t('time.justNow')
      return d >= 0
        ? t('time.in', { duration: duration(d, locale) })
        : t('time.ago', { duration: duration(-d, locale) })
    },
  }
}

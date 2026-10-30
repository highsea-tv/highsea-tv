// SPDX-License-Identifier: AGPL-3.0-only
// The shared format (`@highsea-tv/client/format`) in this phone's locale.
import { createFormat } from '@highsea-tv/client/format'
import { useLocale } from '@highsea-tv/i18n/react'
import { useMemo } from 'react'

export function useFormat() {
  const locale = useLocale()
  return useMemo(() => createFormat(locale), [locale])
}

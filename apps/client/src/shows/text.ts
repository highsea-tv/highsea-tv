// SPDX-License-Identifier: AGPL-3.0-only
// The shows' words in this locale (@highsea-tv/client/shows's createShowsText), made once per
// locale, as the library's useLibraryText is.
import { createShowsText } from '@highsea-tv/client/shows'
import { useLocale } from '@highsea-tv/i18n/react'
import { useMemo } from 'react'

export function useShowsText() {
  const locale = useLocale()
  return useMemo(() => createShowsText(locale), [locale])
}

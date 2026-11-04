// SPDX-License-Identifier: AGPL-3.0-only
// The films' words in this locale (@highsea-tv/client/films): a card's title and caption, a
// collection tile's, a search's. Made once per locale and shared by every screen that draws films,
// so no screen builds its own.
import { createFilmsText } from '@highsea-tv/client/films'
import { useLocale } from '@highsea-tv/i18n/react'

export type FilmsText = ReturnType<typeof createFilmsText>

const made = new Map<string, FilmsText>()

/** The films' words in the app's locale, made once for it however many posters ask. */
export function useFilmsText(): FilmsText {
  const locale = useLocale()
  let text = made.get(locale)
  if (!text) {
    text = createFilmsText(locale)
    made.set(locale, text)
  }
  return text
}

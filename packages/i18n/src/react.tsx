// SPDX-License-Identifier: AGPL-3.0-only
// React bindings: the locale comes from a provider; each screen formats its own catalog.
import { createContext, type ReactNode, useContext, useMemo } from 'react'
import { createT, type Messages, type T } from './index.ts'

const LocaleContext = createContext('en')

export function I18nProvider({ locale, children }: { locale: string; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
}

export const useLocale = () => useContext(LocaleContext)

/** `const t = useT(messages)`, then `t('id', { values })`. */
export function useT<M extends Messages>(messages: M): T<M> {
  const locale = useLocale()
  return useMemo(() => createT(messages, locale), [messages, locale])
}

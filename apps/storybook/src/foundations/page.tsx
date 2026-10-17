// SPDX-License-Identifier: AGPL-3.0-only
// The frame for foundation pages: a title, a lead and sections, with a link to the governing doc.
import { type BuiltInThemeId, builtInThemes, resolveTheme } from '@highsea/tokens'
import type { ReactNode } from 'react'

export function Page({
  title,
  lead,
  doc,
  children,
}: {
  title: string
  lead: ReactNode
  doc?: string
  children: ReactNode
}) {
  return (
    <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-12 px-4 py-10 medium:px-8">
      <header className="grid gap-3">
        <p className="font-mono text-label text-text-3 uppercase">Foundations</p>
        <h1 className="text-display">{title}</h1>
        <p className="max-w-[68ch] text-body text-text-2">{lead}</p>
        {doc && <p className="wrap-anywhere font-mono text-caption text-text-3">{doc}</p>}
      </header>
      {children}
    </div>
  )
}

export function Section({
  title,
  note,
  children,
}: {
  title: string
  note?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="grid gap-5">
      <div className="grid gap-1.5 border-line border-b pb-3">
        <h2 className="text-title">{title}</h2>
        {note && <p className="max-w-[72ch] text-ui text-text-2">{note}</p>}
      </div>
      {children}
    </section>
  )
}

/** The built-in theme the toolbar has selected (addon-themes stores its name). */
export function activeTheme(globals: Record<string, unknown>) {
  const spec =
    Object.values(builtInThemes).find((t) => t.name === globals.theme) ?? builtInThemes.default
  return resolveTheme(spec)
}

export type { BuiltInThemeId }

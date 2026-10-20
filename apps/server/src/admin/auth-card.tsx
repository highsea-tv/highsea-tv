// SPDX-License-Identifier: AGPL-3.0-only
// The centred card that sign-in, invite and reset links and device pairing sit in (the
// prototype's login.tsx).
import { Icon, Lockup } from '@highsea/ui-web'
import type { ReactNode } from 'react'

export function Card({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-screen grid-cols-[minmax(0,1fr)] place-items-center bg-bg p-4 text-text">
      <div className="grid w-full max-w-[24rem] gap-6">
        <Lockup size={20} className="justify-self-center" />
        <section className="grid gap-5 rounded-lg border border-line bg-s1 p-6 shadow-2">
          {children}
        </section>
      </div>
    </main>
  )
}

export function Heading({ title, detail }: { title: string; detail?: ReactNode }) {
  return (
    <div className="grid gap-1">
      <h1 className="text-title">{title}</h1>
      {detail && <p className="text-caption text-text-2">{detail}</p>}
    </div>
  )
}

export function FormAlert({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-sm bg-badge-danger-bg px-3 py-2 text-badge-danger text-caption"
    >
      <Icon name="alert" size={16} className="mt-px shrink-0" />
      {children}
    </p>
  )
}

export function Divider({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-caption text-text-3">
      <span className="h-px flex-1 bg-line" />
      {children}
      <span className="h-px flex-1 bg-line" />
    </div>
  )
}

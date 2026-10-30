// SPDX-License-Identifier: AGPL-3.0-only
// Shows and Music, web and desktop: destinations in the nav ahead of the media they'll hold, as on
// the TV (the owner, 2026-10-30). Each has its title as the other pages head theirs and a calm
// note, with Movies to go to instead.
import { Button, cn, EmptyState } from '@highsea-tv/ui-web'
import { gutter, webHref } from './shell.tsx'

const pages = {
  shows: {
    title: 'Shows',
    empty: 'Shows aren’t here yet',
    icon: 'series',
    note: 'Shows come to highsea in a later version. Until then, the server’s movies are in Movies.',
  },
  music: {
    title: 'Music',
    empty: 'Music isn’t here yet',
    icon: 'music',
    note: 'Music comes to highsea in a later version. Until then, the server’s movies are in Movies.',
  },
} as const

export function WebComing({ kind }: { kind: keyof typeof pages }) {
  const page = pages[kind]
  return (
    <main className={cn('mx-auto w-full grid max-w-[1680px] gap-6 pt-6 pb-16', gutter)}>
      <h1 className="text-heading">{page.title}</h1>
      <div className="grid min-h-[50vh] place-items-center">
        <EmptyState
          icon={page.icon}
          title={page.empty}
          action={
            <Button icon="movie" asChild>
              <a href={webHref('/movies')}>Movies</a>
            </Button>
          }
        >
          {page.note}
        </EmptyState>
      </div>
    </main>
  )
}

// SPDX-License-Identifier: AGPL-3.0-only
// The player's address (C5). Until 4.2b brings the player, Play leads here and says so, with the
// way back to the title.
import { useItem } from '@highsea-tv/client/data'
import { useT } from '@highsea-tv/i18n/react'
import { Button, EmptyState } from '@highsea-tv/ui-web'
import { useParams } from 'wouter'
import { player as messages } from './messages.ts'
import { href } from './shell.tsx'

export function WebPlayer() {
  const t = useT(messages)
  const { id } = useParams<{ id: string }>()
  const item = useItem(Number(id))
  const title = item.data?.item.title ?? ''
  return (
    <main className="grid min-h-screen place-items-center bg-bg px-4 text-text">
      <EmptyState
        icon="play"
        title={t('title')}
        action={
          <Button variant="primary" icon="arrow-left" asChild>
            <a href={href(`/movies/${id}`)}>{t('back', { title })}</a>
          </Button>
        }
      >
        {t('body', { title })}
      </EmptyState>
    </main>
  )
}

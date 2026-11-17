'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// An admin path no page answers yet, inside the shell: most are pages later checkpoints build; and
// a path nothing answers at all, in the sign-in card outside it. Drawn with the library's native
// renderer since D3 (one-client-platform-d.md).
import { useT } from '@highsea-tv/i18n/react'
import { Button, EmptyState } from '@highsea-tv/ui/native'
import { Card } from './auth-card.tsx'
import { shell } from './messages.ts'
import { AdminPage } from './shell.tsx'

export function AdminNotFound() {
  const t = useT(shell)
  return (
    <AdminPage title={t('notFound.title')}>
      <EmptyState
        icon="search"
        title={t('notFound.title')}
        action={
          <Button variant="primary" href="/">
            {t('notFound.home')}
          </Button>
        }
      >
        {t('notFound.body')}
      </EmptyState>
    </AdminPage>
  )
}

/** A path nothing answers, outside the admin (the server's root not-found page). */
export function NotFoundCard() {
  const t = useT(shell)
  return (
    <Card>
      <EmptyState
        size="sm"
        icon="search"
        title={t('notFound.nowhere')}
        action={
          <Button variant="primary" href="/">
            {t('notFound.home')}
          </Button>
        }
      >
        {t('notFound.nowhereBody')}
      </EmptyState>
    </Card>
  )
}

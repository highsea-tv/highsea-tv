'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// An admin path no page answers yet, inside the shell: most are pages later checkpoints build.
import { useT } from '@highsea-tv/i18n/react'
import { Button, EmptyState } from '@highsea-tv/ui-web'
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
          <Button variant="primary" asChild>
            <a href="/">{t('notFound.home')}</a>
          </Button>
        }
      >
        {t('notFound.body')}
      </EmptyState>
    </AdminPage>
  )
}

// SPDX-License-Identifier: AGPL-3.0-only
import { createT } from '@highsea/i18n'
import { Button, EmptyState } from '@highsea/ui-web'
import { shell } from '../src/admin/messages.ts'
import { AdminShell } from '../src/admin/shell.tsx'

const t = createT(shell)

export default function NotFound() {
  return (
    <AdminShell title={t('notFound.title')}>
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
    </AdminShell>
  )
}

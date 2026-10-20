'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// The dashboard's place, until its widgets arrive (checkpoint 3): proof that the admin reaches
// the server through the API.
import { useT } from '@highsea/i18n/react'
import { useQuery } from '@highsea/sdk/react'
import { Button, EmptyState } from '@highsea/ui-web'
import { shell } from './messages.ts'

export function DashboardPlaceholder() {
  const t = useT(shell)
  const info = useQuery('server', (c) => c.system.publicInfo(), ['server.updated'])
  if (info.status === 'loading')
    return <p className="text-caption text-text-3">{t('dashboard.loading')}</p>
  if (info.status === 'error')
    return (
      <EmptyState
        tone="error"
        icon="alert"
        title={t('dashboard.error')}
        action={<Button onClick={info.refetch}>Try again</Button>}
      >
        {info.error.message}
      </EmptyState>
    )
  return (
    <EmptyState icon="dashboard" title={t('dashboard.soon')}>
      {t('dashboard.soonBody', { name: info.data.name })}
    </EmptyState>
  )
}

// SPDX-License-Identifier: AGPL-3.0-only
// A path outside the admin that doesn't exist, such as a mistyped link page.
import { createT } from '@highsea-tv/i18n'
import { Button, EmptyState } from '@highsea-tv/ui-web'
import { Card } from '../src/admin/auth-card.tsx'
import { shell } from '../src/admin/messages.ts'

const t = createT(shell)

export default function NotFound() {
  return (
    <Card>
      <EmptyState
        size="sm"
        icon="search"
        title={t('notFound.nowhere')}
        action={
          <Button variant="primary" asChild>
            <a href="/">{t('notFound.home')}</a>
          </Button>
        }
      >
        {t('notFound.nowhereBody')}
      </EmptyState>
    </Card>
  )
}

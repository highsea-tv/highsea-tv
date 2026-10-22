// SPDX-License-Identifier: AGPL-3.0-only
// The admin's answer to a user, at every admin address (ADR 0032, decision 9): a server component
// that loads no admin data, says where to watch, and offers Sign out. It tells them nothing the
// sign-in page doesn't already: that this is a highsea server. Once the web client exists
// (Phase 4), it links there.
import { createT } from '@highsea-tv/i18n'
import { Card, Heading } from './auth-card.tsx'
import { refusal } from './refusal-messages.ts'
import { SignOutButton } from './sign-out-button.tsx'

const t = createT(refusal)

export function Refusal() {
  return (
    <Card>
      <Heading title={t('title')} detail={t('body')} />
      <SignOutButton label={t('signOut')} failed={t('signOutFailed')} />
    </Card>
  )
}

// SPDX-License-Identifier: AGPL-3.0-only
// What a user sees at every admin address (ADR 0032, decision 9): the admin is the owner's and
// admins' only. It loads no admin data and says nothing an outsider couldn't learn from the
// sign-in page. Once the web client exists (Phase 4), it links there.
import { Button } from '@highsea-tv/ui-web'
import { useEffect } from 'react'
import { useLocation } from 'wouter'
import { Card, Heading } from './login.tsx'

export function Refusal() {
  const [, navigate] = useLocation()
  useEffect(() => {
    document.title = 'highsea'
  }, [])
  return (
    <Card>
      <Heading
        title="This is where the server’s owner and admins run it"
        detail="To watch, use a highsea app."
      />
      <Button onClick={() => navigate('/login')}>Sign out</Button>
    </Card>
  )
}

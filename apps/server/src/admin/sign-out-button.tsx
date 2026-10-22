'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Sign out, outside the shell: signs this browser out, then loads the sign-in page afresh.
import { useAction } from '@highsea-tv/sdk/react'
import { Button } from '@highsea-tv/ui-web'
import { useState } from 'react'
import { FormAlert } from './auth-card.tsx'

export function SignOutButton({ label, failed }: { label: string; failed: string }) {
  const signOut = useAction((c) => c.auth.signOut())
  const [error, setError] = useState(false)
  return (
    <>
      {error && <FormAlert>{failed}</FormAlert>}
      <Button
        icon="sign-out"
        loading={signOut.pending}
        onClick={() =>
          signOut.run().then(
            () => window.location.assign('/login'),
            () => setError(true),
          )
        }
      >
        {label}
      </Button>
    </>
  )
}

// SPDX-License-Identifier: AGPL-3.0-only
// Connect a device on the web and desktop (prototype-gaps.md › 4.1; connectivity.md#tv-pairing):
// the page the TV's code screen sends people to. The server's `/link?code=…` opens the question at
// once; the prototype's hash can't carry a query (the toolbar's state is there), so it's
// `/web/link/{code}`. A computer has no camera to point, so it asks for the code, then the same
// question the phone asks, in the same words.
import { Button, EmptyState, Field, Icon, Input } from '@highsea-tv/ui-web'
import { type FormEvent, useState } from 'react'
import { useLocation, useParams } from 'wouter'
import { normalCode, waiting } from '../client/pairing.ts'
import { gutter, webHref } from './shell.tsx'

function Page({ children }: { children: React.ReactNode }) {
  return (
    <main
      className={`mx-auto grid w-full max-w-[560px] grid-cols-[minmax(0,1fr)] content-start gap-6 py-12 ${gutter}`}
    >
      {children}
    </main>
  )
}

/** Type the code the TV shows. */
export function WebLink() {
  const [, navigate] = useLocation()
  const [code, setCode] = useState('')
  return (
    <Page>
      <div className="grid gap-2">
        <h1 className="text-heading">Connect a device</h1>
        <p className="text-body text-text-2">
          Type the code your TV or app shows. It works for 10 minutes.
        </p>
      </div>
      <form
        className="grid gap-4"
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          navigate(`/link/${normalCode(code)}`)
        }}
      >
        <Field label="Code">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoCapitalize="characters"
            autoComplete="one-time-code"
            spellCheck={false}
            placeholder="KQ7-4PM"
            className="h-12 font-mono text-[20px] tracking-[0.12em]"
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" disabled={normalCode(code).length < 6}>
            Continue
          </Button>
        </div>
      </form>
    </Page>
  )
}

/** The question, then the device signed in. */
export function WebLinkConfirm() {
  const { code = '' } = useParams<{ code?: string }>()
  const [, navigate] = useLocation()
  const [state, setState] = useState<'asking' | 'signing' | 'done'>('asking')

  if (normalCode(code) !== normalCode(waiting.code))
    return (
      <Page>
        <div className="py-8">
          <EmptyState
            icon="tv"
            tone="error"
            title="That code isn’t waiting"
            action={
              <Button variant="primary" onClick={() => navigate('/link')}>
                Try again
              </Button>
            }
          >
            Check it on the TV, or start again there for a new one.
          </EmptyState>
        </div>
      </Page>
    )

  if (state === 'done')
    return (
      <Page>
        <div className="grid gap-6 py-8">
          <EmptyState
            icon="success"
            title={`${waiting.device} is signed in`}
            action={
              <Button variant="primary" asChild>
                <a href={webHref('/')}>Done</a>
              </Button>
            }
          >
            It opens Home on the TV now. Sign it out from Settings › Devices whenever you like.
          </EmptyState>
        </div>
      </Page>
    )

  return (
    <Page>
      <div className="grid justify-items-start gap-3">
        <span className="grid size-14 place-items-center rounded-full bg-accent-soft text-accent-text">
          <Icon name="tv" size={28} />
        </span>
        <h1 className="text-heading">Sign in {waiting.device}?</h1>
        <p className="text-body text-text-2">
          {waiting.app} at <span className="font-mono">{waiting.address}</span> signs in as you. It
          stays signed in until you sign it out from Settings › Devices.
        </p>
        <p className="text-caption text-text-3">
          Code <span className="font-mono">{waiting.code}</span> · it expires in 10 minutes.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          loading={state === 'signing'}
          onClick={() => {
            setState('signing')
            setTimeout(() => setState('done'), 800)
          }}
        >
          Sign it in
        </Button>
        <Button variant="ghost" onClick={() => navigate('/')}>
          Cancel
        </Button>
      </div>
    </Page>
  )
}

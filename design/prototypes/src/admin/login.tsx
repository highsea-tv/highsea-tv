// SPDX-License-Identifier: AGPL-3.0-only
// A18 Login (docs/product/login.md). Username and password, then a 6-digit code
// when the account has two-factor on, or the server's single sign-on provider. The OIDC redirect
// is simulated: a short wait stands in for the round trip to the provider.
import { Button, EmptyState, Field, Icon, Input, Lockup, Skeleton } from '@highsea-tv/ui-web'
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import { useAction, useQuery } from '../mock/hooks.tsx'
import type { ApiError } from '../mock/server.ts'

export function Card({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-screen grid-cols-[minmax(0,1fr)] place-items-center bg-bg p-4 text-text">
      <div className="grid w-full max-w-[24rem] gap-6">
        <Lockup size={20} className="justify-self-center" />
        <section className="grid gap-5 rounded-lg border border-line bg-s1 p-6 shadow-2">
          {children}
        </section>
      </div>
    </main>
  )
}

export function Heading({ title, detail }: { title: string; detail?: ReactNode }) {
  return (
    <div className="grid gap-1">
      <h1 className="text-title">{title}</h1>
      {detail && <p className="text-caption text-text-2">{detail}</p>}
    </div>
  )
}

function FormAlert({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-sm bg-badge-danger-bg px-3 py-2 text-badge-danger text-caption"
    >
      <Icon name="alert" size={16} className="mt-px shrink-0" />
      {children}
    </p>
  )
}

export function Login() {
  const [, navigate] = useLocation()
  const info = useQuery('public-info', (c) => c.system.publicInfo())
  const [username, setUsername] = useState('ines')
  const [password, setPassword] = useState('')
  const [challenge, setChallenge] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<ApiError | null>(null)
  const [sso, setSso] = useState(false)
  const codeInput = useRef<HTMLInputElement>(null)
  const passwordInput = useRef<HTMLInputElement>(null)

  const signIn = useAction((c, u: string, p: string) => c.auth.signIn({ username: u, password: p }))
  const verify = useAction((c, ch: string, k: string) =>
    c.auth.verifyTwoFactor({ challenge: ch, code: k }),
  )

  useEffect(() => {
    document.title = 'Sign in · highsea'
  }, [])

  useEffect(() => {
    if (challenge) codeInput.current?.focus()
  }, [challenge])

  // the username is remembered, so the password is the first thing to type
  useEffect(() => {
    if (info.status === 'success') passwordInput.current?.focus()
  }, [info.status])

  // the simulated provider round trip
  useEffect(() => {
    if (!sso) return
    const t = setTimeout(() => navigate('/'), 1400)
    return () => clearTimeout(t)
  }, [sso, navigate])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      const result = await signIn.run(username, password)
      if (result.status === 'two-factor') setChallenge(result.challenge)
      else navigate('/')
    } catch (err) {
      setError(err as ApiError)
      passwordInput.current?.focus()
    }
  }

  const submitCode = async (value: string) => {
    if (!challenge) return
    setError(null)
    try {
      await verify.run(challenge, value)
      navigate('/')
    } catch (err) {
      setError(err as ApiError)
      setCode('')
      codeInput.current?.focus()
    }
  }

  if (info.status === 'loading')
    return (
      <Card>
        <div className="grid gap-4" aria-busy>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-9" />
        </div>
      </Card>
    )

  if (info.status === 'error')
    return (
      <Card>
        <EmptyState
          size="sm"
          tone="error"
          title="Can’t reach the server"
          action={<Button onClick={info.refetch}>Try again</Button>}
        >
          {info.error.message}
        </EmptyState>
      </Card>
    )

  const server = info.data

  if (sso)
    return (
      <Card>
        <Heading title={`Signing in with ${server.auth.oidc?.name}`} />
        <p className="flex items-center gap-2 text-caption text-text-2" role="status">
          <Icon name="loading" size={16} className="animate-spin" />
          Waiting for {server.auth.oidc?.name} to confirm it’s you…
        </p>
        <Button variant="ghost" onClick={() => setSso(false)}>
          Cancel
        </Button>
      </Card>
    )

  if (challenge)
    return (
      <Card>
        <Heading
          title="Enter your code"
          detail="Open your authenticator app and type the 6-digit code for highsea."
        />
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            submitCode(code)
          }}
        >
          <Field label="Code" error={error?.status === 401 ? error.message : undefined}>
            <Input
              ref={codeInput}
              value={code}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              className="font-mono tracking-[0.3em]"
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, '').slice(0, 6)
                setCode(value)
                // six digits submit on their own
                if (value.length === 6) submitCode(value)
              }}
            />
          </Field>
          {error && error.status !== 401 && <FormAlert>{error.message}</FormAlert>}
          <Button
            type="submit"
            variant="primary"
            loading={verify.pending}
            disabled={code.length < 6}
          >
            Verify
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setChallenge(null)
              setCode('')
              setError(null)
            }}
          >
            Use a different account
          </Button>
        </form>
      </Card>
    )

  return (
    <Card>
      <Heading title={`Sign in to ${server.name}`} />
      <form className="grid gap-4" onSubmit={submit} noValidate>
        <Field label="Username">
          <Input
            value={username}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            onChange={(e) => setUsername(e.target.value)}
          />
        </Field>
        <Field label="Password" error={error?.status === 401 ? error.message : undefined}>
          <Input
            ref={passwordInput}
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {error && error.status !== 401 && <FormAlert>{error.message}</FormAlert>}
        <Button type="submit" variant="primary" loading={signIn.pending}>
          Sign in
        </Button>
      </form>
      {server.auth.oidc && (
        <>
          <div className="flex items-center gap-3 text-caption text-text-3">
            <span className="h-px flex-1 bg-line" />
            or
            <span className="h-px flex-1 bg-line" />
          </div>
          {/* it wraps rather than widening a phone at 200% text */}
          <Button
            icon="shield"
            className="h-auto min-h-9 whitespace-normal py-1.5"
            onClick={() => setSso(true)}
          >
            Sign in with {server.auth.oidc.name}
          </Button>
        </>
      )}
      <p className="text-caption text-text-3">
        Forgot your password? The server’s owner can reset it from Settings › Users.
      </p>
    </Card>
  )
}

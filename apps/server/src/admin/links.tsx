'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// The pages a link opens: an invite or a password reset (users-devices.md § Invites), and the
// approval of a TV's sign-in code (connectivity.md § Pairing, after RFC 8628 § 3.3: the person
// types the code on a device that's already signed in). Pairing never asks for a second factor:
// the approving device is signed in already (ADR 0024).
import { useT } from '@highsea/i18n/react'
import type { ApiError } from '@highsea/sdk'
import { useAction, useQuery } from '@highsea/sdk/react'
import { Button, EmptyState, Field, Input, Skeleton } from '@highsea/ui-web'
import { type FormEvent, useState } from 'react'
import { Card, FormAlert, Heading } from './auth-card.tsx'
import { login as messages } from './login-messages.ts'
import { useRelative } from './time.ts'

function Loading() {
  return (
    <Card>
      <div className="grid gap-4" aria-busy>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
        <Skeleton className="h-9" />
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------- invite and reset

export function AccountLinkPage({ token }: { token: string }) {
  const t = useT(messages)
  const link = useQuery(`link:${token}`, (c) => c.links.get({ params: { token } }))
  const info = useQuery('public-info', (c) => c.system.publicInfo())
  const [username, setUsername] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<{ username?: string; password?: string; confirm?: string }>(
    {},
  )
  const [alert, setAlert] = useState<string | null>(null)
  const accept = useAction((c, body: { password: string; username?: string }) =>
    c.links.accept({ params: { token }, body }),
  )

  if (link.status === 'loading') return <Loading />
  if (link.status === 'error')
    return (
      <Card>
        <EmptyState size="sm" icon="clock" title={t('link.deadTitle')}>
          {(link.error as ApiError).status === 404 ? t('link.deadDetail') : link.error.message}
        </EmptyState>
      </Card>
    )

  const { kind, displayName, serverName } = link.data
  const invite = kind === 'invite'
  const name = username ?? link.data.username
  const oidc = info.data?.auth.oidc

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setAlert(null)
    const found: typeof errors = {}
    if (password.length < 10) found.password = t('link.short')
    else if (confirm !== password) found.confirm = t('link.mismatch')
    setErrors(found)
    if (Object.keys(found).length) return
    try {
      await accept.run({
        password,
        username: invite && name !== link.data.username ? name : undefined,
      })
      // signed in by the cookie the answer set: a fresh load, so the server components see it
      window.location.assign('/')
    } catch (err) {
      const e = err as ApiError
      const field = (e.details as { field?: string } | undefined)?.field
      if (e.status === 409 || field === 'username') setErrors({ username: e.message })
      else if (field === 'password') setErrors({ password: e.message })
      else setAlert(e.message)
    }
  }

  return (
    <Card>
      <Heading
        title={invite ? t('link.inviteTitle', { server: serverName }) : t('link.resetTitle')}
        detail={
          invite
            ? t('link.inviteDetail', { name: displayName })
            : t('link.resetDetail', { name: displayName })
        }
      />
      <form className="grid gap-4" onSubmit={submit} noValidate>
        {invite ? (
          <Field label={t('link.username')} hint={t('link.usernameHint')} error={errors.username}>
            <Input
              value={name}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
            />
          </Field>
        ) : (
          // password managers file the new password under the right account (WHATWG autofill)
          <input type="hidden" autoComplete="username" value={link.data.username} readOnly />
        )}
        <Field label={t('link.password')} hint={t('link.passwordHint')} error={errors.password}>
          <Input
            type="password"
            value={password}
            autoComplete="new-password"
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label={t('link.confirm')} error={errors.confirm}>
          <Input
            type="password"
            value={confirm}
            autoComplete="new-password"
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        {alert && <FormAlert>{alert}</FormAlert>}
        <Button
          type="submit"
          variant="primary"
          loading={accept.pending}
          className="h-auto min-h-9 whitespace-normal py-1.5"
        >
          {invite ? t('link.join') : t('link.reset')}
        </Button>
      </form>
      {invite && oidc && (
        <Button
          icon="shield"
          className="h-auto min-h-9 whitespace-normal py-1.5"
          onClick={() =>
            window.location.assign(`/api/v1/auth/oidc/start?invite=${encodeURIComponent(token)}`)
          }
        >
          {t('link.withOidc', { provider: oidc.name })}
        </Button>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------- pairing

/** Codes are typed as the TV shows them (KQ7-4PM); the server ignores case and the dash. */
const tidy = (code: string) => code.toUpperCase().replace(/[^A-Z0-9-]/g, '')

export function Pair({ code: initial }: { code?: string }) {
  const t = useT(messages)
  const { relative } = useRelative()
  const [typed, setTyped] = useState(initial ? tidy(initial) : '')
  const [code, setCode] = useState(initial ? tidy(initial) : null)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const request = useQuery(`pairing:${code ?? ''}`, (c) =>
    code ? c.auth.pairingRequest({ params: { code } }) : Promise.resolve(null),
  )
  const approve = useAction((c, value: string) =>
    c.auth.approvePairing({ params: { code: value } }),
  )

  const reset = () => {
    setDone(null)
    setCode(null)
    setTyped('')
    setError(null)
  }

  if (done)
    return (
      <Card>
        <Heading title={t('pair.done', { device: done })} detail={t('pair.doneDetail')} />
        <Button onClick={reset}>{t('pair.another')}</Button>
      </Card>
    )

  const waiting = code && request.status === 'success' ? request.data : null
  if (code && request.status === 'loading') return <Loading />

  if (waiting && code) {
    const { device, address, expiresAt } = waiting
    return (
      <Card>
        <Heading
          title={t('pair.confirmTitle', { device: device.name })}
          detail={t('pair.confirmDetail', {
            app: t(`client.${device.client}`),
            address,
          })}
        />
        <p className="text-caption text-text-3">
          {t('pair.expires', { time: relative(expiresAt) })}
        </p>
        {error && <FormAlert>{error}</FormAlert>}
        <div className="grid gap-2">
          <Button
            variant="primary"
            loading={approve.pending}
            onClick={() =>
              approve.run(code).then(
                () => setDone(device.name),
                (e: Error) => setError(e.message),
              )
            }
          >
            {t('pair.approve')}
          </Button>
          <Button variant="ghost" onClick={reset}>
            {t('cancel')}
          </Button>
        </div>
      </Card>
    )
  }

  const unknown =
    code && request.status === 'error'
      ? (request.error as ApiError).status === 404
        ? t('pair.unknown')
        : request.error.message
      : null

  return (
    <Card>
      <Heading title={t('pair.title')} detail={t('pair.detail')} />
      <form
        className="grid gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          if (typed.replace(/-/g, '').length < 6) return
          if (typed === code) request.refetch()
          else setCode(typed)
        }}
      >
        <Field label={t('pair.code')} error={unknown ?? undefined}>
          <Input
            value={typed}
            autoComplete="one-time-code"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={9}
            className="font-mono text-title tracking-[0.2em]"
            onChange={(e) => {
              setTyped(tidy(e.target.value))
              if (code) setCode(null)
            }}
          />
        </Field>
        <Button type="submit" variant="primary" disabled={typed.replace(/-/g, '').length < 6}>
          {t('pair.find')}
        </Button>
      </form>
    </Card>
  )
}

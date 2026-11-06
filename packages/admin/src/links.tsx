'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// The pages a link opens: an invite or a password reset (users-devices.md § Invites), and the
// approval of a TV's sign-in code (connectivity.md § Pairing, after RFC 8628 § 3.3: the person
// types the code on a device that's already signed in). Pairing never asks for a second factor:
// the approving device is signed in already (ADR 0024). Drawn with the library's native renderer
// since D3 (one-client-platform-d.md): a form's submit is its primary button and Enter in its
// fields (`onSubmitEditing`).
import { useT } from '@highsea-tv/i18n/react'
import type { ApiError } from '@highsea-tv/sdk'
import { useAction, useQuery } from '@highsea-tv/sdk/react'
import { Button, EmptyState, Field, Input, Skeleton, Text, tokens } from '@highsea-tv/ui/native'
import { useState } from 'react'
import { TextInput, View } from 'react-native'
import { Card, FormAlert, Heading } from './auth-card.tsx'
import { login as messages } from './login-messages.ts'
import { useLoad } from './navigation.tsx'
import { useRelative } from './time.ts'

const s = tokens.space
const title = tokens.text.web.title

function Loading() {
  return (
    <Card>
      <View aria-busy style={{ gap: s['4'] }}>
        <Skeleton width={192} height={24} />
        <Skeleton height={40} />
        <Skeleton height={40} />
        <Skeleton height={36} />
      </View>
    </Card>
  )
}

// ---------------------------------------------------------------- invite and reset

export function AccountLinkPage({ token }: { token: string }) {
  const t = useT(messages)
  const load = useLoad()
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

  const submit = async () => {
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
      load('/')
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
      <View style={{ gap: s['4'] }}>
        {invite ? (
          <Field label={t('link.username')} hint={t('link.usernameHint')} error={errors.username}>
            <Input
              value={name}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              onChangeText={(v) => setUsername(v.toLowerCase())}
              onSubmitEditing={submit}
            />
          </Field>
        ) : (
          // password managers file the new password under the right account (WHATWG autofill):
          // a username field that isn't shown, as Chromium's guidance has it
          // (https://www.chromium.org/developers/design-documents/create-amazing-password-forms/)
          <View aria-hidden style={{ display: 'none' }}>
            <TextInput
              value={link.data.username}
              autoComplete="username"
              editable={false}
              tabIndex={-1}
            />
          </View>
        )}
        <Field label={t('link.password')} hint={t('link.passwordHint')} error={errors.password}>
          <Input
            secureTextEntry
            value={password}
            autoComplete="new-password"
            onChangeText={setPassword}
            onSubmitEditing={submit}
          />
        </Field>
        <Field label={t('link.confirm')} error={errors.confirm}>
          <Input
            secureTextEntry
            value={confirm}
            autoComplete="new-password"
            onChangeText={setConfirm}
            onSubmitEditing={submit}
          />
        </Field>
        {alert && <FormAlert>{alert}</FormAlert>}
        <Button variant="primary" block loading={accept.pending} onPress={submit}>
          {invite ? t('link.join') : t('link.reset')}
        </Button>
      </View>
      {invite && oidc && (
        <Button
          icon="shield"
          block
          onPress={() => load(`/api/v1/auth/oidc/start?invite=${encodeURIComponent(token)}`)}
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
        <Button block onPress={reset}>
          {t('pair.another')}
        </Button>
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
        <Text variant="caption" color="text-3">
          {t('pair.expires', { time: relative(expiresAt) })}
        </Text>
        {error && <FormAlert>{error}</FormAlert>}
        <View style={{ gap: s['2'] }}>
          <Button
            variant="primary"
            block
            loading={approve.pending}
            onPress={() =>
              approve.run(code).then(
                () => setDone(device.name),
                (e: Error) => setError(e.message),
              )
            }
          >
            {t('pair.approve')}
          </Button>
          <Button variant="ghost" block onPress={reset}>
            {t('cancel')}
          </Button>
        </View>
      </Card>
    )
  }

  const find = () => {
    setError(null)
    if (typed.replace(/-/g, '').length < 6) return
    if (typed === code) request.refetch()
    else setCode(typed)
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
      <View style={{ gap: s['4'] }}>
        <Field label={t('pair.code')} error={unknown ?? undefined}>
          <Input
            value={typed}
            autoComplete="one-time-code"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={9}
            mono
            // the web's text-title and tracking-[0.2em]
            style={{
              fontSize: title.size,
              letterSpacing: title.size * 0.2,
            }}
            onChangeText={(v) => {
              setTyped(tidy(v))
              if (code) setCode(null)
            }}
            onSubmitEditing={find}
          />
        </Field>
        <Button
          variant="primary"
          block
          disabled={typed.replace(/-/g, '').length < 6}
          onPress={find}
        >
          {t('pair.find')}
        </Button>
      </View>
    </Card>
  )
}

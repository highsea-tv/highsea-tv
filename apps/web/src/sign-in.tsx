// SPDX-License-Identifier: AGPL-3.0-only
// C1's sign-in step on the web (connectivity.md#web-and-mobile), from the prototype's
// client/connect-flow.tsx: the web app is served by its server, so there's no server to choose,
// only this one's sign-in. A username and password set the same session cookie the admin's
// sign-in does (the plan's answer 2), then a 6-digit code or a recovery code when the account
// has two-step verification. Single sign-on goes through the server's OIDC start and comes back
// to `/`, which sends a User here. Passkeys and setting up two-step verification stay on the
// admin's sign-in page, which this one links to and which comes back here.
//
// In the desktop app (4.4a) the server was chosen in C1, which Back returns to. The sign-in sends
// this computer as its device, so the server answers with a device token the app keeps in the
// keychain (host.ts), and single sign-on opens in the system browser and comes back through
// `highsea://oidc` (RFC 8252; apps/desktop/src-tauri/src/oidc.rs).
import type { SignInResult } from '@highsea-tv/api-contract'
import { usePublicInfo } from '@highsea-tv/client/data'
import { useT } from '@highsea-tv/i18n/react'
import { ApiError } from '@highsea-tv/sdk'
import { useAction } from '@highsea-tv/sdk/react'
import { Button, Field, Icon, Input, Lockup, Mark, Skeleton } from '@highsea-tv/ui-web'
import { openUrl } from '@tauri-apps/plugin-opener'
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { useDesktop } from './desktop/root.tsx'
import { desktop } from './host.ts'
import {
  connect as connectMessages,
  desktop as desktopMessages,
  signIn as messages,
} from './messages.ts'
import { href, useServerAddress } from './shell.tsx'

type Step =
  | { kind: 'form' }
  | { kind: 'code'; challenge: string; recovery: boolean }
  | { kind: 'setup' }
  | { kind: 'sso' }

const reasonOf = (e: unknown) =>
  ((e as ApiError).details as { reason?: string } | undefined)?.reason

function Alert({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-sm bg-badge-danger-bg px-3 py-2 text-badge-danger text-caption"
    >
      <Icon name="alert" size={16} className="mt-px shrink-0" />
      <span>{children}</span>
    </p>
  )
}

function Card({
  title,
  children,
  onBack,
}: {
  title: string
  children: ReactNode
  /** The desktop app: back to Choose a server. */
  onBack?: () => void
}) {
  const c = useT(connectMessages)
  return (
    <main className="grid min-h-screen place-items-center bg-bg p-4 text-text">
      <div className="grid w-full max-w-[28rem] gap-6">
        <Lockup size={20} className="justify-self-center" />
        <section
          aria-labelledby="sign-in-title"
          className="grid gap-5 rounded-lg border border-line bg-s1 px-6 py-5 shadow-2"
        >
          <div className="flex items-center gap-2">
            {onBack && (
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                icon="arrow-left"
                aria-label={c('back')}
                onClick={onBack}
                className="-ms-2"
              />
            )}
            <h1 id="sign-in-title" className="text-title">
              {title}
            </h1>
          </div>
          {children}
        </section>
      </div>
    </main>
  )
}

export function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const t = useT(messages)
  const d = useT(desktopMessages)
  const app = useDesktop()
  const address = useServerAddress()
  const info = usePublicInfo()
  const [ssoError, setSsoError] = useState<string | null>(null)
  const [step, setStep] = useState<Step>({ kind: 'form' })
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<ApiError | null>(null)
  const codeInput = useRef<HTMLInputElement>(null)
  const passwordInput = useRef<HTMLInputElement>(null)

  const device = app?.device ?? undefined
  const signIn = useAction((c) =>
    c.auth.signIn({ body: { username, password, ...(device ? { device } : {}) } }),
  )
  const verify = useAction((c, challenge: string, value: string) =>
    c.auth.twoFactor({ body: { challenge, code: value } }),
  )

  useEffect(() => {
    if (step.kind === 'code') codeInput.current?.focus()
  }, [step])

  // a server that isn't set up has nobody to sign in yet: its owner starts at setup
  const unset = info.status === 'success' && !info.data.setupComplete
  useEffect(() => {
    if (!unset) return
    // the app opens the server's setup in the browser, where its owner finishes it
    if (app) void openUrl(`${app.current.base}/setup`)
    else window.location.assign('/setup')
  }, [unset, app])

  // a browser sign-in in the app comes back through `highsea://oidc`
  const provider = info.status === 'success' ? (info.data.auth.oidc?.name ?? '') : ''
  const name = info.status === 'success' ? info.data.name : ''
  useEffect(() => {
    if (!app || step.kind !== 'sso') return
    const off = desktop.onOidc((done) => {
      if (done.status === 'signedIn') return onSignedIn()
      const known = ['oidc-unknown', 'oidc-denied', 'challenge-expired', 'keychain']
      setSsoError(
        d(
          known.includes(done.reason)
            ? (`oidc.${done.reason}` as 'oidc.oidc-unknown')
            : 'oidc.other',
          {
            name,
            provider,
          },
        ),
      )
      setStep({ kind: 'form' })
    })
    return () => {
      void off.then((f) => f())
    }
  }, [app, step.kind, onSignedIn, d, name, provider])

  const after = (result: SignInResult) => {
    setError(null)
    setCode('')
    if (result.status === 'two-factor')
      setStep({ kind: 'code', challenge: result.challenge, recovery: false })
    else if (result.status === 'two-factor-setup') setStep({ kind: 'setup' })
    else onSignedIn()
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      after(await signIn.run())
    } catch (err) {
      setError(err as ApiError)
      passwordInput.current?.focus()
    }
  }

  const submitCode = async (e: FormEvent) => {
    e.preventDefault()
    if (step.kind !== 'code') return
    setError(null)
    try {
      after(await verify.run(step.challenge, code))
    } catch (err) {
      setError(err as ApiError)
      setCode('')
      // an expired challenge can't take another code: start again from the password
      if (reasonOf(err) === 'challenge-expired') setStep({ kind: 'form' })
      else codeInput.current?.focus()
    }
  }

  if (info.status === 'loading')
    return (
      <Card title={t('signIn')}>
        <div aria-busy className="grid gap-4">
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
        </div>
      </Card>
    )
  if (info.status === 'error')
    return (
      <Card title={t('signIn')} onBack={app?.choose}>
        <Alert>
          {info.error instanceof ApiError && info.error.code === 'unavailable'
            ? t('unavailable', { name: address })
            : t('failed', { message: info.error.message })}
        </Alert>
        <Button variant="primary" icon="refresh" onClick={info.refetch}>
          {t('signIn')}
        </Button>
      </Card>
    )

  const server = info.data
  const fieldError = error?.status === 401 ? error.message : undefined
  const alert = error && error.status !== 401 ? error.message : undefined

  if (step.kind === 'sso')
    return (
      <Card title={t('oidc', { provider: server.auth.oidc?.name ?? '' })}>
        <p className="flex items-center gap-2 text-caption text-text-2" role="status">
          <Icon name="loading" size={16} className="animate-spin" />
          {app
            ? d('oidcBrowser', { provider: server.auth.oidc?.name ?? '' })
            : t('oidcWait', { provider: server.auth.oidc?.name ?? '' })}
        </p>
        {app && (
          <Button variant="ghost" onClick={() => setStep({ kind: 'form' })}>
            {d('oidcCancel')}
          </Button>
        )}
      </Card>
    )

  if (step.kind === 'setup')
    return (
      <Card title={t('setupTitle')}>
        <p className="text-body text-text-2">{t('setupDetail', { name: server.name })}</p>
        {app ? (
          <Button
            variant="primary"
            icon="external"
            onClick={() => void openUrl(`${app.current.base}/login`)}
          >
            {d('openSetup')}
          </Button>
        ) : (
          <Button variant="primary" asChild>
            <a href={`/login?next=${encodeURIComponent(href('/'))}`}>{t('setupAction')}</a>
          </Button>
        )}
        <Button variant="ghost" onClick={() => setStep({ kind: 'form' })}>
          {t('otherAccount')}
        </Button>
      </Card>
    )

  if (step.kind === 'code') {
    const recovery = step.recovery
    return (
      <Card title={recovery ? t('recoveryTitle') : t('codeTitle')}>
        <p className="text-body text-text-2">{recovery ? t('recoveryDetail') : t('codeDetail')}</p>
        <form className="grid gap-4" onSubmit={submitCode} noValidate>
          <Field label={recovery ? t('recoveryLabel') : t('codeLabel')} error={fieldError}>
            <Input
              ref={codeInput}
              value={code}
              onChange={(e) =>
                setCode(
                  recovery
                    ? e.target.value.toUpperCase()
                    : e.target.value.replace(/\D/g, '').slice(0, 6),
                )
              }
              inputMode={recovery ? 'text' : 'numeric'}
              autoComplete={recovery ? 'off' : 'one-time-code'}
              autoCapitalize={recovery ? 'characters' : 'none'}
              spellCheck={false}
              className={recovery ? 'font-mono tracking-[0.15em]' : 'font-mono tracking-[0.3em]'}
            />
          </Field>
          {alert && <Alert>{alert}</Alert>}
          <Button
            type="submit"
            variant="primary"
            loading={verify.pending}
            disabled={recovery ? code.replace(/[^A-Z0-9]/g, '').length < 12 : code.length < 6}
          >
            {t('verify')}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setStep({ ...step, recovery: !recovery })
              setCode('')
              setError(null)
            }}
          >
            {recovery ? t('useApp') : t('useRecovery')}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setStep({ kind: 'form' })
              setCode('')
              setError(null)
            }}
          >
            {t('otherAccount')}
          </Button>
        </form>
      </Card>
    )
  }

  return (
    <Card title={t('title', { name: server.name })} onBack={app?.choose}>
      <div className="flex items-center gap-3 rounded-md bg-s2 px-3 py-2.5">
        <Mark size={28} />
        <span className="grid min-w-0">
          <span className="truncate font-semibold text-text text-ui">{server.name}</span>
          <span className="truncate font-mono text-caption text-text-3">{address}</span>
        </span>
      </div>
      {ssoError && <Alert>{ssoError}</Alert>}
      {server.auth.local ? (
        <form className="grid gap-4" onSubmit={submit} noValidate>
          <Field label={t('username')}>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
            />
          </Field>
          <Field label={t('password')} error={fieldError}>
            <Input
              ref={passwordInput}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </Field>
          {alert && <Alert>{alert}</Alert>}
          <Button type="submit" variant="primary" loading={signIn.pending}>
            {t('signIn')}
          </Button>
        </form>
      ) : (
        <p className="text-caption text-text-2">{t('localOff', { name: server.name })}</p>
      )}
      {server.auth.oidc && (
        <>
          {server.auth.local && (
            <p className="flex items-center gap-3 text-caption text-text-3 before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
              {t('or')}
            </p>
          )}
          {/* it wraps rather than widening a phone at 200% text */}
          <Button
            icon="shield"
            className="h-auto min-h-9 whitespace-normal py-1.5"
            onClick={() => {
              setSsoError(null)
              setStep({ kind: 'sso' })
              if (app)
                desktop.oidcStart().catch(() => {
                  setStep({ kind: 'form' })
                  setSsoError(d('oidc.other', { provider: server.auth.oidc?.name ?? '' }))
                })
              else window.location.assign('/api/v1/auth/oidc/start')
            }}
          >
            {t('oidc', { provider: server.auth.oidc.name })}
          </Button>
        </>
      )}
    </Card>
  )
}

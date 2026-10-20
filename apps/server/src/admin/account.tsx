'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// "Your account": a sheet from the sidebar and the palette, for every role. Your name, your
// password, two-step verification and passkeys. The prototype has no screen for these (the
// client's Profile lists them as "not in the prototype"); this follows the shell's sheet and the
// settings groups' look. Every change re-asks for the password (OWASP Authentication Cheat Sheet:
// re-authenticate before sensitive changes).
import type { Passkey, User } from '@highsea/api-contract'
import { useT } from '@highsea/i18n/react'
import { useAction, useQuery } from '@highsea/sdk/react'
import {
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  Field,
  Input,
  Sheet,
  SheetContent,
  Skeleton,
  toast,
} from '@highsea/ui-web'
import {
  browserSupportsWebAuthn,
  type PublicKeyCredentialCreationOptionsJSON,
  startRegistration,
} from '@simplewebauthn/browser'
import { type ReactNode, useEffect, useState } from 'react'
import { account } from './account-messages.ts'
import { useSignOut } from './shell.tsx'
import { useRelative } from './time.ts'
import { CodeInput, ConfirmPassword, Enrol, RecoveryCodes } from './two-factor.tsx'

const fail = (title: string) => (e: Error) => toast.error(title, { description: e.message })

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="grid gap-3 rounded-lg border border-line bg-s1 p-4">
      <h2 className="font-semibold text-text text-title">{title}</h2>
      {children}
    </section>
  )
}

export function AccountSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useT(account)
  const session = useQuery('session', (c) => c.auth.session(), ['users.updated'])
  const signOut = useSignOut()
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" title={t('title')} description={t('description')}>
        {session.status !== 'success' ? (
          <div aria-busy className="grid gap-3">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        ) : (
          <div className="grid gap-4">
            <Profile key={session.data.user.id} user={session.data.user} />
            {session.data.user.hasPassword && <Password />}
            <TwoFactor hasPassword={session.data.user.hasPassword} />
            <Passkeys />
            <Section title={t('signOut.title')}>
              <p className="text-caption text-text-2">{t('signOut.body')}</p>
              <Button icon="sign-out" className="justify-self-start" onClick={signOut}>
                {t('signOut.action')}
              </Button>
            </Section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

// ---------------------------------------------------------------- profile and password

function Profile({ user }: { user: User }) {
  const t = useT(account)
  const [name, setName] = useState(user.displayName)
  const [email, setEmail] = useState(user.email ?? '')
  const save = useAction((c) =>
    c.me.update({ body: { displayName: name.trim(), email: email.trim() || null } }),
  )
  const dirty = name !== user.displayName || email !== (user.email ?? '')
  return (
    <Section title={t('profile.title')}>
      <Field label={t('profile.name')}>
        <Input value={name} autoComplete="name" onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label={t('profile.email')} hint={t('profile.emailHint')}>
        <Input
          type="email"
          value={email}
          autoComplete="email"
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Button
        className="justify-self-start"
        disabled={!dirty || !name.trim()}
        loading={save.pending}
        onClick={() => save.run().then(() => toast.success(t('profile.saved')), fail(t('failed')))}
      >
        {t('profile.save')}
      </Button>
    </Section>
  )
}

function Password() {
  const t = useT(account)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [tried, setTried] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const change = useAction((c) => c.me.changePassword({ body: { current, password: next } }))
  const short = tried && next.length < 10 ? t('password.short') : undefined
  const mismatch = tried && !short && confirm !== next ? t('password.mismatch') : undefined
  return (
    <Section title={t('password.title')}>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          setTried(true)
          setError(undefined)
          if (next.length < 10 || confirm !== next) return
          change.run().then(
            () => {
              toast.success(t('password.changed'), { description: t('password.changedBody') })
              setCurrent('')
              setNext('')
              setConfirm('')
              setTried(false)
            },
            (e: Error & { status?: number }) =>
              e.status === 401 ? setError(e.message) : fail(t('failed'))(e),
          )
        }}
      >
        <Field label={t('password.current')} error={error}>
          <Input
            type="password"
            value={current}
            autoComplete="current-password"
            onChange={(e) => setCurrent(e.target.value)}
          />
        </Field>
        <Field label={t('password.new')} hint={t('password.newHint')} error={short}>
          <Input
            type="password"
            value={next}
            autoComplete="new-password"
            onChange={(e) => setNext(e.target.value)}
          />
        </Field>
        <Field label={t('password.confirm')} error={mismatch}>
          <Input
            type="password"
            value={confirm}
            autoComplete="new-password"
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        <Button
          type="submit"
          className="justify-self-start"
          disabled={!current || !next}
          loading={change.pending}
        >
          {t('password.change')}
        </Button>
      </form>
    </Section>
  )
}

// ---------------------------------------------------------------- two-step verification

type Step =
  | { kind: 'idle' }
  | { kind: 'password'; purpose: 'setup' | 'off' | 'codes' }
  | { kind: 'enrol'; secret: string; uri: string }
  | { kind: 'codes'; codes: string[] }

function TwoFactor({ hasPassword }: { hasPassword: boolean }) {
  const t = useT(account)
  const status = useQuery('two-factor', (c) => c.me.twoFactor(), ['users.updated'])
  const [step, setStep] = useState<Step>({ kind: 'idle' })
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | undefined>()
  const start = useAction((c) => c.me.startTwoFactor({ body: { password } }))
  const off = useAction((c) => c.me.disableTwoFactor({ body: { password } }))
  const codes = useAction((c) => c.me.recoveryCodes({ body: { password } }))
  const enable = useAction((c, value: string) => c.me.enableTwoFactor({ body: { code: value } }))

  const reset = () => {
    setStep({ kind: 'idle' })
    setPassword('')
    setCode('')
    setError(undefined)
  }
  const wrong = (e: Error & { status?: number }) =>
    e.status === 401 ? setError(e.message) : fail(t('failed'))(e)

  const confirm = (purpose: 'setup' | 'off' | 'codes') => {
    setError(undefined)
    if (purpose === 'setup')
      start.run().then((s) => {
        setError(undefined)
        setStep({ kind: 'enrol', ...s })
      }, wrong)
    if (purpose === 'off')
      off.run().then(() => {
        toast({ title: t('twoFactor.disabled') })
        reset()
      }, wrong)
    if (purpose === 'codes')
      codes.run().then((r) => {
        setError(undefined)
        setStep({ kind: 'codes', codes: r.recoveryCodes })
      }, wrong)
  }

  const verify = (value: string) =>
    enable.run(value).then(
      (r) => {
        toast.success(t('twoFactor.enabled'))
        setStep({ kind: 'codes', codes: r.recoveryCodes })
      },
      (e: Error & { status?: number }) => {
        setCode('')
        wrong(e)
      },
    )

  return (
    <Section title={t('twoFactor.title')}>
      {status.status !== 'success' ? (
        <Skeleton className="h-10" />
      ) : step.kind === 'codes' ? (
        <RecoveryCodes codes={step.codes} onDone={reset} />
      ) : step.kind === 'enrol' ? (
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            verify(code)
          }}
        >
          <Enrol secret={step.secret} uri={step.uri} />
          <Field label={t('twoFactor.code')} error={error}>
            <CodeInput value={code} onChange={setCode} onComplete={verify} />
          </Field>
          <div className="flex gap-2">
            <Button
              type="submit"
              variant="primary"
              disabled={code.length < 6}
              loading={enable.pending}
            >
              {t('twoFactor.verify')}
            </Button>
            <Button variant="ghost" onClick={reset}>
              {t('twoFactor.cancel')}
            </Button>
          </div>
        </form>
      ) : step.kind === 'password' ? (
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            confirm(step.purpose)
          }}
        >
          <ConfirmPassword value={password} onChange={setPassword} error={error} />
          <div className="flex gap-2">
            <Button
              type="submit"
              variant={step.purpose === 'off' ? 'danger' : 'primary'}
              disabled={!password}
              loading={start.pending || off.pending || codes.pending}
            >
              {step.purpose === 'off' ? t('twoFactor.turnOff') : t('twoFactor.continue')}
            </Button>
            <Button variant="ghost" onClick={reset}>
              {t('twoFactor.cancel')}
            </Button>
          </div>
        </form>
      ) : (
        <>
          <p className="text-caption text-text-2">
            {status.data.enabled
              ? t('twoFactor.on', { left: status.data.recoveryCodesLeft })
              : t('twoFactor.off')}
            {status.data.required && <> {t('twoFactor.required')}</>}
          </p>
          {hasPassword && (
            <div className="flex flex-wrap gap-2">
              {status.data.enabled ? (
                <>
                  <Button onClick={() => setStep({ kind: 'password', purpose: 'codes' })}>
                    {t('twoFactor.newCodes')}
                  </Button>
                  {!status.data.required && (
                    <Button
                      variant="ghost"
                      onClick={() => setStep({ kind: 'password', purpose: 'off' })}
                    >
                      {t('twoFactor.turnOff')}
                    </Button>
                  )}
                </>
              ) : (
                <Button
                  icon="shield"
                  onClick={() => setStep({ kind: 'password', purpose: 'setup' })}
                >
                  {t('twoFactor.setUp')}
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </Section>
  )
}

// ---------------------------------------------------------------- passkeys

function Passkeys() {
  const t = useT(account)
  const { relative, seen } = useRelative()
  const info = useQuery('public-info', (c) => c.system.publicInfo(), ['settings.updated'])
  const list = useQuery('passkeys', (c) => c.me.passkeys(), ['users.updated'])
  const [supported, setSupported] = useState<boolean | null>(null)
  const [renaming, setRenaming] = useState<Passkey | null>(null)
  const [removing, setRemoving] = useState<Passkey | null>(null)
  const add = useAction(async (c) => {
    const { challenge, options } = await c.me.passkeyOptions()
    const response = await startRegistration({
      optionsJSON: options as unknown as PublicKeyCredentialCreationOptionsJSON,
    })
    return c.me.addPasskey({ body: { challenge, response: response as never } })
  })
  const remove = useAction((c, id: string) => c.me.removePasskey({ params: { id } }))
  // WebAuthn is a browser API: known only after the first render
  useEffect(() => setSupported(browserSupportsWebAuthn()), [])

  const offered = info.data?.auth.passkeys
  return (
    <Section title={t('passkeys.title')}>
      {list.status !== 'success' ? (
        <Skeleton className="h-10" />
      ) : (
        <>
          {list.data.length === 0 ? (
            <p className="text-caption text-text-2">{t('passkeys.none')}</p>
          ) : (
            <ul aria-label={t('passkeys.title')} className="grid gap-2">
              {list.data.map((p) => (
                <li
                  key={p.id}
                  className="grid gap-2 rounded-md border border-line bg-s2 p-3 medium:grid-cols-[minmax(0,1fr)_auto] medium:items-center"
                >
                  <div className="grid gap-0.5">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-text text-ui">{p.name}</span>
                      <Badge tone="neutral">
                        {p.deviceType === 'multiDevice'
                          ? t('passkeys.synced')
                          : t('passkeys.thisDevice')}
                      </Badge>
                    </p>
                    <p className="text-caption text-text-3">
                      {t('passkeys.made', { when: relative(p.createdAt) })} ·{' '}
                      {p.lastUsed
                        ? t('passkeys.used', { when: seen(p.lastUsed) })
                        : t('passkeys.neverUsed')}
                    </p>
                  </div>
                  <span className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={t('passkeys.renameLabel', { name: p.name })}
                      onClick={() => setRenaming(p)}
                    >
                      {t('passkeys.rename')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={t('passkeys.removeLabel', { name: p.name })}
                      onClick={() => setRemoving(p)}
                    >
                      {t('passkeys.remove')}
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {offered === false ? (
            <p className="text-caption text-text-3">{t('passkeys.unavailable')}</p>
          ) : supported === false ? (
            <p className="text-caption text-text-3">{t('passkeys.unsupported')}</p>
          ) : (
            <Button
              icon="key"
              className="justify-self-start"
              disabled={!supported || !offered}
              loading={add.pending}
              onClick={() =>
                add.run().then(
                  () => toast.success(t('passkeys.added')),
                  (e: Error) =>
                    // the person closed the browser's prompt (WebAuthn: NotAllowedError)
                    e.name === 'NotAllowedError'
                      ? toast({ title: t('passkeys.cancelled') })
                      : fail(t('failed'))(e),
                )
              }
            >
              {t('passkeys.add')}
            </Button>
          )}
        </>
      )}
      {renaming && <RenamePasskey passkey={renaming} onClose={() => setRenaming(null)} />}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={t('passkeys.removeTitle', { name: removing?.name ?? '' })}
        description={t('passkeys.removeBody')}
        confirmLabel={t('passkeys.remove')}
        destructive
        onConfirm={() => {
          const p = removing
          if (p)
            remove.run(p.id).then(() => toast({ title: t('passkeys.removed') }), fail(t('failed')))
        }}
      />
    </Section>
  )
}

function RenamePasskey({ passkey, onClose }: { passkey: Passkey; onClose: () => void }) {
  const t = useT(account)
  const [name, setName] = useState(passkey.name)
  const rename = useAction((c) =>
    c.me.renamePasskey({ params: { id: passkey.id }, body: { name: name.trim() } }),
  )
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        size="sm"
        title={t('passkeys.renameLabel', { name: passkey.name })}
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              {t('twoFactor.cancel')}
            </Button>
            <Button
              variant="primary"
              disabled={!name.trim()}
              loading={rename.pending}
              onClick={() => rename.run().then(onClose, fail(t('failed')))}
            >
              {t('profile.save')}
            </Button>
          </>
        }
      >
        <Field label={t('passkeys.name')}>
          <Input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </Field>
      </DialogContent>
    </Dialog>
  )
}

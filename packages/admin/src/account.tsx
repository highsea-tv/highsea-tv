'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// "Your account": a sheet from the sidebar and the palette, for every role. Your name, your
// password, two-step verification and passkeys. The prototype has no screen for these (the
// client's Profile lists them as "not in the prototype"); this follows the shell's sheet and the
// settings groups' look. Every change re-asks for the password (OWASP Authentication Cheat Sheet:
// re-authenticate before sensitive changes). Drawn with the library's native renderer since D3
// (one-client-platform-d.md): a form's submit is its button and Enter in its fields
// (`onSubmitEditing`).
import type { Passkey, User } from '@highsea-tv/api-contract'
import { useT } from '@highsea-tv/i18n/react'
import { useAction, useQuery } from '@highsea-tv/sdk/react'
import { breakpoints } from '@highsea-tv/tokens'
import {
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  Field,
  Input,
  Sheet,
  Skeleton,
  Text,
  toast,
  tokens,
  useTheme,
  useWindowAtLeast,
} from '@highsea-tv/ui/native'
import {
  browserSupportsWebAuthn,
  type PublicKeyCredentialCreationOptionsJSON,
  startRegistration,
} from '@simplewebauthn/browser'
import { type ReactNode, useEffect, useState } from 'react'
import { View } from 'react-native'
import { account } from './account-messages.ts'
import { useSignOut } from './shell.tsx'
import { useRelative } from './time.ts'
import { CodeInput, ConfirmPassword, Enrol, RecoveryCodes } from './two-factor.tsx'

const fail = (title: string) => (e: Error) => toast.error(title, { description: e.message })

const s = tokens.space
const ui = tokens.adminText.ui
/** A row of buttons (the web's `flex flex-wrap gap-2`). */
const BUTTONS = { flexDirection: 'row', flexWrap: 'wrap', gap: s['2'] } as const

/** A part of the sheet: the settings groups' card, 16 in, with its title. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme()
  return (
    <View
      role="region"
      aria-label={title}
      style={{
        gap: s['3'],
        padding: s['4'],
        minWidth: 0,
        borderWidth: 1,
        borderColor: theme.colors.line,
        borderRadius: tokens.radius.lg,
        backgroundColor: theme.colors.s1,
      }}
    >
      <Text variant="title" weight={600} role="heading" aria-level={2}>
        {title}
      </Text>
      {children}
    </View>
  )
}

/** A line of running words in a section (the web's text-caption text-2 or text-3). */
function Line({ children, quiet }: { children: ReactNode; quiet?: boolean }) {
  return (
    <Text variant="caption" color={quiet ? 'text-3' : 'text-2'}>
      {children}
    </Text>
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
    <Sheet
      open={open}
      onClose={() => onOpenChange(false)}
      side="right"
      title={t('title')}
      description={t('description')}
    >
      {session.status !== 'success' ? (
        <View aria-busy style={{ gap: s['3'] }}>
          <Skeleton height={128} />
          <Skeleton height={128} />
        </View>
      ) : (
        <View style={{ gap: s['4'] }}>
          <Profile key={session.data.user.id} user={session.data.user} />
          {session.data.user.hasPassword && <Password />}
          <TwoFactor hasPassword={session.data.user.hasPassword} />
          <Passkeys />
          <Section title={t('signOut.title')}>
            <Line>{t('signOut.body')}</Line>
            <Button icon="sign-out" onPress={signOut}>
              {t('signOut.action')}
            </Button>
          </Section>
        </View>
      )}
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
        <Input value={name} autoComplete="name" onChangeText={setName} />
      </Field>
      <Field label={t('profile.email')} hint={t('profile.emailHint')}>
        <Input
          inputMode="email"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          autoComplete="email"
          onChangeText={setEmail}
        />
      </Field>
      <Button
        disabled={!dirty || !name.trim()}
        loading={save.pending}
        onPress={() => save.run().then(() => toast.success(t('profile.saved')), fail(t('failed')))}
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
  const submit = () => {
    // the button is off until both are typed; Enter in a field is held to the same
    if (!current || !next) return
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
  }
  return (
    <Section title={t('password.title')}>
      <View style={{ gap: s['3'] }}>
        <Field label={t('password.current')} error={error}>
          <Input
            secureTextEntry
            value={current}
            autoComplete="current-password"
            onChangeText={setCurrent}
            onSubmitEditing={submit}
          />
        </Field>
        <Field label={t('password.new')} hint={t('password.newHint')} error={short}>
          <Input
            secureTextEntry
            value={next}
            autoComplete="new-password"
            onChangeText={setNext}
            onSubmitEditing={submit}
          />
        </Field>
        <Field label={t('password.confirm')} error={mismatch}>
          <Input
            secureTextEntry
            value={confirm}
            autoComplete="new-password"
            onChangeText={setConfirm}
            onSubmitEditing={submit}
          />
        </Field>
        <Button disabled={!current || !next} loading={change.pending} onPress={submit}>
          {t('password.change')}
        </Button>
      </View>
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
        <Skeleton height={40} />
      ) : step.kind === 'codes' ? (
        <RecoveryCodes codes={step.codes} onDone={reset} />
      ) : step.kind === 'enrol' ? (
        <View style={{ gap: s['3'] }}>
          <Enrol secret={step.secret} uri={step.uri} />
          <Field label={t('twoFactor.code')} error={error}>
            <CodeInput value={code} onChange={setCode} onComplete={verify} />
          </Field>
          <View style={BUTTONS}>
            <Button
              variant="primary"
              disabled={code.length < 6}
              loading={enable.pending}
              onPress={() => verify(code)}
            >
              {t('twoFactor.verify')}
            </Button>
            <Button variant="ghost" onPress={reset}>
              {t('twoFactor.cancel')}
            </Button>
          </View>
        </View>
      ) : step.kind === 'password' ? (
        <View style={{ gap: s['3'] }}>
          <ConfirmPassword
            value={password}
            onChange={setPassword}
            onSubmit={() => password && confirm(step.purpose)}
            error={error}
          />
          <View style={BUTTONS}>
            <Button
              variant={step.purpose === 'off' ? 'danger' : 'primary'}
              disabled={!password}
              loading={start.pending || off.pending || codes.pending}
              onPress={() => confirm(step.purpose)}
            >
              {step.purpose === 'off' ? t('twoFactor.turnOff') : t('twoFactor.continue')}
            </Button>
            <Button variant="ghost" onPress={reset}>
              {t('twoFactor.cancel')}
            </Button>
          </View>
        </View>
      ) : (
        <>
          <Line>
            {status.data.enabled
              ? t('twoFactor.on', { left: status.data.recoveryCodesLeft })
              : t('twoFactor.off')}
            {status.data.required ? ` ${t('twoFactor.required')}` : null}
          </Line>
          {hasPassword && (
            <View style={BUTTONS}>
              {status.data.enabled ? (
                <>
                  <Button onPress={() => setStep({ kind: 'password', purpose: 'codes' })}>
                    {t('twoFactor.newCodes')}
                  </Button>
                  {!status.data.required && (
                    <Button
                      variant="ghost"
                      onPress={() => setStep({ kind: 'password', purpose: 'off' })}
                    >
                      {t('twoFactor.turnOff')}
                    </Button>
                  )}
                </>
              ) : (
                <Button
                  icon="shield"
                  onPress={() => setStep({ kind: 'password', purpose: 'setup' })}
                >
                  {t('twoFactor.setUp')}
                </Button>
              )}
            </View>
          )}
        </>
      )}
    </Section>
  )
}

// ---------------------------------------------------------------- passkeys

function Passkeys() {
  const t = useT(account)
  const theme = useTheme()
  const beside = useWindowAtLeast(breakpoints.medium)
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
        <Skeleton height={40} />
      ) : (
        <>
          {list.data.length === 0 ? (
            <Line>{t('passkeys.none')}</Line>
          ) : (
            <View role="list" aria-label={t('passkeys.title')} style={{ gap: s['2'] }}>
              {list.data.map((p) => (
                <View
                  key={p.id}
                  role="listitem"
                  style={{
                    flexDirection: beside ? 'row' : 'column',
                    alignItems: beside ? 'center' : 'stretch',
                    gap: s['2'],
                    padding: s['3'],
                    borderWidth: 1,
                    borderColor: theme.colors.line,
                    borderRadius: tokens.radius.md,
                    backgroundColor: theme.colors.s2,
                  }}
                >
                  <View style={{ flex: beside ? 1 : undefined, minWidth: 0, gap: s['0.5'] }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: s['2'],
                      }}
                    >
                      <Text size={ui.size} leading={ui.leading} weight={500}>
                        {p.name}
                      </Text>
                      <Badge tone="neutral">
                        {p.deviceType === 'multiDevice'
                          ? t('passkeys.synced')
                          : t('passkeys.thisDevice')}
                      </Badge>
                    </View>
                    <Line quiet>
                      {`${t('passkeys.made', { when: relative(p.createdAt) })} · ${
                        p.lastUsed
                          ? t('passkeys.used', { when: seen(p.lastUsed) })
                          : t('passkeys.neverUsed')
                      }`}
                    </Line>
                  </View>
                  <View style={{ flexDirection: 'row', gap: s['1'] }}>
                    <Button
                      size="sm"
                      variant="ghost"
                      accessibilityLabel={t('passkeys.renameLabel', { name: p.name })}
                      onPress={() => setRenaming(p)}
                    >
                      {t('passkeys.rename')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      accessibilityLabel={t('passkeys.removeLabel', { name: p.name })}
                      onPress={() => setRemoving(p)}
                    >
                      {t('passkeys.remove')}
                    </Button>
                  </View>
                </View>
              ))}
            </View>
          )}
          {offered === false ? (
            <Line quiet>{t('passkeys.unavailable')}</Line>
          ) : supported === false ? (
            <Line quiet>{t('passkeys.unsupported')}</Line>
          ) : (
            <Button
              icon="key"
              disabled={!supported || !offered}
              loading={add.pending}
              onPress={() =>
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
        onClose={() => setRemoving(null)}
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
  const save = () => {
    if (name.trim()) rename.run().then(onClose, fail(t('failed')))
  }
  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={t('passkeys.renameLabel', { name: passkey.name })}
      footer={
        <>
          <Button variant="ghost" onPress={onClose}>
            {t('twoFactor.cancel')}
          </Button>
          <Button variant="primary" disabled={!name.trim()} loading={rename.pending} onPress={save}>
            {t('profile.save')}
          </Button>
        </>
      }
    >
      <Field label={t('passkeys.name')}>
        <Input value={name} maxLength={60} onChangeText={setName} onSubmitEditing={save} />
      </Field>
    </Dialog>
  )
}

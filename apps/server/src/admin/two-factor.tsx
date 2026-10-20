'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Pieces of two-step verification that sign-in and "Your account" share: the code field, the
// authenticator's QR code with its key, and the recovery codes shown once.
import { useT } from '@highsea/i18n/react'
import { Button, Field, Input, QrCode, toast } from '@highsea/ui-web'
import type { Ref } from 'react'
import { account } from './account-messages.ts'

/** Six digits; submits itself at the sixth (login.md: "The code submits itself at six digits"). */
export function CodeInput({
  value,
  onChange,
  onComplete,
  ref,
}: {
  value: string
  onChange: (value: string) => void
  onComplete?: (value: string) => void
  ref?: Ref<HTMLInputElement>
}) {
  return (
    <Input
      ref={ref}
      value={value}
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]{6}"
      maxLength={6}
      className="font-mono tracking-[0.3em]"
      onChange={(e) => {
        const next = e.target.value.replace(/\D/g, '').slice(0, 6)
        onChange(next)
        if (next.length === 6) onComplete?.(next)
      }}
    />
  )
}

/** The QR code an authenticator app scans, and the key for typing in by hand. */
export function Enrol({ secret, uri }: { secret: string; uri: string }) {
  const t = useT(account)
  return (
    <div className="grid gap-3">
      <p className="text-caption text-text-2">{t('twoFactor.scan')}</p>
      <QrCode value={uri} aria-label={t('twoFactor.qr')} className="w-44 justify-self-center" />
      <p className="text-caption text-text-3">
        {t('twoFactor.manual')}{' '}
        <code className="break-all font-mono text-figure text-text">
          {secret.replace(/(.{4})/g, '$1 ').trim()}
        </code>
      </p>
    </div>
  )
}

export function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const t = useT(account)
  return (
    <div className="grid gap-3">
      <div className="grid gap-1">
        <h2 className="font-semibold text-text text-title">{t('twoFactor.codesTitle')}</h2>
        <p className="text-caption text-text-2">{t('twoFactor.codesBody')}</p>
      </div>
      <ul
        aria-label={t('twoFactor.codesTitle')}
        className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md bg-s2 p-3 font-mono text-figure text-text"
      >
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          icon="copy"
          onClick={() => {
            navigator.clipboard?.writeText(codes.join('\n')).catch(() => {})
            toast({ title: t('twoFactor.copied') })
          }}
        >
          {t('twoFactor.copy')}
        </Button>
        <Button variant="primary" onClick={onDone}>
          {t('twoFactor.saved')}
        </Button>
      </div>
    </div>
  )
}

/** A password field for confirming a sensitive change (OWASP: re-authenticate first). */
export function ConfirmPassword({
  value,
  onChange,
  error,
}: {
  value: string
  onChange: (v: string) => void
  error?: string
}) {
  const t = useT(account)
  return (
    <Field label={t('twoFactor.password')} hint={t('twoFactor.confirmPassword')} error={error}>
      <Input
        type="password"
        value={value}
        autoComplete="current-password"
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  )
}

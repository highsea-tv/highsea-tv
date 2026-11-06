'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Pieces of two-step verification that sign-in and "Your account" share: the code field, the
// authenticator's QR code with its key, and the recovery codes shown once. Drawn with the
// library's native renderer since D3 (one-client-platform-d.md).
import { useT } from '@highsea-tv/i18n/react'
import {
  Button,
  Field,
  Input,
  QrCode,
  Text,
  toast,
  tokens,
  useControl,
  useTheme,
} from '@highsea-tv/ui/native'
import type { ComponentRef, Ref } from 'react'
import { type TextInput, View } from 'react-native'
import { account } from './account-messages.ts'

const s = tokens.space
const figure = tokens.adminText.figure
/** The QR code's side (the web's w-44). */
const QR = 176

export type InputHandle = ComponentRef<typeof TextInput>

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
  ref?: Ref<InputHandle>
}) {
  const m = useControl()
  return (
    <Input
      ref={ref}
      value={value}
      inputMode="numeric"
      autoComplete="one-time-code"
      textContentType="oneTimeCode"
      maxLength={6}
      mono
      // the web's tracking-[0.3em]
      style={{ letterSpacing: m.text * 0.3 }}
      onChangeText={(text) => {
        const next = text.replace(/\D/g, '').slice(0, 6)
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
    <View style={{ gap: s['3'] }}>
      <Text variant="caption" color="text-2">
        {t('twoFactor.scan')}
      </Text>
      <View style={{ alignSelf: 'center' }}>
        <QrCode value={uri} label={t('twoFactor.qr')} size={QR} />
      </View>
      <Text variant="caption" color="text-3">
        {`${t('twoFactor.manual')} `}
        <Text
          mono
          size={figure.size}
          leading={figure.leading}
          style={{ wordBreak: 'break-all' } as object}
        >
          {secret.replace(/(.{4})/g, '$1 ').trim()}
        </Text>
      </Text>
    </View>
  )
}

export function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const t = useT(account)
  const theme = useTheme()
  return (
    <View style={{ gap: s['3'] }}>
      <View style={{ gap: s['1'] }}>
        <Text variant="title" weight={600} role="heading" aria-level={2}>
          {t('twoFactor.codesTitle')}
        </Text>
        <Text variant="caption" color="text-2">
          {t('twoFactor.codesBody')}
        </Text>
      </View>
      <View
        role="list"
        aria-label={t('twoFactor.codesTitle')}
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          rowGap: s['1'],
          padding: s['3'],
          borderRadius: tokens.radius.md,
          backgroundColor: theme.colors.s2,
        }}
      >
        {codes.map((c) => (
          // two columns, 16 apart (the web's grid-cols-2 gap-x-4)
          <View key={c} role="listitem" style={{ width: '50%', paddingEnd: s['4'] }}>
            <Text mono size={figure.size} leading={figure.leading}>
              {c}
            </Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s['2'] }}>
        <Button
          icon="copy"
          onPress={() => {
            navigator.clipboard?.writeText(codes.join('\n')).catch(() => {})
            toast({ title: t('twoFactor.copied') })
          }}
        >
          {t('twoFactor.copy')}
        </Button>
        <Button variant="primary" onPress={onDone}>
          {t('twoFactor.saved')}
        </Button>
      </View>
    </View>
  )
}

/** A password field for confirming a sensitive change (OWASP: re-authenticate first). */
export function ConfirmPassword({
  value,
  onChange,
  onSubmit,
  error,
}: {
  value: string
  onChange: (v: string) => void
  /** Enter in the field: the form's submit, which a native screen has no <form> for. */
  onSubmit?: () => void
  error?: string
}) {
  const t = useT(account)
  return (
    <Field label={t('twoFactor.password')} hint={t('twoFactor.confirmPassword')} error={error}>
      <Input
        secureTextEntry
        value={value}
        autoComplete="current-password"
        onChangeText={onChange}
        onSubmitEditing={onSubmit}
      />
    </Field>
  )
}

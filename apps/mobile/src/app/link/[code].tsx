// SPDX-License-Identifier: AGPL-3.0-only
// Signing in a TV from the phone, second step (connectivity.md#pairing-a-tv-from-the-phone): what
// the code would sign in, asked once, then the TV signed in as this person (`pairingRequest` and
// `approvePairing`, RFC 8628's user side). highsea://link/{code} opens here too.
import type { ClientType } from '@highsea-tv/api-contract'
import { useT } from '@highsea-tv/i18n/react'
import { useAction, useQuery } from '@highsea-tv/sdk/react'
import { Button, EmptyState, Icon, successHaptic, Text, useTheme } from '@highsea-tv/ui'
import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { Center, Screen, Title } from '../../kit.tsx'
import { pair as messages } from '../../messages.ts'
import { normal } from './index.tsx'

const APPS = ['tvos', 'androidtv', 'ios', 'android', 'desktop'] as const
const appKey = (c: ClientType) =>
  `app.${(APPS as readonly string[]).includes(c) ? c : 'other'}` as `app.${(typeof APPS)[number] | 'other'}`

/** Shown with the dashes the TV shows: KQ7-4PM. */
const shown = (code: string) => (code.length === 6 ? `${code.slice(0, 3)}-${code.slice(3)}` : code)

export default function LinkConfirm() {
  const t = useT(messages)
  const theme = useTheme()
  const code = normal(useLocalSearchParams<{ code: string }>().code ?? '')
  const request = useQuery(`client:pairing:${code}`, (c) =>
    c.auth.pairingRequest({ params: { code } }),
  )
  const approve = useAction((c) => c.auth.approvePairing({ params: { code } }))
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/you'))

  if (request.status === 'loading') return <Center />
  if (request.status === 'error')
    return (
      <Screen gap={16}>
        <Button variant="ghost" icon="chevron-left" onPress={() => router.replace('/link')}>
          {t('title')}
        </Button>
        <View style={{ paddingVertical: 32 }}>
          <EmptyState
            icon="tv"
            tone="error"
            title={t('missingTitle')}
            action={
              <Button variant="primary" onPress={() => router.replace('/link')}>
                {t('tryAgain')}
              </Button>
            }
          >
            {t('missingBody')}
          </EmptyState>
        </View>
      </Screen>
    )

  const r = request.data
  if (done)
    return (
      <Center>
        <View style={{ gap: 24, alignSelf: 'stretch' }}>
          <EmptyState icon="success" title={t('doneTitle', { device: r.device.name })}>
            {t('doneBody')}
          </EmptyState>
          <Button variant="primary" block onPress={leave}>
            {t('done')}
          </Button>
        </View>
      </Center>
    )

  const minutes = Math.max(1, Math.round((Date.parse(r.expiresAt) - Date.now()) / 60_000))
  return (
    <Screen gap={20}>
      <Button variant="ghost" icon="chevron-left" onPress={() => router.replace('/link')}>
        {t('title')}
      </Button>
      <View style={{ gap: 12, alignItems: 'flex-start' }}>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors['accent-soft'],
          }}
        >
          <Icon name="tv" size={28} color="accent-text" />
        </View>
        <Title>{t('question', { device: r.device.name })}</Title>
        <Text variant="body" size={15} color="text-2">
          {t('detail', { app: t(appKey(r.device.client)), address: r.address })}
        </Text>
        <Text variant="caption" size={13} color="text-3">
          {t('expires', { code: shown(code), minutes })}
        </Text>
        {error && (
          <Text variant="callout" color="badge-danger">
            {t('failed', { message: error })}
          </Text>
        )}
      </View>
      <View style={{ gap: 8 }}>
        <Button
          variant="primary"
          block
          loading={approve.pending}
          onPress={() =>
            approve.run().then(
              () => {
                successHaptic()
                setDone(true)
              },
              (e: Error) => setError(e.message),
            )
          }
        >
          {t('approve')}
        </Button>
        <Button variant="ghost" block onPress={leave}>
          {t('cancel')}
        </Button>
      </View>
    </Screen>
  )
}

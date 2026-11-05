// SPDX-License-Identifier: AGPL-3.0-only
// Connect a device, second step (connectivity.md#pairing-a-tv-from-the-phone): what the code would
// sign in, asked once, then the device signed in as this person (`pairingRequest` and
// `approvePairing`, RFC 8628's user side, https://www.rfc-editor.org/rfc/rfc8628#section-3.3), as
// the prototypes' web/link.tsx and mobile/pair.tsx draw it, in the old phone app's logic. A code
// the server isn't waiting on, or one that has expired, says so with Try again.
// highsea://link/{code} and the server's /link/{code} open here.
import type { ClientType } from '@highsea-tv/api-contract'
import { normalCode, showCode } from '@highsea-tv/client/servers'
import { useT } from '@highsea-tv/i18n/react'
import { useAction, useQuery } from '@highsea-tv/sdk/react'
import {
  Button,
  EmptyState,
  Icon,
  successHaptic,
  Text,
  tokens,
  useFormFactor,
  useTheme,
} from '@highsea-tv/ui'
import { type Href, router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { LinkFrame, LinkText, LinkTitle, withMono } from '../../../account/link-parts.tsx'
import { pairMessages } from '../../../account/messages.ts'
import { useDevice } from '../../../host'
import { Centered } from '../../../kit.tsx'

const { space } = tokens

const APPS = ['tvos', 'androidtv', 'ios', 'android', 'desktop'] as const
const appKey = (c: ClientType) =>
  `app.${(APPS as readonly string[]).includes(c) ? c : 'other'}` as `app.${(typeof APPS)[number] | 'other'}`

/** The prototype's tv icon in its accent circle: size-14, its 28 icon the tokens' 24. */
const BADGE = space['12'] + space['2']

const again = () => router.replace('/link' as Href)

export default function LinkConfirm() {
  const t = useT(pairMessages)
  const theme = useTheme()
  const touch = useFormFactor().input === 'touch'
  const phone = useDevice() === 'phone'
  const code = normalCode(useLocalSearchParams<{ code: string }>().code ?? '')
  const request = useQuery(`client:pairing:${code}`, (c) =>
    c.auth.pairingRequest({ params: { code } }),
  )
  const approve = useAction((c) => c.auth.approvePairing({ params: { code } }))
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // the phone goes back to Servers, where Sign in a TV is; a browser to Home (the prototypes')
  const leave = () => router.replace((touch ? '/settings?section=servers' : '/') as Href)
  const back = { label: t('title'), onPress: again }

  if (request.status === 'loading') return <Centered />
  if (request.status === 'error')
    return (
      <LinkFrame back={back}>
        <View style={{ paddingVertical: space['8'] }}>
          <EmptyState
            icon="tv"
            tone="error"
            title={t('missingTitle')}
            action={
              <Button variant="primary" onPress={again}>
                {t('tryAgain')}
              </Button>
            }
          >
            {t('missingBody')}
          </EmptyState>
        </View>
      </LinkFrame>
    )

  const r = request.data
  if (done)
    return (
      <LinkFrame centred>
        <View style={{ gap: space['6'], paddingVertical: space['8'] }}>
          <EmptyState
            icon="success"
            title={t('doneTitle', { device: r.device.name })}
            action={
              touch ? undefined : (
                <Button variant="primary" onPress={leave}>
                  {t('done')}
                </Button>
              )
            }
          >
            {t(phone ? 'doneBodyPhone' : 'doneBody')}
          </EmptyState>
          {touch ? (
            <Button variant="primary" block onPress={leave}>
              {t('done')}
            </Button>
          ) : null}
        </View>
      </LinkFrame>
    )

  const minutes = Math.max(1, Math.round((Date.parse(r.expiresAt) - Date.now()) / 60_000))
  return (
    <LinkFrame back={back}>
      <View style={{ gap: space['3'], alignItems: 'flex-start' }}>
        <View
          style={{
            width: BADGE,
            height: BADGE,
            borderRadius: BADGE / 2,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors['accent-soft'],
          }}
        >
          <Icon name="tv" size={tokens.icon.size.lg} color="accent-text" />
        </View>
        <LinkTitle>{t('question', { device: r.device.name })}</LinkTitle>
        <LinkText>
          {withMono(
            t(phone ? 'detailPhone' : 'detail', {
              app: t(appKey(r.device.client)),
              address: r.address,
            }),
            r.address,
          )}
        </LinkText>
        <Text variant="caption" color="text-3">
          {withMono(t('expires', { code: showCode(code), minutes }), showCode(code), 'caption')}
        </Text>
        {error ? (
          <Text variant="callout" color="badge-danger" accessibilityRole="alert">
            {t('failed', { message: error })}
          </Text>
        ) : null}
      </View>
      <View
        style={{
          flexDirection: touch ? 'column' : 'row',
          // a column that wraps is only as wide as its content on the web, so only the row wraps
          flexWrap: touch ? 'nowrap' : 'wrap',
          gap: space['2'],
        }}
      >
        <Button
          variant="primary"
          block={touch}
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
        <Button variant="ghost" block={touch} onPress={leave}>
          {t('cancel')}
        </Button>
      </View>
    </LinkFrame>
  )
}

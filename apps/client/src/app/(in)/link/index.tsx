// SPDX-License-Identifier: AGPL-3.0-only
// Connect a device, first step (connectivity.md#pairing-a-tv-from-the-phone): the code a TV shows,
// which a signed-in person approves here, as the prototypes' web/link.tsx and mobile/pair.tsx draw
// it. The TV's own side, showing the code, is its sign-in (../../sign-in.tsx).
// - The phone points its camera at the TV's QR code (./../../../account/camera.tsx), or takes the
//   code typed. The camera's permission is asked for the first time here, and a refusal says where
//   to change it. The QR is the server's /link address with the code in it, or
//   highsea://link?server=…&code=… (connectivity.md#where), which opens here: either goes straight
//   to the question, on the server it names when this device knows it and is signed in there.
// - A browser has no camera to point, so it asks for the code (the web's prototype); its column
//   under the top bar with a pointer, the phone's screen by touch.
// - In mock mode (the prototypes' frames), the phone's frame shows the prototype's camera, which
//   finds the waiting TV's code after SCAN_MS, as mobile/pair.tsx's did.
import { codeFrom, looksLikeCode, normalCode } from '@highsea-tv/client/servers'
import { useT } from '@highsea-tv/i18n/react'
import { useServers } from '@highsea-tv/native/servers'
import { Button, Field, Icon, Input, Text, tokens, useFormFactor } from '@highsea-tv/ui'
import { type Href, router, useLocalSearchParams } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { Linking, View } from 'react-native'
import { useCameraPermission } from '../../../account/camera'
import { LinkFrame, LinkText, LinkTitle } from '../../../account/link-parts.tsx'
import { pairMessages } from '../../../account/messages.ts'

const { space } = tokens

/** In mock mode, the prototype's camera finds the waiting TV's code after this long. */
export const SCAN_MS = 3000

/**
 * The code the mock's TV is waiting with (@highsea-tv/mock/pairing), in mock mode only: Expo
 * inlines the variable as it bundles, so the require folds away from a real build, as
 * ../../../transport.ts's do.
 */
const MOCK_CODE: string | null =
  process.env.EXPO_PUBLIC_HIGHSEA_MOCK === '1'
    ? (require('@highsea-tv/mock/pairing') as typeof import('@highsea-tv/mock/pairing')).waiting
        .code
    : null

/**
 * The camera's picture on a dark ground in every theme, framing where the code goes: the
 * prototype's #16171a and its frame in text at 85%, here the default dark theme's s2 and text-2.
 */
const VIEWFINDER = tokens.themes.default.colors.s2
const VIEWFINDER_LINE = tokens.themes.default.colors['text-2']

const ask = (code: string) => router.replace(`/link/${normalCode(code)}` as Href)
const toServers = () => router.replace('/settings?section=servers' as Href)

export default function LinkScan() {
  const t = useT(pairMessages)
  const touch = useFormFactor().input === 'touch'
  const camera = useCameraPermission()
  const [typing, setTyping] = useState(false)
  const [code, setCode] = useState('')
  const found = useRef(false)
  const linked = useLocalSearchParams<{ code?: string; server?: string }>()
  const servers = useServers()
  // a link that names a code (the server's /link?code=…, highsea://link?…) goes to the question
  // biome-ignore lint/correctness/useExhaustiveDependencies: each link that opens it, once
  useEffect(() => {
    const c = linked.code ? codeFrom(linked.code) : null
    if (!c) return
    const other =
      linked.server && linked.server !== servers.current?.server.id
        ? servers.known.find((k) => k.id === linked.server && k.signedIn)
        : undefined
    void (other ? servers.use(other.id) : Promise.resolve()).then(() => ask(c))
  }, [linked.code, linked.server])
  // the phone's camera, or the prototype's in mock mode; a browser types the code
  const mockScan = touch && camera === null && MOCK_CODE !== null
  const scanning = touch && !typing && (camera !== null || mockScan)
  useEffect(() => {
    if (!scanning || !mockScan || !MOCK_CODE) return
    const timer = setTimeout(() => ask(MOCK_CODE), SCAN_MS)
    return () => clearTimeout(timer)
  }, [scanning, mockScan])

  const form = (
    <View style={{ gap: space['4'] }}>
      <Field label={t('code')}>
        <Input
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          spellCheck={false}
          autoFocus={touch}
          placeholder="KQ7-4PM"
          mono
          returnKeyType="go"
          onSubmitEditing={() => looksLikeCode(code) && ask(code)}
          // the prototype's tracking-[0.12em], as near as the tokens come: the eyebrow's 0.14em
          style={{ letterSpacing: tokens.tracking.eyebrow * tokens.text.web.mono.size }}
        />
      </Field>
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
          disabled={!looksLikeCode(code)}
          onPress={() => ask(code)}
        >
          {t('continue')}
        </Button>
        {touch && (camera !== null || mockScan) ? (
          <Button variant="ghost" icon="scan" block onPress={() => setTyping(false)}>
            {t('scanInstead')}
          </Button>
        ) : null}
      </View>
    </View>
  )

  return (
    <LinkFrame back={{ label: t('servers'), onPress: toServers }}>
      <View style={{ gap: touch ? space['1'] : space['2'] }}>
        <LinkTitle>{t('title')}</LinkTitle>
        <LinkText>{!touch ? t('hint') : scanning ? t('scanHint') : t('typeHint')}</LinkText>
      </View>
      {scanning ? (
        <View style={{ gap: space['3'] }}>
          <Viewfinder
            live={camera?.granted === true}
            simulated={mockScan}
            onScanned={(data) => {
              const c = codeFrom(data)
              if (!c || found.current) return
              found.current = true
              ask(c)
            }}
            permission={camera}
          />
          <Button variant="ghost" block onPress={() => setTyping(true)}>
            {t('typeInstead')}
          </Button>
        </View>
      ) : (
        form
      )}
    </LinkFrame>
  )
}

/** The camera's picture, 3 by 4, with the frame showing where the TV's code goes. */
function Viewfinder({
  live,
  simulated,
  onScanned,
  permission,
}: {
  live: boolean
  simulated: boolean
  onScanned: (data: string) => void
  permission: ReturnType<typeof useCameraPermission>
}) {
  const t = useT(pairMessages)
  const looking = live || simulated
  return (
    <View
      accessible={looking}
      accessibilityRole={looking ? 'image' : undefined}
      accessibilityLabel={looking ? t('camera') : undefined}
      style={{
        aspectRatio: 3 / 4,
        borderRadius: tokens.radius.lg,
        overflow: 'hidden',
        backgroundColor: VIEWFINDER,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {live && permission ? (
        <permission.Scanner
          onScanned={onScanned}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
        />
      ) : null}
      {!looking && permission ? (
        <View style={{ padding: tokens.mobile.gutter, gap: space['3'], alignItems: 'center' }}>
          {permission.refused ? (
            <Text variant="callout" color="text-2" style={{ textAlign: 'center' }}>
              {t('cameraOff')}
            </Text>
          ) : null}
          <Button
            icon="scan"
            onPress={() => (permission.refused ? void Linking.openSettings() : permission.ask())}
          >
            {t('allowCamera')}
          </Button>
        </View>
      ) : null}
      {/* the frame shows where the code goes */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: '18%',
          right: '18%',
          bottom: '18%',
          left: '18%',
          borderRadius: tokens.radius.lg,
          borderWidth: tokens.focus.web.width,
          borderStyle: 'dashed',
          borderColor: VIEWFINDER_LINE,
        }}
      />
      {looking ? (
        <View
          accessibilityRole="text"
          accessibilityLiveRegion="polite"
          style={{
            position: 'absolute',
            bottom: space['4'],
            flexDirection: 'row',
            gap: space['1'] + space['0.5'],
            alignItems: 'center',
          }}
        >
          <Icon name="loading" size={tokens.icon.size.sm} color="text-2" />
          <Text variant="caption" color="text-2">
            {t('looking')}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

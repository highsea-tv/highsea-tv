// SPDX-License-Identifier: AGPL-3.0-only
// Signing in a TV from the phone, first step (connectivity.md#pairing-a-tv-from-the-phone,
// signed off 2026-10-29): the camera looks for the TV's QR code, which is the server's /link
// address with the code in it, or the code is typed. The camera is expo-camera's CameraView with
// QR codes only (https://docs.expo.dev/versions/latest/sdk/camera/); its permission is asked for
// the first time here, and a refusal says where to change it.
import { useT } from '@highsea-tv/i18n/react'
import { Button, Field, Icon, Input, Text, tokens } from '@highsea-tv/ui-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { router } from 'expo-router'
import { useRef, useState } from 'react'
import { Linking, View } from 'react-native'
import { Back, GUTTER, Screen, Title } from '../../kit.tsx'
import { pair as messages } from '../../messages.ts'

export const normal = (code: string) => code.replace(/[^a-z0-9]/gi, '').toUpperCase()

/** The code in a scanned QR code: the /link address's `code`, a highsea:// link, or the code itself. */
export function codeFrom(data: string): string | null {
  try {
    const url = new URL(data)
    const q = url.searchParams.get('code')
    if (q) return normal(q)
    if (url.protocol === 'highsea:') return normal(url.pathname.split('/').pop() ?? '')
  } catch {}
  const code = normal(data)
  return code.length >= 6 && code.length <= 8 ? code : null
}

export default function LinkScan() {
  const t = useT(messages)
  const [permission, ask] = useCameraPermissions()
  const [typing, setTyping] = useState(false)
  const [code, setCode] = useState('')
  const found = useRef(false)
  const go = (c: string) => router.replace(`/link/${c}`)
  const refused = permission?.granted === false && !permission.canAskAgain

  return (
    <Screen gap={16}>
      <Back label={t('servers')} />
      <View style={{ gap: 4 }}>
        <Title>{t('title')}</Title>
        <Text variant="body" size={15} color="text-2">
          {typing ? t('typeHint') : t('scanHint')}
        </Text>
      </View>
      {typing ? (
        <View style={{ gap: 16 }}>
          <Field label={t('code')}>
            <Input
              value={code}
              onChangeText={setCode}
              autoCapitalize="characters"
              autoCorrect={false}
              autoFocus
              textContentType="oneTimeCode"
              placeholder="KQ7-4PM"
              mono
              returnKeyType="go"
              onSubmitEditing={() => normal(code).length >= 6 && go(normal(code))}
              style={{ fontSize: 20, letterSpacing: 2.4 }}
            />
          </Field>
          <Button
            variant="primary"
            block
            disabled={normal(code).length < 6}
            onPress={() => go(normal(code))}
          >
            {t('continue')}
          </Button>
          <Button variant="ghost" icon="scan" block onPress={() => setTyping(false)}>
            {t('scanInstead')}
          </Button>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={t('camera')}
            style={{
              aspectRatio: 3 / 4,
              borderRadius: tokens.radius.lg,
              overflow: 'hidden',
              backgroundColor: '#16171a',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {permission?.granted ? (
              <CameraView
                style={{ position: 'absolute', inset: 0 }}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={({ data }) => {
                  const c = codeFrom(data)
                  if (!c || found.current) return
                  found.current = true
                  go(c)
                }}
              />
            ) : (
              <View style={{ padding: GUTTER, gap: 12, alignItems: 'center' }}>
                {refused && (
                  <Text variant="callout" color="text-2" style={{ textAlign: 'center' }}>
                    {t('cameraOff')}
                  </Text>
                )}
                <Button
                  onPress={() => (refused ? void Linking.openSettings() : void ask())}
                  icon="scan"
                >
                  {t('allowCamera')}
                </Button>
              </View>
            )}
            {/* the frame shows where the code goes */}
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                inset: '18%',
                borderRadius: 18,
                borderWidth: 2,
                borderStyle: 'dashed',
                borderColor: 'rgba(237,237,238,0.85)',
              }}
            />
            {permission?.granted && (
              <View
                accessibilityRole="text"
                style={{
                  position: 'absolute',
                  bottom: 16,
                  flexDirection: 'row',
                  gap: 6,
                  alignItems: 'center',
                }}
              >
                <Icon name="loading" size={14} color="text-2" />
                <Text variant="caption" size={13} color="text-2">
                  {t('looking')}
                </Text>
              </View>
            )}
          </View>
          <Button variant="ghost" block onPress={() => setTyping(true)}>
            {t('typeInstead')}
          </Button>
        </View>
      )}
    </Screen>
  )
}

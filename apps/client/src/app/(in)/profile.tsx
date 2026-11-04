// SPDX-License-Identifier: AGPL-3.0-only
// C8 Profile (client-settings.md), with a pointer: who you are on this server, as the prototype's
// web/settings.tsx WebProfile draws it. The person as the server knows them (../../account/
// person.tsx); their account (the server, two-step verification, the libraries they see, with
// Change password and Set up a passkey to come); then Settings, Your devices and Downloads. The
// account menu in the top bar opens it (../../account/menu.tsx).
// The phone's account is its You tab, Settings' list with the same head above it (settings.tsx's
// TouchSettings), and the TV's account opens Settings, so on both this address goes to Settings.
import { useT } from '@highsea-tv/i18n/react'
import { useSessionData } from '@highsea-tv/native/session'
import {
  Icon,
  type IconName,
  Press,
  ScrollView,
  Text,
  tokens,
  useFormFactor,
  usePageGutter,
  useTheme,
} from '@highsea-tv/ui'
import { type Href, Redirect, router } from 'expo-router'
import { StyleSheet, View } from 'react-native'
import { profileMessages } from '../../account/messages.ts'
import { PersonHead } from '../../account/person.tsx'
import { Soon, useServerName } from '../../kit.tsx'

const { space } = tokens

/** The prototype's max-w-[720px]. */
const PAGE_WIDTH = space['6'] * 30

export default function Profile() {
  return useFormFactor().input === 'pointer' ? <PointerProfile /> : <Redirect href="/settings" />
}

function PointerProfile() {
  const t = useT(profileMessages)
  const theme = useTheme()
  const gutter = usePageGutter()
  const { user } = useSessionData()
  const server = useServerName()
  const facts: [string, string][] = [
    [t('server'), server],
    [t('twoStep'), user.twoFactor ? t('on') : t('off')],
    [
      t('libraries'),
      user.libraries === 'all' ? t('all') : t('some', { count: user.libraries.length }),
    ],
  ]
  const links: { href: string; icon: IconName; label: string; hint: string }[] = [
    { href: '/settings', icon: 'settings', label: t('settings'), hint: t('settingsHint') },
    {
      href: '/settings?section=devices',
      icon: 'phone',
      label: t('devices'),
      hint: t('devicesHint'),
    },
    { href: '/downloads', icon: 'download', label: t('downloads'), hint: t('downloadsHint') },
  ]
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      contentContainerStyle={{ paddingVertical: space['8'] }}
    >
      {/* the gutter inside the 720, as the prototype's padding on the same element */}
      <View
        style={{
          width: '100%',
          maxWidth: PAGE_WIDTH,
          alignSelf: 'center',
          paddingHorizontal: gutter,
          gap: space['6'],
        }}
      >
        <PersonHead />
        <View
          accessibilityRole="summary"
          accessibilityLabel={t('account')}
          style={{
            gap: space['3'],
            padding: space['5'],
            borderRadius: tokens.radius.lg,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: theme.colors.line,
            backgroundColor: theme.colors.s1,
          }}
        >
          <Text variant="title" accessibilityRole="header" aria-level={2}>
            {t('account')}
          </Text>
          {/* the prototype's two columns: the names in text-3 sized to the longest, the values beside */}
          <View style={{ flexDirection: 'row', columnGap: space['6'] }}>
            <View style={{ gap: space['2'] }}>
              {facts.map(([label]) => (
                <Text key={label} variant="body" color="text-3">
                  {label}
                </Text>
              ))}
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: space['2'] }}>
              {facts.map(([label, value]) => (
                <Text key={label} variant="body">
                  {value}
                </Text>
              ))}
            </View>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space['2'] }}>
            <Soon>{t('changePassword')}</Soon>
            <Soon>{t('passkey')}</Soon>
          </View>
        </View>
        <View accessibilityRole="list" accessibilityLabel={t('links')} style={{ gap: space['2'] }}>
          {links.map((l) => (
            <View key={l.href} accessibilityRole="listitem">
              <Press
                accessibilityRole="link"
                accessibilityLabel={l.label}
                accessibilityHint={l.hint}
                onPress={() => router.push(l.href as Href)}
                style={({ hovered }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space['3'],
                  paddingHorizontal: space['4'],
                  paddingVertical: space['3'],
                  borderRadius: tokens.radius.md,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: theme.colors.line,
                  backgroundColor: theme.colors[hovered ? 's2' : 's1'],
                })}
              >
                <Icon name={l.icon} size={tokens.icon.size.md} color="text-3" />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="body">{l.label}</Text>
                  <Text variant="caption" color="text-3">
                    {l.hint}
                  </Text>
                </View>
                <Icon name="chevron-right" size={tokens.icon.size.sm} color="text-3" />
              </Press>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  )
}

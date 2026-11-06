'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// The centred card that sign-in, invite and reset links and device pairing sit in (the
// prototype's login.tsx). Drawn with the library's native renderer since D3
// (one-client-platform-d.md). These pages stand outside the shell, so the card holds the toasts
// they raise (the recovery codes' Copied).
import { useT } from '@highsea-tv/i18n/react'
import { Icon, Lockup, Text, Toaster, tokens, useTheme } from '@highsea-tv/ui/native'
import type { ReactNode } from 'react'
import { useWindowDimensions, View } from 'react-native'
import { shell } from './messages.ts'

const s = tokens.space
/** The card's widest (the web's max-w-[24rem]). */
const CARD_WIDTH = 384

export function Card({ children }: { children: ReactNode }) {
  const theme = useTheme()
  const t = useT(shell)
  const { height } = useWindowDimensions()
  return (
    <View
      role="main"
      style={{
        minHeight: height,
        alignItems: 'center',
        justifyContent: 'center',
        padding: s['4'],
        backgroundColor: theme.colors.bg,
      }}
    >
      <View style={{ width: '100%', maxWidth: CARD_WIDTH, gap: s['6'] }}>
        <View style={{ alignSelf: 'center' }}>
          <Lockup size={20} />
        </View>
        <View
          style={{
            gap: s['5'],
            padding: s['6'],
            borderWidth: 1,
            borderColor: theme.colors.line,
            borderRadius: tokens.radius.lg,
            backgroundColor: theme.colors.s1,
            boxShadow: tokens.elevation[2].boxShadow,
          }}
        >
          {children}
        </View>
      </View>
      <Toaster label={t('notifications')} />
    </View>
  )
}

export function Heading({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={{ gap: s['1'] }}>
      <Text variant="title" role="heading" aria-level={1}>
        {title}
      </Text>
      {detail ? (
        <Text variant="caption" color="text-2">
          {detail}
        </Text>
      ) : null}
    </View>
  )
}

export function FormAlert({ children }: { children: string }) {
  const theme = useTheme()
  return (
    <View
      role="alert"
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: s['2'],
        paddingHorizontal: s['3'],
        paddingVertical: s['2'],
        borderRadius: tokens.radius.sm,
        backgroundColor: theme.colors['badge-danger-bg'],
      }}
    >
      <View style={{ marginTop: 1 }}>
        <Icon name="alert" size={16} color="badge-danger" />
      </View>
      <Text variant="caption" color="badge-danger" style={{ flex: 1, minWidth: 0 }}>
        {children}
      </Text>
    </View>
  )
}

export function Divider({ children }: { children: string }) {
  const theme = useTheme()
  const line = { height: 1, flex: 1, backgroundColor: theme.colors.line }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: s['3'] }}>
      <View style={line} />
      <Text variant="caption" color="text-3">
        {children}
      </Text>
      <View style={line} />
    </View>
  )
}

// SPDX-License-Identifier: AGPL-3.0-only
// An update waiting (desktop-app.md › Updates): the desktop app checks by itself and downloads in
// the background, and never interrupts. While one waits, the profile button carries a dot (its
// label adding "An update is ready."), its menu ends with Restart to update, and Settings › About
// says so with Restart to update beside it. Outside the desktop app there's none of it. From the
// prototype's web/shell.tsx (Profile) and apps/web's desktop/updates.ts and settings' About; the
// account worker's profile menu draws UpdateDot and updateMenuOption, and About draws AboutUpdate.
import { relative } from '@highsea-tv/core/format'
import { useLocale, useT } from '@highsea-tv/i18n/react'
import { Button, type MenuOption, Text, tokens, useTheme } from '@highsea-tv/ui'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { StyleSheet, View } from 'react-native'
import { useSay } from '../kit.tsx'
import { type AppUpdate, useDesktopHost } from './host.ts'
import { updateMessages } from './messages.ts'

const { space } = tokens
const nothing = () => () => {}
const none = () => null

/** The app's update in the desktop app, as it changes; null outside it. */
export function useAppUpdate(): AppUpdate | null {
  const host = useDesktopHost()
  const updates = host?.updates
  return useSyncExternalStore(
    updates ? updates.subscribe : nothing,
    updates ? updates.get : none,
    updates ? updates.get : none,
  )
}

/** Restart to update: installs and opens the app again where it was, saying so if it can't. */
export function useRestartToUpdate(): (() => void) | null {
  const host = useDesktopHost()
  const update = useAppUpdate()
  const say = useSay()
  const t = useT(updateMessages)
  const ready = update?.ready ?? null
  const restart = useCallback(() => {
    if (!host || !ready) return
    say({ title: t('restarting', { version: ready }) })
    host.updates.restart().catch(() => say({ title: t('restartFailed') }))
  }, [host, ready, say, t])
  return ready ? restart : null
}

/**
 * The profile button's dot while an update waits: the prototype's, on the avatar's top end corner
 * (`-end-0.5 -top-0.5 size-2.5 border-2 border-bg bg-accent`). Put it inside the avatar's box,
 * which must be `position: relative` (React Native's default).
 */
export function UpdateDot() {
  const theme = useTheme()
  const update = useAppUpdate()
  if (!update?.ready) return null
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        position: 'absolute',
        top: -space['0.5'],
        end: -space['0.5'],
        width: space['2'] + space['0.5'],
        height: space['2'] + space['0.5'],
        borderRadius: tokens.radius.pill,
        borderWidth: space['0.5'],
        borderColor: theme.colors.bg,
        backgroundColor: theme.colors.accent,
      }}
    />
  )
}

/** The words the profile button's label adds while an update waits, or nothing. */
export function useUpdateLabel(): string | null {
  const t = useT(updateMessages)
  return useAppUpdate()?.ready ? t('profileUpdate') : null
}

/**
 * The profile menu's last option while an update waits: Restart to update, with "highsea {new} is
 * ready. You have {current}." under it. Null otherwise, so the menu leaves it out. A hook, since it
 * reads the update and the words: call it as `useUpdateMenuOption()`'s alias in a component.
 */
export function updateMenuOption(): MenuOption | null {
  // biome-ignore lint/correctness/useHookAtTopLevel: a hook by its body, named as the shell asked
  return useUpdateMenuOption()
}

export function useUpdateMenuOption(): MenuOption | null {
  const t = useT(updateMessages)
  const update = useAppUpdate()
  const restart = useRestartToUpdate()
  if (!update?.ready || !restart) return null
  return {
    label: t('restart'),
    detail: t('menuDetail', { version: update.ready, current: update.current }),
    icon: 'refresh',
    onSelect: restart,
  }
}

/** Settings › About in the desktop app: up to date and when it last asked, or the update waiting. */
export function AboutUpdate() {
  const t = useT(updateMessages)
  const theme = useTheme()
  const locale = useLocale()
  const update = useAppUpdate()
  const restart = useRestartToUpdate()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])
  if (!update) return null
  if (update.ready && restart)
    return (
      // the prototype's box: s1 on `line`, radius-md, the words beside Restart to update
      <View
        accessibilityRole="summary"
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: space['3'],
          padding: space['4'],
          borderRadius: tokens.radius.md,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.line,
          backgroundColor: theme.colors.s1,
        }}
      >
        <View style={{ flex: 1, minWidth: space['16'] * 3 }}>
          <Text variant="body">{t('ready', { version: update.ready })}</Text>
        </View>
        <Button variant="primary" icon="refresh" onPress={restart}>
          {t('restart')}
        </Button>
      </View>
    )
  return (
    <Text variant="caption" color="text-3">
      {update.checkedAt === null
        ? t('notChecked')
        : t('upToDate', {
            when: relative(new Date(Math.min(update.checkedAt, now)).toISOString(), now, locale),
          })}
    </Text>
  )
}

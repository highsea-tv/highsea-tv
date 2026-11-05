// SPDX-License-Identifier: AGPL-3.0-only
// The top bar's account menu with a pointer, as the prototype's web/shell.tsx Profile: the avatar
// opens a menu named for the person, with Account (Profile), Downloads, Settings and Sign out of
// the server, and, in the desktop app while an update waits, Restart to update at its end, the
// avatar carrying the update's dot (../desktop/update.tsx). When the server serves profiles (B3)
// the avatar and the menu's title are the profile watching now, in its colour, and Switch profile
// leads the menu while the account has more than one; a server without them draws it as before.
// The menu is the library's, WAI-ARIA's
// menu button (https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/): the avatar says it opens a
// menu and whether it's open.
import { settingsPageMessages } from '@highsea-tv/client/prefs'
import { useT } from '@highsea-tv/i18n/react'
import { useMaybeSession } from '@highsea-tv/native/session'
import { Avatar, Menu, type MenuOption, Press, useControl } from '@highsea-tv/ui'
import type { ViewHandle } from '@highsea-tv/ui/tv'
import { type Href, router } from 'expo-router'
import { useRef, useState } from 'react'
import { View } from 'react-native'
import { UpdateDot, useUpdateLabel, useUpdateMenuOption } from '../desktop/update.tsx'
import { Notice } from '../kit.tsx'
import { useProfilesState } from '../profiles/state.tsx'
import { useProfilesText } from '../profiles/who.tsx'
import { profileMessages } from './messages.ts'
import { useSignOut } from './sign-out.tsx'

const go = (path: string) => () => router.navigate(path as Href)

export function AccountMenu() {
  const t = useT(profileMessages)
  const s = useT(settingsPageMessages)
  const m = useControl()
  const profiles = useProfilesState()
  const words = useProfilesText()
  const signedIn = useMaybeSession()?.user.displayName ?? ''
  const person = profiles?.me?.name ?? signedIn
  const out = useSignOut()
  const updateLabel = useUpdateLabel()
  const anchor = useRef<ViewHandle>(null)
  const [open, setOpen] = useState(false)
  const restart = useUpdateMenuOption()
  const items: MenuOption[] = [
    ...(profiles && profiles.profiles.length > 1
      ? [
          {
            label: words.switchProfile,
            icon: 'users',
            onSelect: go('/who'),
            closes: 'leave',
          } satisfies MenuOption,
        ]
      : []),
    { label: t('title'), icon: 'user', onSelect: go('/profile'), closes: 'leave' },
    { label: t('downloads'), icon: 'download', onSelect: go('/downloads'), closes: 'leave' },
    { label: t('settings'), icon: 'settings', onSelect: go('/settings'), closes: 'leave' },
    { label: s('signOut', { name: out.name }), icon: 'sign-out', onSelect: out.run },
    ...(restart ? [restart] : []),
  ]
  const label = t('menu', { name: person })
  return (
    <>
      <View ref={anchor}>
        <Press
          onPress={() => setOpen((o) => !o)}
          accessibilityRole="button"
          {...({ 'aria-haspopup': 'menu' } as object)}
          accessibilityState={{ expanded: open }}
          accessibilityLabel={updateLabel ? `${label}. ${updateLabel}` : label}
          // the dot sits at the avatar's top end corner (UpdateDot is absolute)
          style={{ minHeight: m.height, justifyContent: 'center', position: 'relative' }}
        >
          <Avatar name={person} tone={profiles?.me?.tone} size={m.height} />
          <UpdateDot />
        </Press>
      </View>
      <Menu
        title={person}
        items={items}
        open={open}
        anchor={anchor}
        onClose={() => setOpen(false)}
      />
      {out.failure ? <Notice>{out.failure}</Notice> : null}
      {out.prompt}
    </>
  )
}

// SPDX-License-Identifier: AGPL-3.0-only
// The signed-in person as the server knows them (client-settings.md › C8): their avatar, their
// name, and their username with their role on the server, at the top of Profile with a pointer and
// of the phone's You (Settings' list), as the prototypes' web/settings.tsx WebProfile and
// mobile/more.tsx MobileYou draw it. The prototype's sub-profile line ("A profile on @ines's
// account") waits for profiles, which move with B3 (one-client-platform-b.md, answer 1).
import { useT } from '@highsea-tv/i18n/react'
import { useSessionData } from '@highsea-tv/native/session'
import { Avatar, Text, tokens, useFormFactor } from '@highsea-tv/ui'
import { View } from 'react-native'
import { useServerName } from '../kit.tsx'
import { profileMessages } from './messages.ts'

const { space } = tokens

/**
 * The prototypes' sizes: the web's 64 avatar beside a heading; the phone's 56 beside its title
 * (20) and a caption (the prototype's 13, the tokens' 12).
 */
const HEAD = {
  page: { avatar: space['16'], gap: space['4'] },
  touch: { avatar: space['12'] + space['2'], gap: space['3'] },
} as const

export function PersonHead() {
  const t = useT(profileMessages)
  const { user } = useSessionData()
  const server = useServerName()
  const touch = useFormFactor().input === 'touch'
  const size = HEAD[touch ? 'touch' : 'page']
  const line = t(`line.${user.role}`, { username: user.username, server })
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: size.gap }}>
      <Avatar name={user.displayName} size={size.avatar} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          variant={touch ? 'title' : 'heading'}
          weight={600}
          accessibilityRole={touch ? undefined : 'header'}
          numberOfLines={1}
        >
          {user.displayName}
        </Text>
        <Text variant={touch ? 'caption' : 'body'} color={touch ? 'text-3' : 'text-2'}>
          {line}
        </Text>
      </View>
    </View>
  )
}

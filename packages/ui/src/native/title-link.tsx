// SPDX-License-Identifier: AGPL-3.0-only
// A title that's a link, in a table's row or a list (the web's `<a className="hover:underline">`
// round a movie's title in Activity, Now playing and the history tables): the text as it is, in
// the admin's ui type, underlined while a pointer is over it. On the web the Pressable takes the
// address and react-native-web draws it as an `<a href>` with the link role
// (https://necolas.github.io/react-native-web/docs/accessibility/), so it opens in a new tab with
// a modifier as any link does. TextLink (admin.tsx) is the underlined link in running text's place.
// TitleButton is the same title as a button, for a title that opens something on the page rather
// than going anywhere (Downloads' torrent opening its sheet, the web's `<button className=
// "hover:underline">`).

import type { ColorRole } from '@highsea-tv/tokens'
import { Press } from './press.tsx'
import { Text } from './text.tsx'
import { tokens } from './theme.tsx'

type TitleLook = {
  children: string
  /** `text` by default. */
  color?: ColorRole
  /** 500, as a session's title in Now playing; 400 by default. */
  weight?: 400 | 500
}

export type TitleLinkProps = TitleLook & { href: string }
export type TitleButtonProps = TitleLook & { onPress: () => void }

export function TitleLink({ href, ...look }: TitleLinkProps) {
  return <Title role="link" extra={{ href }} {...look} />
}

export function TitleButton({ onPress, ...look }: TitleButtonProps) {
  return <Title role="button" extra={{ onPress }} {...look} />
}

function Title({
  role,
  extra,
  children,
  color = 'text',
  weight,
}: TitleLook & { role: 'link' | 'button'; extra: object }) {
  const ui = tokens.adminText.ui
  return (
    <Press
      role={role}
      {...extra}
      style={{ flexShrink: 1, minWidth: 0, borderRadius: tokens.radius.sm }}
    >
      {({ hovered }) => (
        <Text
          size={ui.size}
          leading={ui.leading}
          weight={weight}
          color={color}
          numberOfLines={1}
          style={hovered ? { textDecorationLine: 'underline' } : undefined}
        >
          {children}
        </Text>
      )}
    </Press>
  )
}

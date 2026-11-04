// SPDX-License-Identifier: AGPL-3.0-only
// Alerts with a pointer (connectivity.md › Announcements): the prototype's web/shell.tsx Alerts, a
// 384-wide popover hung from the top bar's bell (the library's Popover), with every live
// announcement from the server's owner, newest first, each the library's NoticeCard in its list
// form: its icon, title, body (links open in the browser) and call to action. Opening it counts the
// new ones as seen, and they keep their New mark until it closes; one that must be acknowledged is
// the shell's dialog's to mark, when Got it is pressed. The TV's Alerts is its page, /alerts.
import { shellMessages } from '@highsea-tv/client/gate'
import { useT } from '@highsea-tv/i18n/react'
import { Popover, ScrollView, Text, tokens } from '@highsea-tv/ui'
import { type ComponentRef, type ReactNode, type RefObject, useRef, useState } from 'react'
import { useWindowDimensions, type View } from 'react-native'
import { AlertsList } from '../alerts/list.tsx'
import { NOTE_WIDTH } from '../kit.tsx'

const { space } = tokens

/** What the popover hangs from: the bell's wrapper. */
export type BellAnchor = RefObject<ComponentRef<typeof View> | null>

/** The popover's width, the prototype's w-96: a note's. */
export const ALERTS_WIDTH = NOTE_WIDTH

/** The list's tallest, the prototype's max-h-[min(28rem,70svh)]. */
const ALERTS_TALLEST = space['16'] * 7
const ALERTS_SHARE = 0.7

/**
 * The bell's popover, and what opening it does: `trigger` draws the bell with `open`'s state and
 * the anchor it hangs from. The list is ../alerts/list.tsx's, the one the Alerts page draws, which
 * counts the new ones as seen as it opens (the Popover's Modal draws it only while open).
 */
export function AlertsPopover({
  trigger,
}: {
  trigger: (bell: { open: boolean; toggle: () => void; anchor: BellAnchor }) => ReactNode
}) {
  const s = useT(shellMessages)
  const window = useWindowDimensions()
  const anchor: BellAnchor = useRef(null)
  const [open, setOpen] = useState(false)
  return (
    <>
      {trigger({ open, toggle: () => setOpen((o) => !o), anchor })}
      <Popover
        title={s('alerts')}
        open={open}
        onClose={() => setOpen(false)}
        anchor={anchor}
        width={ALERTS_WIDTH}
      >
        <Text variant="body" weight={600} accessibilityRole="header">
          {s('alerts')}
        </Text>
        <ScrollView style={{ maxHeight: Math.min(ALERTS_TALLEST, window.height * ALERTS_SHARE) }}>
          {open ? <AlertsList /> : null}
        </ScrollView>
      </Popover>
    </>
  )
}

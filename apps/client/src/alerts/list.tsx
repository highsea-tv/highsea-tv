// SPDX-License-Identifier: AGPL-3.0-only
// The owner's announcements as a list with a pointer (connectivity.md › Announcements, the web
// prototype's Alerts popover in web/shell.tsx): newest first, each a NoticeCard in its list form,
// with its icon, title, body (links open in the browser) and call to action, New on the ones that
// were new as it opened. Showing it counts the new ones as seen; they keep their New mark while
// it's open. With none, a centred line; one that can't load says so, with Try again. Alerts' page
// draws it under its heading, and the shell can draw it in the top bar's bell popover.
import { filmsMessages, toneOf } from '@highsea-tv/client/films'
import { inlineParts } from '@highsea-tv/client/format'
import { shellMessages } from '@highsea-tv/client/gate'
import { useT } from '@highsea-tv/i18n/react'
import { Button, EmptyState, NoticeCard, Text, tokens } from '@highsea-tv/ui'
import { useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import { openBrowser } from '../browser.ts'
import { Centered } from '../kit.tsx'
import { useHereAnnouncements } from '../shell/announcements.tsx'
import { alertsMessages } from './messages.ts'

const { space } = tokens

/** The live announcements, and those that were new as the list opened, now counted as seen. */
export function useAlerts() {
  const a = useHereAnnouncements()
  const [fresh, setFresh] = useState<string[]>([])
  const counted = useRef(false)
  useEffect(() => {
    if (counted.current || a.all.length === 0) return
    counted.current = true
    // A must-acknowledge announcement is the shell's to mark, when Got it is pressed.
    const read = a.unread.filter((x) => x.acknowledgement !== 'require')
    setFresh(read.map((x) => x.id))
    for (const x of read) void a.dismiss(x.id)
  }, [a])
  return { a, fresh }
}

/** The announcements' list with a pointer, without a heading of its own. */
export function AlertsList() {
  const t = useT(alertsMessages)
  const f = useT(filmsMessages)
  const s = useT(shellMessages)
  const { a, fresh } = useAlerts()
  if (a.list.status === 'loading') return <Centered />
  if (a.list.status === 'error')
    return (
      <EmptyState
        tone="error"
        icon="alert"
        title={t('failed')}
        action={<Button onPress={a.list.refetch}>{s('tryAgain')}</Button>}
      >
        {a.list.error.message}
      </EmptyState>
    )
  if (a.all.length === 0)
    return (
      // the prototype's px-4 py-6 text-center
      <Text variant="body" color="text-3" align="center" style={{ paddingVertical: space['6'] }}>
        {t('none')}
      </Text>
    )
  return (
    <View role="list" accessibilityLabel={t('list')} style={{ gap: space['4'] }}>
      {a.all.map((x) => (
        <View key={x.id} role="listitem">
          <NoticeCard
            title={x.title}
            body={inlineParts(x.body)}
            onLink={(url) => void openBrowser(url)}
            warning={toneOf(x.severity) === 'warning'}
            mark={fresh.includes(x.id) ? f('new') : null}
            action={
              x.cta ? (
                <Button icon="globe" onPress={() => void openBrowser(x.cta?.url ?? '')}>
                  {x.cta.label}
                </Button>
              ) : null
            }
          />
        </View>
      ))}
    </View>
  )
}

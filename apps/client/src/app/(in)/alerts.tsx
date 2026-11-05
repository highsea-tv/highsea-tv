// SPDX-License-Identifier: AGPL-3.0-only
// Alerts (connectivity.md › Announcements): every live announcement from the server's owner, newest
// first. Opening it counts the new ones as seen; they keep their New mark while it's open. The
// head's bell opens it on the TV.
// The TV (the prototype's tv/alerts.tsx): under the shell's head, the title, then each one a
//   focus stop the remote moves down through (the library's NoticeCard, its TV form), the page
//   following focus, Down from the head landing on the first. The TV can't follow a link, so a link
//   shows its words and a call to action stays on the other apps. With none, the words and Home,
//   which takes focus, in the middle of the space left;
// With a pointer Alerts is the top bar's bell popover (../../shell/alerts.tsx, drawing
// ../../alerts/list.tsx), so its address goes Home, as on the phone, whose owner's announcements
// are Home's card. A list that can't load says so, with Try again.
import { filmsMessages, toneOf } from '@highsea-tv/client/films'
import { inlineParts } from '@highsea-tv/client/format'
import { shellMessages } from '@highsea-tv/client/gate'
import { useT } from '@highsea-tv/i18n/react'
import { Button, NoticeCard, Text, tokens, useFormFactor, useTheme } from '@highsea-tv/ui'
import { Kept, TV_HEAD_HEIGHT, TvMessage, TvPage, type ViewHandle } from '@highsea-tv/ui/tv'
import { Redirect, router } from 'expo-router'
import { useCallback, useState } from 'react'
import { View } from 'react-native'
import { useAlerts } from '../../alerts/list.tsx'
import { alertsMessages } from '../../alerts/messages.ts'
import { TV_ALERTS } from '../../alerts/sizes.ts'
import { Centered, useChromeOverlay, useHeadDown } from '../../kit.tsx'
import { LibraryTitle } from '../../library/parts.tsx'
import { TV_LIBRARY } from '../../library/sizes.ts'

const tv = tokens.tv

export default function Alerts() {
  // with a pointer Alerts is the bell's popover, and the phone has none: the address goes Home
  return useFormFactor().input === 'tv' ? <TvAlerts /> : <Redirect href="/" />
}

function TvAlerts() {
  const t = useT(alertsMessages)
  const f = useT(filmsMessages)
  const s = useT(shellMessages)
  const u = useTheme().u
  const { a, fresh } = useAlerts()
  // Down from the head goes to the list's first (the prototype's down="alerts")
  const [first, setFirst] = useState<ViewHandle | null>(null)
  const firstRef = useCallback((v: ViewHandle | null) => setFirst(v), [])
  useHeadDown(first)
  // the head lies over the page and scrolls away with it, as on Movies and the prototype's
  // tv/alerts.tsx, where it's the page's first row: under a head of its own the page's top fade
  // would fall on the title
  const chrome = useChromeOverlay()
  if (a.list.status === 'loading') return <Centered />
  if (a.list.status === 'error')
    return (
      <TvMessage
        title={t('failed')}
        actions={
          <Button variant="primary" hasTVPreferredFocus onPress={a.list.refetch}>
            {s('tryAgain')}
          </Button>
        }
      >
        {a.list.error.message}
      </TvMessage>
    )
  const empty = a.all.length === 0
  return (
    <TvPage keep={0.3} onScroll={chrome.onScroll} scrollEventThrottle={chrome.scrollEventThrottle}>
      <View
        style={{
          flexGrow: 1,
          paddingHorizontal: tv.safe.x * u,
          // clear of the head laid over the page
          paddingTop: (TV_HEAD_HEIGHT + TV_LIBRARY.pageGap) * u,
          paddingBottom: tv.safe.y * u,
          gap: TV_LIBRARY.pageGap * u,
        }}
      >
        <LibraryTitle>{s('alerts')}</LibraryTitle>
        {empty ? (
          <View
            style={{
              flex: 1,
              alignSelf: 'center',
              alignItems: 'center',
              justifyContent: 'center',
              maxWidth: TV_LIBRARY.emptyWidth * u,
              gap: TV_ALERTS.emptyGap * u,
            }}
          >
            <Text variant="synopsis" color="text-2" align="center">
              {t('none')}
            </Text>
            <Button
              ref={firstRef}
              variant="overlay"
              icon="home"
              hasTVPreferredFocus
              onPress={() => router.dismissTo('/')}
            >
              {s('home')}
            </Button>
          </View>
        ) : (
          <View
            role="list"
            accessibilityLabel={t('list')}
            style={{ width: TV_ALERTS.width * u, maxWidth: '100%', gap: TV_ALERTS.gap * u }}
          >
            {a.all.map((x, i) => (
              <Kept key={x.id} role="listitem">
                <NoticeCard
                  ref={i === 0 ? firstRef : undefined}
                  preferred={i === 0}
                  title={x.title}
                  body={inlineParts(x.body)}
                  warning={toneOf(x.severity) === 'warning'}
                  mark={fresh.includes(x.id) ? f('new') : null}
                />
              </Kept>
            ))}
          </View>
        )}
      </View>
    </TvPage>
  )
}

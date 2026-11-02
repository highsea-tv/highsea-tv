// SPDX-License-Identifier: AGPL-3.0-only
// Alerts, TV (the prototype's tv/alerts.tsx): the bell left of the account in the head opens it, in
// place of the banner across Home's top. Every live announcement, newest first, each a focus stop
// the remote moves down through. Opening it counts the new ones as seen; they keep their mark while
// it's open. The TV can't follow a link, so a link shows its words and a call to action stays on
// the other apps.
import { useAnnouncements } from '@highsea-tv/client/data'
import { inlineParts } from '@highsea-tv/client/format'
import { useT } from '@highsea-tv/i18n/react'
import { Button, Text, tokens, useTheme } from '@highsea-tv/ui'
import { Kept, TvNoticeCard, TvPage, type ViewHandle } from '@highsea-tv/ui/tv'
import { router } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import { appKind, TvHead } from '../kit.tsx'
import { alerts as messages } from '../messages.ts'

const tv = tokens.tv

export default function Alerts() {
  const t = useT(messages)
  const u = useTheme().u
  const a = useAnnouncements(appKind)
  const [fresh, setFresh] = useState<string[] | null>(null)
  const counted = useRef(false)
  useEffect(() => {
    if (counted.current || a.all.length === 0) return
    counted.current = true
    setFresh(a.unread.map((x) => x.id))
    for (const x of a.unread) void a.dismiss(x.id)
  }, [a])
  // the first card, kept as state too: the head's Down goes to it
  const [first, setFirst] = useState<ViewHandle | null>(null)
  const empty = a.list.status === 'success' && a.all.length === 0
  return (
    <View style={{ flex: 1 }}>
      <TvPage keep={0.3}>
        <TvHead down={empty ? null : first} />
        <View style={{ paddingHorizontal: tv.safe.x * u, paddingTop: 1.6 * u, gap: 1.6 * u }}>
          <Text variant="heroTitle" size={2.6} accessibilityRole="header">
            {t('title')}
          </Text>
          {empty ? (
            <View style={{ alignItems: 'center', gap: 1.4 * u, paddingTop: 8 * u }}>
              <Text variant="synopsis" color="text-2">
                {t('none')}
              </Text>
              <Button
                variant="overlay"
                icon="home"
                hasTVPreferredFocus
                onPress={() => router.dismissTo('/')}
              >
                {t('home')}
              </Button>
            </View>
          ) : (
            <View style={{ maxWidth: 60 * u, gap: 1.2 * u, paddingBottom: tv.safe.y * u }}>
              {a.all.map((x, i) => (
                <Kept key={x.id}>
                  <TvNoticeCard
                    ref={i === 0 ? setFirst : undefined}
                    preferred={i === 0}
                    title={x.title}
                    body={inlineParts(x.body)}
                    warning={x.severity === 'warning'}
                    mark={fresh?.includes(x.id) ? t('new') : null}
                  />
                </Kept>
              ))}
            </View>
          )}
        </View>
      </TvPage>
    </View>
  )
}

// SPDX-License-Identifier: AGPL-3.0-only
// Kept in (client-settings.md › Offline, desktop-app.md › Kept in): the folder the desktop app
// keeps its downloads in, among the desktop app's Downloads page's settings, as the prototype's
// web/kept-in.tsx places it (OfflineList's `settings`). Change opens the system's folder picker
// through the desktop host (./host.ts); what's already downloaded then moves there after asking,
// playing from where it is until it has moved. Drawn only in the desktop app.
import { bytes } from '@highsea-tv/core/format'
import { useT } from '@highsea-tv/i18n/react'
import { Button, Dialog, Field, ProgressBar, Text, tokens } from '@highsea-tv/ui'
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { useSay } from '../kit.tsx'
import { useDesktopHost } from './host.ts'
import { keptInMessages } from './messages.ts'

const { space } = tokens

export type KeptInProps = {
  /** What's downloaded on this computer now: how many films, and their bytes on disk. */
  kept: { count: number; bytes: number }
}

export function KeptIn({ kept }: KeptInProps) {
  const t = useT(keptInMessages)
  const say = useSay()
  const host = useDesktopHost()
  const [folder, setFolder] = useState<string | null>(null)
  const [asking, setAsking] = useState<string | null>(null)
  const [moving, setMoving] = useState<{ to: string; done: number } | null>(null)

  useEffect(() => {
    if (!host) return
    let live = true
    host.keptIn.folder().then(
      (f) => live && setFolder(f),
      () => {},
    )
    return () => {
      live = false
    }
  }, [host])

  if (!host) return null

  const move = (to: string) => {
    const from = folder ?? ''
    setMoving({ to, done: 0 })
    host.keptIn
      .move(to, (done) => setMoving((m) => (m ? { ...m, done } : m)))
      .then(
        () => {
          setFolder(to)
          say({ title: t('moved'), body: to })
        },
        () => say({ title: t('failed', { from }) }),
      )
      .finally(() => setMoving(null))
  }

  const change = async () => {
    const to = await host.keptIn.choose().catch(() => null)
    if (!to || to === folder) return
    if (kept.count === 0) {
      // nothing to move: the folder is the new one at once
      await host.keptIn.move(to, () => {}).catch(() => {})
      setFolder(to)
      say({ title: t('newHere'), body: to })
    } else setAsking(to)
  }

  return (
    <>
      <Field label={t('label')} hint={t('hint')}>
        <View style={{ gap: space['2'] }}>
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: space['2'],
            }}
          >
            <Text
              variant="mono"
              mono
              color="text-2"
              numberOfLines={1}
              accessibilityLabel={`${t('label')} ${folder ?? ''}`}
              style={{ flexShrink: 1, minWidth: 0 }}
            >
              {folder ?? ''}
            </Text>
            <Button
              size="sm"
              icon="folder"
              disabled={moving !== null || folder === null}
              onPress={() => void change()}
            >
              {t('change')}
            </Button>
          </View>
          {moving ? (
            <View
              accessibilityRole="progressbar"
              accessibilityLiveRegion="polite"
              style={{ gap: space['1'] + space['0.5'] }}
            >
              <ProgressBar value={moving.done * 100} label={t('moving')} />
              <Text variant="caption" color="text-3">
                {t('movingBody', {
                  count: kept.count,
                  to: moving.to,
                  done: bytes(kept.bytes * moving.done),
                  total: bytes(kept.bytes),
                })}
              </Text>
            </View>
          ) : null}
        </View>
      </Field>
      <Dialog
        open={asking !== null}
        onClose={() => setAsking(null)}
        title={t('askTitle')}
        footer={
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'flex-end',
              flexWrap: 'wrap',
              gap: space['2'],
            }}
          >
            <Button variant="ghost" onPress={() => setAsking(null)}>
              {t('cancel')}
            </Button>
            <Button
              variant="primary"
              onPress={() => {
                const to = asking
                setAsking(null)
                if (to) move(to)
              }}
            >
              {t('move')}
            </Button>
          </View>
        }
      >
        <Text variant="body" color="text-2">
          {t('askBody', { count: kept.count, total: bytes(kept.bytes), to: asking ?? '' })}
        </Text>
      </Dialog>
    </>
  )
}

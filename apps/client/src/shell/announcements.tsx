// SPDX-License-Identifier: AGPL-3.0-only
// The owner's announcements (connectivity.md › Announcements, client-home.md › Announcements),
// which the shell shows over every destination, as the prototypes' shells do (web/shell.tsx's
// AnnouncementModal and AnnouncementToasts, mobile/shell.tsx's AnnouncementDialog, and the TV's
// tv/home.tsx AcknowledgeScreen):
// - one that must be acknowledged: with a pointer or touch, a dialog that only Got it or its call
//   to action closes, never Escape or a press outside it (the library's Dialog without `onClose`);
//   on the TV, a screen of its own over the page, with the head hidden, focus kept in it and Got it
//   focused. The TV can't follow a link, so it has no call to action;
// - with a pointer, the toast-placed ones: one at a time, each once while the app is open, and
//   counted as seen only once it shows;
// - on touch, the first card-placed one, which Home draws under its header (AnnouncementCard).
// Bodies are the shared inline markdown (inlineParts), drawn by the library's InlineText: bold,
// italic and links, a link opening in the system browser. The TV's screen is the library's
// TvAcknowledge, and the toasts go to kit's NoteRegion; this file joins them to the announcements
// and to Back.
import type { ClientAnnouncement } from '@highsea-tv/api-contract'
import { useAnnouncements } from '@highsea-tv/client/data'
import { inlineParts } from '@highsea-tv/client/format'
import { useT } from '@highsea-tv/i18n/react'
import { useMedia } from '@highsea-tv/native/media'
import { Banner, Button, Dialog, InlineText, tokens, useFormFactor } from '@highsea-tv/ui'
import { TvAcknowledge } from '@highsea-tv/ui/tv'
import { Image } from 'expo-image'
import { type ComponentProps, useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import { useBack, useLeaveOnBack } from '../back.tsx'
import { openBrowser } from '../browser.ts'
import { useDeviceClient } from '../host'
import { Notice, useNote } from '../kit.tsx'
import { announcements as announcementMessages } from '../messages.ts'

const { space } = tokens

/** The announcements for this kind of app: the one query the shell, Home and Alerts share. */
export const useHereAnnouncements = () => useAnnouncements(useDeviceClient())

const openLink = (url: string) => void openBrowser(url)

/**
 * An announcement's body: the library's InlineText over its runs, a link opening in the system
 * browser.
 */
export function AnnouncementText({
  text,
  variant,
  color,
}: {
  text: string
  variant?: ComponentProps<typeof InlineText>['variant']
  color?: ComponentProps<typeof InlineText>['color']
}) {
  return <InlineText runs={inlineParts(text)} onLink={openLink} variant={variant} color={color} />
}

/** The call to action, opening its page in the system browser. */
function Cta({ cta }: { cta: ClientAnnouncement['cta'] }) {
  if (!cta) return null
  return (
    <Button icon="globe" onPress={() => void openBrowser(cta.url)}>
      {cta.label}
    </Button>
  )
}

/** The first card-placed announcement as Home's card under its header: dismissible (touch). */
export function AnnouncementCard() {
  const a = useHereAnnouncements()
  const card = a.cards[0]
  if (!card) return null
  return (
    <Banner
      title={card.title}
      onDismiss={() => void a.dismiss(card.id)}
      action={card.cta ? <Cta cta={card.cta} /> : undefined}
    >
      <AnnouncementText text={card.body} variant="callout" />
    </Banner>
  )
}

/**
 * The shell's announcements with a pointer or touch: the dialog for one that must be acknowledged,
 * and with a pointer the toasts.
 */
export function ShellAnnouncements() {
  const pointer = useFormFactor().input === 'pointer'
  return (
    <>
      <AcknowledgeDialog />
      {pointer ? <AnnouncementToasts /> : null}
    </>
  )
}

/**
 * Got it: held while the server hears it, so it's pressed once, and on a failure the
 * announcement stays, saying so, for Got it again.
 */
function useAcknowledge() {
  const a = useHereAnnouncements()
  const [pending, setPending] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  // held at once, before the press after it can render
  const holding = useRef(false)
  const done = async (x: ClientAnnouncement) => {
    if (holding.current) return
    holding.current = true
    setPending(x.id)
    setFailed(null)
    try {
      await a.dismiss(x.id)
    } catch {
      setFailed(x.id)
    } finally {
      holding.current = false
      setPending(null)
    }
  }
  return { done, pending, failed }
}

/**
 * One that must be acknowledged, with a pointer or touch: a dialog at the prototypes' small size
 * (web/shell.tsx's AnnouncementModal, mobile/shell.tsx's AnnouncementDialog) that only Got it or
 * its call to action closes. The library's Dialog without `onClose` has no scrim to press and does
 * nothing on Escape or Android's Back (its Modal's `onRequestClose`). Touch has Got it across the
 * width, under the call to action, and a 16:9 image; a pointer has them on one line at the end, and
 * a 21:9 image. The body is in `text-2`.
 */
function AcknowledgeDialog() {
  const t = useT(announcementMessages)
  const touch = useFormFactor().input === 'touch'
  const a = useHereAnnouncements()
  const media = useMedia()
  const ack = useAcknowledge()
  const m = a.modal
  const gotIt = m && (
    <Button
      variant="primary"
      block={touch}
      loading={ack.pending === m.id}
      disabled={ack.pending !== null}
      onPress={() => void ack.done(m)}
    >
      {t('gotIt')}
    </Button>
  )
  return (
    <Dialog
      open={!!m}
      size="sm"
      title={m?.title ?? t('announcement')}
      footer={
        m &&
        (touch ? (
          <View style={{ gap: space['2'] }}>
            {m.cta ? (
              <Button block icon="globe" onPress={() => void openBrowser(m.cta?.url ?? '')}>
                {m.cta.label}
              </Button>
            ) : null}
            {gotIt}
          </View>
        ) : (
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              justifyContent: 'flex-end',
              gap: space['2'],
            }}
          >
            <Cta cta={m.cta} />
            {gotIt}
          </View>
        ))
      }
    >
      {m && (
        <View style={{ gap: space['4'] }}>
          {m.image ? (
            <Image
              source={media(m.image)}
              style={{
                width: '100%',
                aspectRatio: touch ? 16 / 9 : 21 / 9,
                borderRadius: tokens.radius.md,
              }}
              contentFit="cover"
              accessibilityIgnoresInvertColors
            />
          ) : null}
          <AnnouncementText text={m.body} variant="body" color="text-2" />
          {ack.failed === m.id ? <Notice>{t('notHeard')}</Notice> : null}
        </View>
      )}
    </Dialog>
  )
}

/** The toasts shown since the app opened, so each shows once while it's open. */
const shownSinceOpen = new Set<string>()

/**
 * Toast-placed announcements, with a pointer: as the prototype's web/shell.tsx, each once while the
 * app is open, all at once in the server's order, stacked in the shell's note region (kit's
 * NoteRegion) and counted as seen as it shows. Their bodies keep their runs.
 */
function AnnouncementToasts() {
  const a = useHereAnnouncements()
  const note = useNote()
  const dismiss = useRef(a.dismiss)
  dismiss.current = a.dismiss
  const toasts = a.toasts
  useEffect(() => {
    for (const x of toasts) {
      if (shownSinceOpen.has(x.id)) continue
      shownSinceOpen.add(x.id)
      note({ title: x.title, runs: inlineParts(x.body) }, null)
      void dismiss.current(x.id).catch(() => {})
    }
  }, [toasts, note])
  return null
}

/**
 * On the TV, one that must be acknowledged is a screen of its own over the page, as the
 * prototype's tv/home.tsx AcknowledgeScreen draws it (client-home.md: a modal over a D-pad layout
 * would leave focus ambiguous). The shell hides the head and the page while it shows, and the
 * library's TvAcknowledge keeps focus on Got it. Only Got it closes it: Back leaves
 * highsea, as it did from the prototype's screen in Home's place, rather than moving the page under
 * it.
 */
export function TvAnnouncement({ item }: { item: ClientAnnouncement }) {
  const t = useT(announcementMessages)
  const media = useMedia()
  const ack = useAcknowledge()
  const note = useNote()
  const failed = ack.failed === item.id
  // the shell's own note, for no page: the page under it is hidden, and its notes with it
  useEffect(() => {
    if (failed) note({ title: t('notHeard') }, null)
  }, [failed, note, t])
  useBack(() => false)
  useLeaveOnBack(true)
  return (
    <TvAcknowledge
      eyebrow={t('fromOwner')}
      title={item.title}
      body={inlineParts(item.body)}
      image={media(item.image)}
      action={t('gotIt')}
      // TvAcknowledge has no busy or error state of its own: a second press does nothing while the
      // server hears the first, and a failure is said at the foot while the screen stays
      onAcknowledge={() => void ack.done(item)}
    />
  )
}

'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// An episode file's intro and credits in the admin's episode row (Phase 5 C2, ADR 0067): one line
// under the file, what the player skips, with a small Edit that opens a dialog. The owner sets a
// time or clears it, and highsea keeps it when it looks at the season again; Find again forgets
// what was set and looks again. Drawn with the library's parts only, as small as it can be: the
// episode row is a locked screen, and this is its one addition.
import type { EpisodeMarkersPatch, SeriesEpisode } from '@highsea-tv/api-contract'
import { useT } from '@highsea-tv/i18n/react'
import { useAction } from '@highsea-tv/sdk/react'
import { Button, Dialog, Field, Input, Text, toast, tokens } from '@highsea-tv/ui/native'
import { useState } from 'react'
import { View } from 'react-native'
import { FormError } from './collections-rules.tsx'
import { markTime, readMarkTime } from './show-data.ts'
import { shows as messages } from './shows-messages.ts'

const s = tokens.space

/** The line under an episode's file: its intro and credits, or that they're still to be found. */
export function EpisodeMarks({ episode: e, label }: { episode: SeriesEpisode; label: string }) {
  const t = useT(messages)
  const [open, setOpen] = useState(false)
  const m = e.markers
  if (!m) return null
  const yours = m.introSource === 'owner' || m.creditsSource === 'owner'
  const line =
    !m.checked && !m.intro && m.credits === null
      ? t('marks.waiting')
      : [
          m.intro
            ? t('marks.intro', { start: markTime(m.intro.start), end: markTime(m.intro.end) })
            : t('marks.noIntro'),
          m.credits !== null
            ? t('marks.credits', { start: markTime(m.credits) })
            : t('marks.noCredits'),
          yours ? t('marks.yours') : null,
        ]
          .filter(Boolean)
          .join(' · ')
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: s['1'], minWidth: 0 }}>
      <Text variant="caption" color="text-3" numberOfLines={1} style={{ flexShrink: 1 }}>
        {line}
      </Text>
      <Button
        size="sm"
        variant="ghost"
        iconOnly
        icon="edit"
        accessibilityLabel={t('marks.edit', { label })}
        hasPopup="dialog"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
      />
      {open && <MarksDialog episode={e} label={label} onClose={() => setOpen(false)} />}
    </View>
  )
}

function MarksDialog({
  episode: e,
  label,
  onClose,
}: {
  episode: SeriesEpisode
  label: string
  onClose: () => void
}) {
  const t = useT(messages)
  const m = e.markers
  const shown = (v: number | null | undefined) => (v === null || v === undefined ? '' : markTime(v))
  const [introStart, setIntroStart] = useState(shown(m?.intro?.start))
  const [introEnd, setIntroEnd] = useState(shown(m?.intro?.end))
  const [credits, setCredits] = useState(shown(m?.credits))
  const params = { id: e.show, episodeId: e.id }
  const save = useAction((c, body: EpisodeMarkersPatch) => c.series.setMarkers({ params, body }))
  const find = useAction((c) => c.series.findMarkers({ params }))

  const a = readMarkTime(introStart)
  const b = readMarkTime(introEnd)
  const c = readMarkTime(credits)
  const introError =
    a === undefined || b === undefined
      ? t('marks.badTime')
      : (a === null) !== (b === null)
        ? t('marks.introBoth')
        : a !== null && b !== null && b <= a
          ? t('marks.introOrder')
          : undefined
  const creditsError = c === undefined ? t('marks.badTime') : undefined

  /** Only what changed is sent, so a mark left as found stays found. */
  const patch = (): EpisodeMarkersPatch => {
    const out: EpisodeMarkersPatch = {}
    const intro = a != null && b != null ? { start: a, end: b } : null
    const was = m?.intro ?? null
    if (introStart !== shown(was?.start) || introEnd !== shown(was?.end)) out.intro = intro
    if (credits !== shown(m?.credits)) out.credits = c ?? null
    return out
  }
  const submit = () => {
    const body = patch()
    if (body.intro === undefined && body.credits === undefined) return onClose()
    save.run(body).then(
      () => {
        onClose()
        toast.success(t('marks.saved', { label }))
      },
      () => {
        // the error shows in the dialog
      },
    )
  }
  const again = () =>
    find.run().then(
      () => {
        onClose()
        toast({ title: t('marks.finding', { label }) })
      },
      () => {
        // the error shows in the dialog
      },
    )
  const source = (v: 'chapters' | 'audio' | 'owner' | null | undefined) =>
    v ? t('marks.found', { source: t(`marks.source.${v}`) }) : undefined
  const yours = m?.introSource === 'owner' || m?.creditsSource === 'owner'
  const failed = save.error ?? find.error

  return (
    <Dialog
      open
      onClose={onClose}
      closable
      size="sm"
      title={t('marks.title')}
      description={t('marks.body', { label })}
      footer={
        <>
          {yours && (
            <Button variant="ghost" icon="refresh" onPress={again} loading={find.pending}>
              {t('marks.findAgain')}
            </Button>
          )}
          <Button variant="ghost" onPress={onClose}>
            {t('cancel')}
          </Button>
          <Button
            variant="primary"
            onPress={submit}
            loading={save.pending}
            disabled={!!introError || !!creditsError}
          >
            {t('save')}
          </Button>
        </>
      }
    >
      <View style={{ gap: s['4'] }}>
        <View style={{ flexDirection: 'row', gap: s['3'] }}>
          <View style={{ flex: 1 }}>
            <Field label={t('marks.introStart')} hint={source(m?.introSource)} error={introError}>
              <Input
                mono
                value={introStart}
                onChangeText={setIntroStart}
                placeholder={t('marks.placeholder')}
                inputMode="decimal"
              />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label={t('marks.introEnd')}>
              <Input
                mono
                value={introEnd}
                onChangeText={setIntroEnd}
                placeholder={t('marks.placeholder')}
                inputMode="decimal"
                invalid={!!introError}
              />
            </Field>
          </View>
        </View>
        <Field label={t('marks.creditsStart')} hint={source(m?.creditsSource)} error={creditsError}>
          <Input
            mono
            value={credits}
            onChangeText={setCredits}
            placeholder={t('marks.placeholder')}
            inputMode="decimal"
          />
        </Field>
        {failed && <FormError>{failed.message}</FormError>}
      </View>
    </Dialog>
  )
}

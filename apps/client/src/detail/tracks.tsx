// SPDX-License-Identifier: AGPL-3.0-only
// What a film plays with, its version, audio and subtitles, from the person's picks (usePicks, kept
// on the server for every device) through @highsea-tv/client/films' picksOf, drawn two ways:
// - WatchWith, touch's and a pointer's (the prototype's web/detail.tsx WatchWith, compact): a field
//   for each, the version's detail in place of a menu when there's only one to play;
// - TvTracks, the TV's (the prototype's tv/tracks.tsx, ported from apps/tv/src/tracks.tsx): a
//   dialog at the right of the screen (@highsea-tv/ui/tv's TvSideDialog) that keeps focus inside it
//   until Back closes it, taking focus on its first option as it opens.
// A new version has its own tracks, so picking one clears the audio and subtitle picked for the
// last. The player (B2) shares TvTracks, adding the subtitle timing under the groups.
// The TV's groups are @highsea-tv/ui/tv's TvRadioGroup.
import type {
  ClientAudio,
  ClientDetail,
  ClientSubtitle,
  ClientVersion,
} from '@highsea-tv/api-contract'
import { usePicks } from '@highsea-tv/client/data'
import { createFilmsText, OFF, picksOf, versionLabel } from '@highsea-tv/client/films'
import { useLocale, useT } from '@highsea-tv/i18n/react'
import { Field, Select, Text, useControl } from '@highsea-tv/ui'
import { focusOn, TvRadioGroup, TvSideDialog, type ViewHandle } from '@highsea-tv/ui/tv'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { View } from 'react-native'
import { useBack } from '../back.tsx'
import { detailMessages } from './messages.ts'

type Patch = { versionId?: string | null; audioId?: string | null; subtitleId?: string | null }

/**
 * The picks and what they come to, with a save that shows the pick at once, as Mark as watched
 * does (useWatched), then refreshes them; one that fails is undone, and says why.
 */
export function useWatchWith(d: ClientDetail) {
  const t = useT(detailMessages)
  const { picks, save } = usePicks(d.item.id)
  const [error, setError] = useState<string | null>(null)
  // what's been picked here and not yet read back from the server, laid over the picks it was
  // picked over until they're read again with no save on its way
  const [shown, setShown] = useState<{ patch: Patch; over: typeof picks.data } | null>(null)
  const [saving, setSaving] = useState(0)
  const laid = shown && (saving > 0 || shown.over === picks.data) ? shown.patch : null
  const current = laid
    ? {
        versionId: picks.data?.versionId ?? null,
        audioId: picks.data?.audioId ?? null,
        subtitleId: picks.data?.subtitleId ?? null,
        ...laid,
      }
    : picks.data
  // picksOf's tracks are inferred from the version only through its bound, so they're named
  const w = picksOf<ClientAudio, ClientSubtitle, ClientVersion>(d.versions, current)
  const run = (patch: Patch) => {
    const before = laid ? { patch: laid, over: picks.data } : null
    setShown({ patch: { ...laid, ...patch }, over: picks.data })
    setSaving((n) => n + 1)
    setError(null)
    return save.run(patch).then(
      () => {
        setSaving((n) => n - 1)
        picks.refresh()
      },
      (e: Error) => {
        setSaving((n) => n - 1)
        setShown(before)
        setError(t('saveFailed', { message: e.message }))
      },
    )
  }
  return {
    ...w,
    error,
    /** A version picked: its own tracks, so the last one's picks don't carry over. */
    pickVersion: (id: string) => {
      if (id !== w.version?.id) void run({ versionId: id, audioId: null, subtitleId: null })
    },
    pickAudio: (id: string) => void run({ audioId: id }),
    pickSubtitle: (id: string) => void run({ subtitleId: id === OFF ? null : id }),
  }
}

export type WatchWith = ReturnType<typeof useWatchWith>

/** The line under the credits: "4K · English · 5.1 · Subtitles off". */
export function picksLine(w: WatchWith, t: (key: 'defaultAudio' | 'subtitlesOff') => string) {
  if (!w.version) return null
  return [
    w.version.label,
    w.audio?.label ?? t('defaultAudio'),
    w.subtitle?.label ?? t('subtitlesOff'),
  ].join(' · ')
}

/** Version, audio and subtitles as fields, saved as they change: touch's sheet, a pointer's dialog. */
export function WatchWithFields({ w }: { w: WatchWith }) {
  const t = useT(detailMessages)
  const locale = useLocale()
  const films = useMemo(() => createFilmsText(locale), [locale])
  const m = useControl()
  const { playable, version } = w
  if (!version) return null
  return (
    <View style={{ gap: m.rowGap }}>
      <Field label={t('version')}>
        {playable.length > 1 ? (
          <Select
            value={version.id}
            onValueChange={w.pickVersion}
            options={playable.map((v) => ({ value: v.id, label: versionLabel(v) }))}
          />
        ) : (
          <View style={{ minHeight: m.height, justifyContent: 'center' }}>
            <Text variant="body" color="text-2">
              {version.detail ?? version.label}
            </Text>
          </View>
        )}
      </Field>
      <Field label={t('audio')}>
        <Select
          value={w.audioValue}
          onValueChange={w.pickAudio}
          options={
            version.audio.length > 0
              ? version.audio.map((a) => ({ value: a.id, label: a.label }))
              : [{ value: OFF, label: films.noAudio }]
          }
          disabled={version.audio.length < 2}
        />
      </Field>
      <Field label={t('subtitles')}>
        <Select
          value={w.subtitleValue}
          onValueChange={w.pickSubtitle}
          options={[
            { value: OFF, label: films.off },
            ...version.subtitles.map((s) => ({ value: s.id, label: s.label })),
          ]}
        />
      </Field>
      {w.error ? (
        <Text variant="caption" color="badge-danger" accessibilityRole="alert">
          {w.error}
        </Text>
      ) : null}
      <Text variant="caption" color="text-3">
        {t('remembered')}
      </Text>
    </View>
  )
}

/** The TV's Audio and subtitles: Back closes it, and so does picking a subtitle. */
export function TvTracks({
  w,
  onClose,
  children,
}: {
  w: WatchWith
  onClose: () => void
  /** What the player adds under the groups: the subtitle timing. */
  children?: ReactNode
}) {
  const t = useT(detailMessages)
  const locale = useLocale()
  const films = useMemo(() => createFilmsText(locale), [locale])
  useBack(() => {
    onClose()
    return true
  })
  const first = useRef<ViewHandle>(null)
  useEffect(() => {
    // after the native views exist: a request in the commit itself can land before them
    const frame = requestAnimationFrame(() => focusOn(first.current))
    return () => cancelAnimationFrame(frame)
  }, [])
  const version = w.version
  if (!version) return null
  const several = w.playable.length > 1
  return (
    <TvSideDialog label={t('tracks')}>
      <Text variant="rowTitle" accessibilityRole="header">
        {t('tracks')}
      </Text>
      {several ? (
        <TvRadioGroup
          title={t('version')}
          options={w.playable.map((v) => ({ value: v.id, label: versionLabel(v) }))}
          value={version.id}
          onChange={w.pickVersion}
          preferred
          firstRef={first}
        />
      ) : null}
      {version.audio.length > 0 ? (
        <TvRadioGroup
          title={t('audio')}
          options={version.audio.map((a) => ({ value: a.id, label: a.label }))}
          value={w.audioValue}
          onChange={w.pickAudio}
          preferred={!several}
          firstRef={several ? undefined : first}
        />
      ) : null}
      <TvRadioGroup
        title={t('subtitles')}
        options={[
          { value: OFF, label: films.off },
          ...version.subtitles.map((x) => ({ value: x.id, label: x.label })),
        ]}
        value={w.subtitleValue}
        onChange={(id) => {
          w.pickSubtitle(id)
          onClose()
        }}
        preferred={!several && version.audio.length === 0}
        firstRef={!several && version.audio.length === 0 ? first : undefined}
      />
      {children}
      <Text variant="pill" color={w.error ? 'badge-danger' : 'text-3'}>
        {w.error ?? t('tvSaved')}
      </Text>
    </TvSideDialog>
  )
}

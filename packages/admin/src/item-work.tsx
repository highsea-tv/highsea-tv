'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// What the server is doing to a library item (HT-106, the owner's note of 2026-11-19: "Refreshing
// metadata, and other jobs that touch media, needs to have some kind of status indicator for the
// item itself - both on the item page and in library grids"). One mark, three places:
// - on the item's page, by its actions: the spinner and the words ("Refreshing metadata", "2 tasks
//   running"), announced politely as they change, with a toast when a job it saw ends badly (the
//   reason under it) or well;
// - on a card, over the art's top end: the spinner on the poster's glass, the words on hover or
//   focus;
// - on a table row, over the title's thumbnail: the same.
// The card's and the row's are drawn over what's there, so nothing moves as work comes and goes.
// The library has no spinner of its own beyond React Native's ActivityIndicator, which its Button
// draws while loading (`button.tsx`); this draws the same, on the posters' glass (`glassOf`), and
// takes the library's Tooltip for the words. The library's reads are one each: every item's work
// for a grid or table (`system.work`), and one item's for its page (`system.itemWork`), both
// following `jobs.updated`, which the queue raises whenever a job is queued, starts, moves on or
// ends.
import { type ItemJob, WORK_TOPICS, type WorkKind } from '@highsea-tv/api-contract'
import { useT } from '@highsea-tv/i18n/react'
import { useQuery } from '@highsea-tv/sdk/react'
import {
  glassOf,
  Text,
  Tooltip,
  toast,
  tokens,
  useControl,
  useTheme,
  visuallyHidden,
} from '@highsea-tv/ui/native'
import { type ReactNode, useEffect, useMemo, useRef } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { itemWork as messages } from './item-work-messages.ts'
import { useRelative } from './time.ts'

const TOPICS = [WORK_TOPICS.jobs]

type Words = ReturnType<typeof useT<typeof messages>>

const isActive = (j: ItemJob) => j.state === 'queued' || j.state === 'running'

/** A job type's words ("Refreshing metadata"), or work in hand for one the admin doesn't know. */
function whatOf(t: Words, type: string) {
  const key = `type.${type}`
  return key in messages ? t(key as keyof typeof messages & `type.${string}`) : t('other')
}

/** What the jobs on an item come to, in a line. */
function useWords() {
  const t = useT(messages)
  const { relative } = useRelative()
  return (jobs: readonly ItemJob[], item?: { kind: WorkKind; id: string }) => {
    const active = jobs.filter(isActive)
    if (active.length === 0) return ''
    // two jobs of one type (subtitles for two episodes) are one line's worth of work
    const types = new Set(active.map((j) => j.type))
    if (types.size > 1) return t('several', { count: types.size })
    const job = active[0] as ItemJob
    let what = whatOf(t, job.type)
    const part = item && (job.subject.kind !== item.kind || job.subject.id !== item.id)
    if (
      part &&
      active.length === 1 &&
      (job.subject.kind === 'episode' || job.subject.kind === 'season')
    )
      what = t('part', { what, subject: t(`subject.${job.subject.kind}`) })
    if (active.length > 1) return what
    if (job.retryAt) return t('retry', { what, when: relative(job.retryAt) })
    if (job.state === 'queued') return t('waiting', { what })
    if (job.progress !== null && job.progress > 0)
      return { text: t('progress', { what, percent: job.progress }), steady: what }
    return what
  }
}

/**
 * Every item's work, for a library's marks: one read, refetched when a job changes. Gives an
 * item's jobs by its id, or none.
 */
export function useLibraryWork(kind: WorkKind) {
  const work = useQuery('item-work', (c) => c.system.work(), TOPICS)
  return useMemo(() => {
    const byId = new Map<string, ItemJob[]>()
    for (const w of work.data ?? []) if (w.kind === kind) byId.set(w.id, w.jobs)
    return (id: string | number): ItemJob[] | undefined => byId.get(String(id))
  }, [work.data, kind])
}

/**
 * One item's work, for its page: what's in hand, whether a job of a type is (to turn its action
 * off while it runs), and a toast when a job the page saw running ends: the reason when it failed.
 */
export function useItemWork(kind: WorkKind, id: string | number, title: string | undefined) {
  const t = useT(messages)
  const key = String(id)
  const work = useQuery(
    `item-work:${kind}:${key}`,
    (c) => c.system.itemWork({ params: { kind, id: key } }),
    TOPICS,
  )
  const seen = useRef(new Set<string>())
  const titleRef = useRef(title)
  titleRef.current = title
  useEffect(() => {
    const data = work.data
    if (!data) return
    for (const j of data.finished) {
      if (!seen.current.has(j.id)) continue
      seen.current.delete(j.id)
      const what = whatOf(t, j.type)
      if (j.state === 'failed')
        toast.error(t('failed', { what }), j.error ? { description: j.error } : {})
      else if (j.state === 'succeeded') {
        const done = `done.${j.type}`
        toast.success(
          t((done in messages ? done : 'done.other') as keyof typeof messages & `done.${string}`, {
            title: titleRef.current ?? '',
          }),
        )
      }
    }
    for (const j of data.active) seen.current.add(j.id)
  }, [work.data, t])
  const jobs = work.data?.active ?? []
  return {
    jobs,
    item: { kind, id: key },
    /** A job of `type` is queued or running on the item itself. */
    busy: (type: string) => jobs.some((j) => j.type === type && j.subject.id === key),
  }
}

type Look = 'page' | 'poster' | 'thumb'

/**
 * The mark: on a page, the spinner and the words by the actions (nothing when there's no work);
 * on a card or a row, the spinner over the art, the words on hover or focus. `item` lets the words
 * say when the work is on one of a show's episodes.
 */
export function ItemWorkMark({
  jobs,
  look,
  item,
  aspect = 'poster',
}: {
  jobs: readonly ItemJob[] | undefined
  look: Look
  item?: { kind: WorkKind; id: string }
  /** A row's thumbnail shape, as TitleCell's `aspect`. */
  aspect?: 'poster' | 'square'
}) {
  const theme = useTheme()
  const control = useControl()
  const said = useWords()(jobs ?? [], item)
  // the words, and the same without the percent, which the page's live region announces: a screen
  // reader hears "Refreshing metadata" once, not every step of it
  const words = typeof said === 'string' ? said : said.text
  const steady = typeof said === 'string' ? said : said.steady
  if (look === 'page')
    return (
      // polite: the line changes as the work moves on, and a screen reader hears it between other
      // things (https://www.w3.org/TR/wai-aria-1.2/#aria-live)
      <View accessibilityLiveRegion="polite" style={{ flexShrink: 1, minWidth: 0 }}>
        {words ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.space['2'] }}>
            <ActivityIndicator aria-hidden size="small" color={theme.colors['text-2']} />
            <Text
              size={tokens.adminText.ui.size}
              color="text-2"
              numberOfLines={1}
              aria-hidden={steady !== words}
              style={{ flexShrink: 1 }}
            >
              {words}
            </Text>
            {steady !== words ? (
              <Text size={tokens.adminText.ui.size} style={visuallyHidden}>
                {steady}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    )
  if (!words) return null
  const poster = look === 'poster'
  return (
    <View
      pointerEvents="box-none"
      style={
        poster
          ? { position: 'absolute', top: tokens.space['2'], right: tokens.space['2'] }
          : {
              // over TitleCell's thumbnail: its height (the control's and its inset either side),
              // its shape, centred down the row as the cell centres it
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width:
                ((control.height + control.inset * 2) * tokens.aspect[aspect][0]) /
                tokens.aspect[aspect][1],
              alignItems: 'center',
              justifyContent: 'center',
            }
      }
    >
      <Tooltip content={words} focusable>
        <View
          accessible
          role="img"
          accessibilityLabel={words}
          style={{
            padding: poster ? tokens.space['1'] : tokens.space['0.5'],
            borderRadius: tokens.radius.pill,
            backgroundColor: glassOf(theme.colors),
          }}
        >
          <ActivityIndicator aria-hidden size="small" color={theme.colors.text} />
        </View>
      </Tooltip>
    </View>
  )
}

/**
 * Something with art (a poster, a title cell) with the mark over it while work is in hand: the art
 * keeps its place and size, so nothing moves as the mark comes and goes.
 */
export function WithItemWork({
  jobs,
  look,
  aspect,
  children,
}: {
  jobs: readonly ItemJob[] | undefined
  look: Exclude<Look, 'page'>
  aspect?: 'poster' | 'square'
  children: ReactNode
}) {
  return (
    <View style={look === 'thumb' ? { flexShrink: 1, minWidth: 0 } : undefined}>
      {children}
      {/* only an item with work draws the mark (and its clock for "trying again in 2m") */}
      {jobs?.some(isActive) ? <ItemWorkMark jobs={jobs} look={look} aspect={aspect} /> : null}
    </View>
  )
}

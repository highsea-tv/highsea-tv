'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// The interactive release list (movies.md § Search tab; shows.md, Phase 5 C1): the prototype's
// InteractiveSearch on real results, a film's Search tab and a show's season or episode search
// drawing the same table. Each says where its releases come from (`load`, the last 30 minutes'
// first when the page opens, a new search on Search again), how a grab goes (`grab`, which sends
// `force` for a rejected release: Grab anyway overrides the profile), and what it says of the
// releases the indexers answered with that aren't listed. A show's names the season pack, or the
// episodes a release brings, before the indexer in the release's cell: an Episodes column of its own
// would push Grab past the edge of the 800-pixel dialog. The small table parts beside it
// (Caption, TitleTd, Words, TableNone) are the film page's, kept here so both draw them once.
import type { Release } from '@highsea-tv/api-contract'
import { bytes, duration } from '@highsea-tv/core/format'
import { useLocale, useT } from '@highsea-tv/i18n/react'
import type { HighseaClient as Client } from '@highsea-tv/sdk'
import { useAction, useQuery } from '@highsea-tv/sdk/react'
import { admin } from '@highsea-tv/tokens'
import {
  Badge,
  Button,
  Icon,
  Press,
  QualityTag,
  Skeleton,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableFrame,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  Text,
  TitleCell,
  Tooltip,
  toast,
  tokens,
} from '@highsea-tv/ui/native'
import { type ReactNode, useState } from 'react'
import { View } from 'react-native'
import { Loadable } from './loadable.tsx'
import { releaseList as messages } from './release-list-messages.ts'

const s = tokens.space
const UI = tokens.adminText.ui

/** What an indexer answered with that isn't listed, and why (HT-85, and a show's since C1). */
export type LeftOut = { indexer: string; reason: string; count: number; found: number }

export type Found<R extends Release> = {
  releases: R[]
  failed: { indexer: string; message: string }[]
  leftOut: LeftOut[]
}

/** A line in the caption style, `text-3` unless told. */
export function Caption({
  children,
  color = 'text-3',
}: {
  children: ReactNode
  color?: 'text-3' | 'badge-danger'
}) {
  return (
    <Text variant="caption" color={color}>
      {children}
    </Text>
  )
}

/** The web's TitleCell is a cell of its own: here the library's TitleCell inside a tall cell. */
export function TitleTd({ title, detail }: { title: string; detail?: string | null }) {
  return (
    <TableCell tall truncate>
      <TitleCell title={title} detail={detail ?? undefined} />
    </TableCell>
  )
}

/** A row's text in the admin's ui type, in `text` or `text-3`. */
export function Words({ children, color }: { children: string; color?: 'text-2' | 'text-3' }) {
  return (
    <Text size={UI.size} leading={UI.leading} color={color}>
      {children}
    </Text>
  )
}

/** A table's empty line (the web's px-3.5 py-8, centred caption). */
export function TableNone({ children }: { children: string }) {
  return (
    <View style={{ paddingHorizontal: s['3'] + s['0.5'], paddingVertical: s['8'] }}>
      <Text variant="caption" color="text-3" align="center">
        {children}
      </Text>
    </View>
  )
}

export function ReleaseList<R extends Release>({
  queryKey,
  indexers,
  load,
  grab: send,
  noneForThis,
  leftOutNote,
  episodes,
}: {
  /** The query's key; the search's run is added to it. */
  queryKey: string
  /** How many indexers are searched, for the skeleton's caption. */
  indexers: number
  /** The releases: on run 0 the last 30 minutes' when there are some, otherwise a new search. */
  load: (c: Client, run: number) => Promise<Found<R>>
  grab: (c: Client, release: R) => Promise<unknown>
  /** The empty table's line when every release the indexers sent was left out. */
  noneForThis: string
  /** What's said of a left-out row, or null to say nothing of it. */
  leftOutNote: (l: LeftOut) => string | null
  /** A show's episodes for each release, put before the indexer's name. */
  episodes?: (release: R) => string
}) {
  const t = useT(messages)
  const locale = useLocale()
  const [run, setRun] = useState(0)
  const releases = useQuery(`${queryKey}:${run}`, (c) => load(c, run))
  const [open, setOpen] = useState<string | null>(null)
  const [showRejected, setShowRejected] = useState(true)
  const dash = t('search.unknown')
  const grab = useAction((c, r: R) => send(c, r))
  const [grabbed, setGrabbed] = useState<string | null>(null)
  const doGrab = (r: R) =>
    grab.run(r).then(
      () => {
        setGrabbed(r.guid)
        toast.success(t('grab.done'), { description: t('grab.doneBody', { title: r.title }) })
      },
      (e: Error) => toast.error(t('grab.failed'), { description: e.message }),
    )
  const columns = 8

  return (
    <Loadable
      query={releases}
      what={t('search.what')}
      skeleton={
        <>
          <Caption>{t('search.searching', { count: indexers })}</Caption>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={admin.skeleton.row} />
          ))}
        </>
      }
    >
      {({ releases: rs, failed, leftOut }) => {
        const shown = showRejected ? rs : rs.filter((r) => r.approved)
        const notes = leftOut.flatMap((l) => {
          const note = leftOutNote(l)
          return note ? [{ key: `${l.indexer}-${l.reason}`, note }] : []
        })
        return (
          <View style={{ gap: s['3'] }}>
            <TableFrame>
              <TableToolbar>
                <Words>{t('search.count', { count: rs.length })}</Words>
                <Words color="text-3">
                  {t('search.accepted', { count: rs.filter((r) => r.approved).length })}
                </Words>
                <View style={{ marginStart: 'auto' }}>
                  <Switch
                    label={t('search.showRejected')}
                    checked={showRejected}
                    onCheckedChange={setShowRejected}
                  />
                </View>
                <Button size="sm" icon="refresh" onPress={() => setRun(run + 1)}>
                  {t('search.again')}
                </Button>
              </TableToolbar>
              {rs.length === 0 ? (
                <TableNone>{notes.length > 0 ? noneForThis : t('search.none')}</TableNone>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('search.release')}</TableHead>
                      <TableHead>{t('search.quality')}</TableHead>
                      <TableHead numeric>{t('search.score')}</TableHead>
                      <TableHead numeric>{t('search.size')}</TableHead>
                      <TableHead numeric>{t('search.peers')}</TableHead>
                      <TableHead numeric>{t('search.age')}</TableHead>
                      <TableHead>{t('search.decision')}</TableHead>
                      <TableHead hidden>{t('search.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shown.flatMap((r) => {
                      const expanded = open === r.guid
                      const rejected = r.reasons.filter((x) => x.kind === 'rejected').length
                      const decision = r.approved
                        ? t('search.approved')
                        : t('search.rejected', { count: rejected })
                      const row = (
                        <TableRow key={r.guid}>
                          <TitleTd
                            title={episodes ? `${episodes(r)} · ${r.indexer}` : r.indexer}
                            detail={r.title}
                          />
                          <TableCell>
                            <QualityTag overlay={false}>{r.quality}</QualityTag>
                            {r.customFormats.slice(0, 2).map((f) => (
                              <QualityTag key={f} overlay={false}>
                                {f}
                              </QualityTag>
                            ))}
                          </TableCell>
                          <TableCell numeric>{String(r.formatScore)}</TableCell>
                          <TableCell numeric>{r.size === null ? dash : bytes(r.size)}</TableCell>
                          <TableCell
                            numeric
                          >{`${r.seeders ?? dash}/${r.leechers ?? dash}`}</TableCell>
                          <TableCell numeric>
                            {r.ageHours === null ? dash : duration(r.ageHours * 3600, locale)}
                          </TableCell>
                          <TableCell>
                            <Press
                              aria-expanded={expanded}
                              accessibilityLabel={`${decision} ${t('search.reasons')}`}
                              onPress={() => setOpen(expanded ? null : r.guid)}
                              style={{ borderRadius: tokens.radius.sm }}
                            >
                              <Badge tone={r.approved ? 'success' : 'danger'}>{decision}</Badge>
                            </Press>
                          </TableCell>
                          <TableCell align="end">
                            {grabbed === r.guid ? (
                              <Badge tone="accent">{t('search.grabbed')}</Badge>
                            ) : (
                              <Tooltip
                                content={t(r.approved ? 'search.grabTip' : 'search.grabAnywayTip')}
                              >
                                <Button
                                  size="sm"
                                  variant={r.approved ? 'primary' : 'ghost'}
                                  iconOnly
                                  icon="download"
                                  accessibilityLabel={t(
                                    r.approved ? 'search.grab' : 'search.grabAnyway',
                                    { title: r.title },
                                  )}
                                  onPress={() => doGrab(r)}
                                  disabled={grab.pending}
                                />
                              </Tooltip>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                      return expanded
                        ? [
                            row,
                            <TableRow key={`${r.guid}-reasons`} selected>
                              <TableCell span={columns}>
                                <Reasons release={r} />
                              </TableCell>
                            </TableRow>,
                          ]
                        : [row]
                    })}
                  </TableBody>
                </Table>
              )}
            </TableFrame>
            {failed.length + notes.length > 0 && (
              <View role="list" style={{ gap: s['1'] }}>
                {failed.map((f) => (
                  <View key={f.indexer} role="listitem">
                    <Caption>
                      {t('search.failedIndexer', { indexer: f.indexer, message: f.message })}
                    </Caption>
                  </View>
                ))}
                {notes.map((n) => (
                  <View key={n.key} role="listitem">
                    <Caption>{n.note}</Caption>
                  </View>
                ))}
              </View>
            )}
          </View>
        )
      }}
    </Loadable>
  )
}

/** Why a release was accepted or rejected, as the decision engine said it. */
function Reasons({ release: r }: { release: Release }) {
  return (
    <View role="list" style={{ gap: s['1'] }}>
      {r.reasons.map((reason) => (
        <View
          key={reason.message}
          role="listitem"
          style={{ flexDirection: 'row', alignItems: 'flex-start', gap: s['1'] + s['0.5'] }}
        >
          <View style={{ marginTop: tokens.icon.drop, flexShrink: 0 }}>
            <Icon
              name={
                reason.kind === 'accepted'
                  ? 'check'
                  : reason.kind === 'warning'
                    ? 'warning'
                    : 'close'
              }
              size={tokens.icon.size.xs}
              color={
                reason.kind === 'accepted'
                  ? 'success'
                  : reason.kind === 'warning'
                    ? 'warning'
                    : 'danger'
              }
            />
          </View>
          <Text variant="caption" color="text-2">
            {reason.message}
          </Text>
        </View>
      ))}
    </View>
  )
}

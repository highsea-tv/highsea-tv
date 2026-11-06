'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Now playing (docs/product/now-playing.md; checkpoint 4.3a), ported from the prototype with real
// data: who's watching what now, how each stream is sent and why, and Stop with a message; then 30
// days of what was watched. The owner's and admins'. What real data changes from the prototype:
// - its **Prototype only · Slow a transcode** button is gone;
// - a transcode waiting for a free slot shows **Waiting**, with a line saying why;
// - a transcode's speed is unknown for its first seconds, so it reads "starting";
// - a title that has left the library has no link, and a film of unknown length no runtime;
// - a transcode names the hardware path it runs on (4.3b), or the processor, and says so when the
//   graphics chip failed partway and the processor took over;
// - Downloads come with the apps that make them, so there's no Cancel yet.
// Drawn with the library's native renderer since D2 (one-client-platform-d.md).
import {
  type DeliveryMethod,
  SESSIONS_TOPICS,
  type StreamSession,
  type WatchRecord,
} from '@highsea-tv/api-contract'
import { duration } from '@highsea-tv/core/format'
import { useLocale, useT } from '@highsea-tv/i18n/react'
import { ApiError } from '@highsea-tv/sdk'
import { useAction, useQuery } from '@highsea-tv/sdk/react'
import { breakpoints } from '@highsea-tv/tokens'
import {
  Badge,
  Button,
  Details,
  Dialog,
  EmptyState,
  Field,
  Figure,
  Icon,
  Panel,
  Poster,
  ProgressBar,
  Select,
  Stat,
  Table,
  TableBody,
  TableCell,
  TableFrame,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  Tabs,
  Text,
  Textarea,
  TitleCell,
  TitleLink,
  toast,
  tokens,
  useTheme,
  useWindowAtLeast,
} from '@highsea-tv/ui/native'
import { type ReactNode, useState } from 'react'
import { View } from 'react-native'
import { behind, clientIcon, mbps, methodTone, timecode } from './delivery.ts'
import { Loadable } from './loadable.tsx'
import { moviePath } from './media-links.ts'
import { nowPlaying as messages } from './now-playing-messages.ts'
import { AdminPage } from './shell.tsx'
import { Muted } from './table-parts.tsx'
import { useTabAddress } from './tabs.ts'
import { useRelative } from './time.ts'

export type NowPlayingTab = 'now' | 'history'
type Tab = NowPlayingTab

const methodLabel = (m: DeliveryMethod) => `method.${m}` as const

export const useNowPlaying = () =>
  useQuery('sessions', (c) => c.sessions.list(), [SESSIONS_TOPICS.updated])

const sp = tokens.space
const ui = tokens.adminText.ui
const PLAYBACK_SETTINGS = '/settings/playback'

export function NowPlayingPage({ tab = 'now' }: { tab?: Tab }) {
  const t = useT(messages)
  const setTab = useTabAddress<Tab>('/now-playing', 'now')
  const live = useNowPlaying()
  return (
    <AdminPage title={t('title')} description={t('description')}>
      <Tabs<Tab>
        variant="line"
        aria-label={t('sections')}
        value={tab}
        onValueChange={setTab}
        options={[
          {
            value: 'now',
            label: t('tab.now'),
            count: live.data?.sessions.filter((x) => !x.stopped).length || undefined,
          },
          { value: 'history', label: t('tab.history') },
        ]}
      />
      <View role="tabpanel" aria-label={t(`tab.${tab}`)} style={{ paddingTop: sp['5'] }}>
        {tab === 'now' ? <Now /> : <History />}
      </View>
    </AdminPage>
  )
}

// ---------------------------------------------------------------- now

/** Two figures to a row in a compact window, four otherwise (the web's grid-cols-2 medium:grid-cols-4). */
function StatRow({ children }: { children: ReactNode[] }) {
  const four = useWindowAtLeast(breakpoints.medium)
  const per = four ? 4 : 2
  const rows: ReactNode[][] = []
  for (let i = 0; i < children.length; i += per) rows.push(children.slice(i, i + per))
  return (
    <View style={{ gap: sp['4'] }}>
      {rows.map((row, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the rows are fixed, in order
        <View key={i} style={{ flexDirection: 'row', gap: sp['4'] }}>
          {row.map((cell, j) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the cells are fixed, in order
            <View key={j} style={{ flex: 1, flexBasis: 0, minWidth: 0 }}>
              {cell}
            </View>
          ))}
        </View>
      ))}
    </View>
  )
}

function Now() {
  const t = useT(messages)
  const live = useNowPlaying()
  const [stopping, setStopping] = useState<StreamSession | null>(null)
  return (
    <Loadable query={live} what={t('now.what')}>
      {(np) =>
        np.sessions.length === 0 ? (
          <EmptyState icon="play" title={t('now.empty')}>
            {t('now.emptyBody')}
          </EmptyState>
        ) : (
          <View style={{ gap: sp['6'], minWidth: 0 }}>
            <Panel>
              <StatRow>
                <Stat
                  value={String(
                    np.sessions.filter((x) => x.kind === 'stream' && !x.stopped).length,
                  )}
                  caption={t('stat.streams')}
                />
                <Stat value={np.totalMbps.toFixed(1)} unit="Mbps" caption={t('stat.total')} />
                <Stat value={np.remoteMbps.toFixed(1)} unit="Mbps" caption={t('stat.remote')} />
                <Stat value={String(np.transcodes)} caption={t('stat.transcodes')} />
              </StatRow>
            </Panel>
            <View role="list" style={{ gap: sp['3'], minWidth: 0 }}>
              {np.sessions.map((x) => (
                <SessionRow key={x.id} s={x} onStop={() => setStopping(x)} />
              ))}
            </View>
            <StopDialog session={stopping} onClose={() => setStopping(null)} />
          </View>
        )
      }
    </Loadable>
  )
}

/** A link inside a sentence: the sentence's own colour, underlined (the web's `<a className="underline">`). */
function InlineLink({ href, children }: { href: string; children: string }) {
  return (
    <Text
      role="link"
      {...({ href } as object)}
      style={{ color: 'inherit', textDecorationLine: 'underline' } as object}
    >
      {children}
    </Text>
  )
}

function SessionRow({ s, onStop }: { s: StreamSession; onStop: () => void }) {
  const t = useT(messages)
  const theme = useTheme()
  const late = behind(s)
  const waiting = !s.stopped && s.state === 'waiting'
  const href = s.item.tmdbId === null ? undefined : moviePath(s.item.tmdbId)
  const by = s.hardware ? t(`path.${s.hardware}`) : t('processor')
  const figure = (v: string) => <Figure color="text-2">{v}</Figure>
  return (
    <View
      role="listitem"
      aria-label={`${s.user.displayName}, ${s.item.title}`}
      style={{
        flexDirection: 'row',
        gap: sp['4'],
        padding: sp['4'],
        minWidth: 0,
        borderWidth: 1,
        borderColor: theme.colors.line,
        borderRadius: tokens.radius.lg,
        backgroundColor: theme.colors.s1,
        opacity: s.stopped ? 0.6 : 1,
      }}
    >
      <Poster
        title={s.item.title}
        src={s.item.poster ?? undefined}
        width={POSTER_WIDTH}
        href={href}
      />
      <View style={{ flex: 1, minWidth: 0, gap: sp['3'] }}>
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: sp['2'],
          }}
        >
          <View style={{ flexShrink: 1, minWidth: 0, gap: sp['0.5'] }}>
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                alignItems: 'baseline',
                columnGap: sp['2'],
              }}
            >
              {href ? (
                <TitleLink href={href} weight={500}>
                  {s.item.title}
                </TitleLink>
              ) : (
                <Text size={ui.size} leading={ui.leading} weight={500}>
                  {s.item.title}
                </Text>
              )}
              {s.item.year ? (
                <Text size={ui.size} leading={ui.leading} color="text-3">
                  {String(s.item.year)}
                </Text>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp['1'] + sp['0.5'] }}>
              <Icon name={clientIcon[s.client]} size={14} color="text-2" />
              <Text variant="caption" color="text-2" numberOfLines={1} style={{ flexShrink: 1 }}>
                {`${s.user.displayName} · ${s.deviceName}`}
              </Text>
            </View>
          </View>
          <View
            style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: sp['2'] }}
          >
            {s.stopped ? (
              <Badge tone="neutral">{t('state.stopped')}</Badge>
            ) : s.state === 'paused' ? (
              <Badge tone="neutral">{t('state.paused')}</Badge>
            ) : waiting ? (
              <Badge tone="warning">{t('state.waiting')}</Badge>
            ) : late ? (
              <Badge tone="danger">{t('state.behind')}</Badge>
            ) : (
              <Badge tone="success">{t('state.playing')}</Badge>
            )}
            <Badge tone={methodTone[s.method]} dot={false}>
              {t(methodLabel(s.method))}
            </Badge>
            {!s.stopped && (
              <Button size="sm" variant="ghost" onPress={onStop}>
                {t('stop')}
              </Button>
            )}
          </View>
        </View>

        <View style={{ gap: sp['1'] }}>
          <ProgressBar
            look="panel"
            value={s.runtime ? (s.position / s.runtime) * 100 : 0}
            tone={late ? 'danger' : 'accent'}
            label={t('watchedSoFar')}
          />
          <Figure color="text-3">
            {s.runtime
              ? t('of', { position: timecode(s.position), runtime: timecode(s.runtime) })
              : timecode(s.position)}
          </Figure>
        </View>

        {s.stopped ? (
          <Text variant="caption" color="text-2">
            {s.stopped.message
              ? t('stoppedByWith', { name: s.stopped.by, message: s.stopped.message })
              : t('stoppedBy', { name: s.stopped.by })}
          </Text>
        ) : (
          <Details
            stack
            gap={sp['1']}
            rows={[
              { term: t('sentAs'), value: figure(`${s.sent} · ${mbps(s.mbps)}`) },
              { term: t('from'), value: figure(s.version) },
              {
                term: t('network'),
                value: (
                  <View
                    style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      alignItems: 'baseline',
                      columnGap: sp['2'],
                    }}
                  >
                    <Text variant="caption" color="text-2">
                      {t(`network.${s.network}`)}
                    </Text>
                    <Figure color="text-3">{s.address}</Figure>
                  </View>
                ),
              },
              ...(s.method === 'transcode' && !waiting
                ? [
                    {
                      term: t('transcodedBy'),
                      value: (
                        <Text variant="caption" color={late ? 'badge-danger' : 'text-2'}>
                          {s.speed === null
                            ? t('starting', { by })
                            : t('speed', { by, speed: s.speed.toFixed(1) })}
                        </Text>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        )}

        {!s.stopped && (s.reasons.length > 0 || late || waiting) && (
          <View
            role="list"
            style={{
              gap: sp['1'],
              borderTopWidth: 1,
              borderTopColor: theme.colors.line,
              paddingTop: sp['3'],
            }}
          >
            {s.reasons.map((r) => (
              <Text key={r} role="listitem" variant="caption" color="text-2">
                {r}
              </Text>
            ))}
            {late && (
              <Text role="listitem" variant="caption" color="badge-danger">
                {t('behind.before', { name: s.user.displayName })}
                <InlineLink href={PLAYBACK_SETTINGS}>{t('settingsLink')}</InlineLink>
                {t('behind.after')}
              </Text>
            )}
            {waiting && (
              <Text role="listitem" variant="caption" color="text-2">
                {t('waiting.before')}
                <InlineLink href={PLAYBACK_SETTINGS}>{t('settingsLink')}</InlineLink>
                {t('waiting.after')}
              </Text>
            )}
          </View>
        )}
      </View>
    </View>
  )
}

/** The poster's width (the web's 64px column). */
const POSTER_WIDTH = 64

function StopDialog({ session, onClose }: { session: StreamSession | null; onClose: () => void }) {
  const t = useT(messages)
  const [message, setMessage] = useState('')
  const stop = useAction((c, id: string, m: string) =>
    c.sessions.stop({ params: { id }, body: { message: m } }),
  )
  const close = () => {
    onClose()
    setMessage('')
  }
  return (
    <Dialog
      open={!!session}
      onClose={close}
      closable
      size="sm"
      title={session ? t('stop.title', { name: session.user.displayName }) : ''}
      description={t('stop.description')}
      footer={
        <>
          <Button variant="ghost" onPress={close}>
            {t('stop.keep')}
          </Button>
          <Button
            variant="danger"
            loading={stop.pending}
            onPress={() =>
              session &&
              stop.run(session.id, message).then(
                () => {
                  toast({ title: t('stop.done') })
                  close()
                },
                (e) => {
                  // it ended on its own while the dialog was open
                  if (e instanceof ApiError && e.code === 'not-found') {
                    toast({ title: t('stop.gone') })
                    close()
                  } else toast.error(t('stop.failed'), { description: (e as Error).message })
                },
              )
            }
          >
            {t('stop.confirm')}
          </Button>
        </>
      }
    >
      <Field label={t('stop.message')} hint={t('stop.hint')}>
        <Textarea
          value={message}
          maxLength={200}
          placeholder={t('stop.placeholder')}
          onChangeText={setMessage}
        />
      </Field>
    </Dialog>
  )
}

// ---------------------------------------------------------------- history

/** The toolbar's select (the web's w-44). */
const SELECT_WIDTH = 176

function History() {
  const t = useT(messages)
  const locale = useLocale()
  const { relative } = useRelative()
  const history = useQuery('sessions:history', (c) => c.sessions.history({ query: {} }), [
    SESSIONS_TOPICS.updated,
  ])
  const [person, setPerson] = useState('everyone')
  return (
    <Loadable query={history} what={t('history.what')}>
      {(all: WatchRecord[]) => {
        const people = [...new Map(all.map((w) => [w.user.id, w.user.displayName])).entries()]
        const xs = person === 'everyone' ? all : all.filter((w) => w.user.id === person)
        return all.length === 0 ? (
          <EmptyState icon="clock" title={t('history.empty')}>
            {t('history.emptyBody')}
          </EmptyState>
        ) : (
          <TableFrame>
            <TableToolbar>
              <Text variant="caption" color="text-3" style={{ marginEnd: 'auto' }}>
                {t('history.count', { count: xs.length })}
              </Text>
              <View style={{ width: SELECT_WIDTH }}>
                <Select
                  aria-label={t('history.whose')}
                  value={person}
                  onValueChange={setPerson}
                  options={[
                    { value: 'everyone', label: t('history.everyone') },
                    ...people.map(([value, label]) => ({ value, label })),
                  ]}
                />
              </View>
            </TableToolbar>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('history.movie')}</TableHead>
                  <TableHead>{t('history.who')}</TableHead>
                  <TableHead>{t('history.device')}</TableHead>
                  <TableHead>{t('history.sentAs')}</TableHead>
                  <TableHead numeric>{t('history.watched')}</TableHead>
                  <TableHead numeric>{t('history.when')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {xs.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell tall truncate>
                      <TitleCell
                        art={w.item.poster ?? null}
                        title={
                          w.item.tmdbId === null ? (
                            w.item.title
                          ) : (
                            <TitleLink href={moviePath(w.item.tmdbId)}>{w.item.title}</TitleLink>
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Muted>{w.user.displayName}</Muted>
                    </TableCell>
                    <TableCell>
                      <Icon name={clientIcon[w.client]} size={14} color="text-2" />
                      <Muted>{w.deviceName}</Muted>
                    </TableCell>
                    <TableCell>
                      <Badge tone={methodTone[w.method]} dot={false}>
                        {t(methodLabel(w.method))}
                      </Badge>
                      {w.network === 'remote' ? (
                        <Text variant="caption" color="text-3">
                          {t('history.away')}
                        </Text>
                      ) : null}
                    </TableCell>
                    <TableCell numeric>
                      {w.finished ? t('history.all') : duration(w.watched, locale)}
                    </TableCell>
                    <TableCell numeric>{relative(w.startedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableFrame>
        )
      }}
    </Loadable>
  )
}

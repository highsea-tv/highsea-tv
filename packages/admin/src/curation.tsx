'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// A11 Curation (curation.md; checkpoint 8c, ADR 0048), ported from the prototype's
// curation/curation.tsx: what the household sees first. Announcements, with how far each has
// reached, and the featured sections in their home-screen order. Each opens its composer, where
// the client preview shows the draft on a TV, the web and a phone. A collection rule's summary
// names the collection from the rule options, since the source keeps its TMDB id.
import {
  type AnnouncementSummary,
  COLLECTION_TOPICS,
  CURATION_TOPICS,
  type Placement,
  type SectionSummary,
} from '@highsea-tv/api-contract'
import { useAction, useQuery } from '@highsea-tv/sdk/react'
import { breakpoints, type ColorRole } from '@highsea-tv/tokens'
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Icon,
  type IconName,
  Image,
  Menu,
  ProgressBar,
  SortableList,
  Tabs,
  Text,
  TitleLink,
  toast,
  tokens,
  useTheme,
  useWindowAtLeast,
} from '@highsea-tv/ui/native'
import { type ComponentRef, type ReactNode, useRef, useState } from 'react'
import { View } from 'react-native'
import {
  StatusBadge,
  useAudienceSummary,
  useCurationT,
  usePeople,
  useScheduleSummary,
  useSourceSummary,
} from './curation-shared.tsx'
import { Loadable } from './loadable.tsx'
import { useRouter } from './navigation.tsx'
import { AdminPage } from './shell.tsx'

const s = tokens.space
const ui = tokens.adminText.ui
const figure = tokens.adminText.figure

const severityIcon: Record<AnnouncementSummary['severity'], { icon: IconName; tone: ColorRole }> = {
  info: { icon: 'info', tone: 'info' },
  notice: { icon: 'announcement', tone: 'accent-text' },
  warning: { icon: 'warning', tone: 'warning' },
  critical: { icon: 'error', tone: 'danger' },
}

/** The admin's lists: their own changes, and a schedule's start or end. */
export const LIST_TOPICS = [CURATION_TOPICS.curation]

export const announcementPath = (id: string) => `/curation/announcements/${id}`
export const sectionPath = (id: string) => `/curation/featured/${id}`

export const useRuleOptions = () =>
  useQuery('curation:rule-options', (c) => c.curation.ruleOptions(), [
    'movies.updated',
    COLLECTION_TOPICS.collections,
  ])

type Tab = 'announcements' | 'featured'

export function Curation({ tab = 'announcements' }: { tab?: Tab }) {
  const t = useCurationT()
  const router = useRouter()
  return (
    <AdminPage
      title={t('title')}
      description={t('description')}
      actions={
        <Button
          variant="primary"
          icon="add"
          onPress={() =>
            router.push(tab === 'featured' ? sectionPath('new') : announcementPath('new'))
          }
        >
          {tab === 'featured' ? t('newSection') : t('newAnnouncement')}
        </Button>
      }
    >
      <View style={{ gap: s['5'] }}>
        <Tabs<Tab>
          variant="line"
          aria-label={t('sections')}
          value={tab}
          onValueChange={(v) => router.push(v === 'featured' ? '/curation/featured' : '/curation')}
          options={[
            { value: 'announcements', label: t('tab.announcements') },
            { value: 'featured', label: t('tab.featured') },
          ]}
        />
        <View role="tabpanel" aria-label={t(`tab.${tab}`)}>
          {tab === 'announcements' ? <Announcements /> : <Sections />}
        </View>
      </View>
    </AdminPage>
  )
}

/** A row's line of what it is, in the caption style. */
function Caption({ children }: { children: ReactNode }) {
  return (
    <Text variant="caption" color="text-3">
      {children}
    </Text>
  )
}

/** A figure inside a caption, in the admin's mono figure type. */
function Count({ children, color }: { children: string; color?: ColorRole }) {
  return (
    <Text size={figure.size} mono color={color}>
      {children}
    </Text>
  )
}

/** A list's row: s1 with a line round it and the large corner (the web's card row). */
function useCard() {
  const theme = useTheme()
  return {
    padding: s['4'],
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderRadius: tokens.radius.lg,
    backgroundColor: theme.colors.s1,
  } as const
}

/** The title and its badges, wrapping. */
function TitleLine({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        columnGap: s['2'],
        rowGap: s['1'],
        minWidth: 0,
      }}
    >
      {children}
    </View>
  )
}

// ---------------------------------------------------------------- announcements

function Announcements() {
  const t = useCurationT()
  const router = useRouter()
  const list = useQuery('curation:announcements', (c) => c.curation.announcements(), [
    ...LIST_TOPICS,
    'users.updated',
  ])
  return (
    <Loadable query={list} what={t('announcements.what')}>
      {(xs) =>
        xs.length === 0 ? (
          <EmptyState
            icon="announcement"
            title={t('announcements.none')}
            action={
              <Button variant="primary" onPress={() => router.push(announcementPath('new'))}>
                {t('announcements.write')}
              </Button>
            }
          >
            {t('announcements.noneBody')}
          </EmptyState>
        ) : (
          <View role="list" aria-label={t('announcements.label')} style={{ gap: s['3'] }}>
            {xs.map((a) => (
              <AnnouncementRow key={a.id} a={a} />
            ))}
          </View>
        )
      }
    </Loadable>
  )
}

/** The reach column's width in a medium window (the web's 12rem). */
const REACH_WIDTH = 192

function AnnouncementRow({ a }: { a: AnnouncementSummary }) {
  const t = useCurationT()
  const card = useCard()
  const wide = useWindowAtLeast(breakpoints.medium)
  const people = usePeople()
  const audience = useAudienceSummary()
  const schedule = useScheduleSummary()
  const end = useAction((c) => c.curation.endAnnouncement({ params: { id: a.id } }))
  const remove = useAction((c) => c.curation.removeAnnouncement({ params: { id: a.id } }))
  const [confirm, setConfirm] = useState(false)
  const [menu, setMenu] = useState(false)
  const more = useRef<ComponentRef<typeof View>>(null)
  const sev = severityIcon[a.severity]
  const failed = (e: Error) => toast.error(t('failed'), { description: e.message })
  return (
    <View
      role="listitem"
      style={[
        card,
        {
          flexDirection: wide ? 'row' : 'column',
          alignItems: wide ? 'center' : 'stretch',
          gap: s['3'],
        },
      ]}
    >
      <View style={{ flexDirection: 'row', gap: s['3'], flex: wide ? 1 : undefined, minWidth: 0 }}>
        <View style={{ marginTop: s['0.5'] }}>
          <Icon name={sev.icon} size={18} color={sev.tone} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: s['1'] }}>
          <TitleLine>
            <TitleLink href={announcementPath(a.id)} weight={500}>
              {a.title}
            </TitleLink>
            <StatusBadge status={a.status} />
            {a.acknowledgement === 'require' && (
              <Badge tone="warning">{t('mustAcknowledge')}</Badge>
            )}
          </TitleLine>
          <Caption>
            {a.placements.map((p: Placement) => t(`placement.${p}`)).join(', ')} ·{' '}
            {audience(a.audience, people.data)} · {schedule(a.schedule, a.status)}
          </Caption>
        </View>
      </View>
      <View style={{ gap: s['1'], width: wide ? REACH_WIDTH : undefined }}>
        {a.status === 'draft' || a.status === 'scheduled' ? (
          <Caption>{t('notShown')}</Caption>
        ) : (
          <>
            <Text variant="caption" color="text-2">
              {a.acknowledgement === 'require' ? t('acknowledgedBy') : t('seenBy')}{' '}
              <Count>{t('ofAudience', { seen: a.seenBy, size: a.audienceSize })}</Count>
            </Text>
            <ProgressBar
              look="panel"
              value={a.audienceSize ? (a.seenBy / a.audienceSize) * 100 : 0}
              tone="neutral"
              label={t('seenLabel', { title: a.title, seen: a.seenBy, size: a.audienceSize })}
            />
          </>
        )}
      </View>
      <View
        // centred in a wide card's row with the rest; at the end of a narrow card's column
        style={{ flexDirection: 'row', gap: s['1'], alignSelf: wide ? undefined : 'flex-end' }}
      >
        <Button
          size="sm"
          icon="edit"
          href={announcementPath(a.id)}
          accessibilityLabel={t('editNamed', { title: a.title })}
        >
          {t('edit')}
        </Button>
        <Button
          ref={more}
          size="sm"
          variant="ghost"
          iconOnly
          icon="more"
          hasPopup="menu"
          accessibilityState={{ expanded: menu }}
          accessibilityLabel={t('moreFor', { title: a.title })}
          onPress={() => setMenu(true)}
        />
        <Menu
          title={t('moreFor', { title: a.title })}
          open={menu}
          onClose={() => setMenu(false)}
          anchor={more}
          items={[
            ...(a.status === 'live' || a.status === 'scheduled'
              ? [
                  {
                    label: t('endNow'),
                    icon: 'close' as const,
                    onSelect: () =>
                      end
                        .run()
                        .then(() =>
                          toast.success(t('ended', { title: a.title }), {
                            description: t('endedBody'),
                          }),
                        )
                        .catch(failed),
                  },
                ]
              : []),
            { label: t('delete'), icon: 'delete' as const, onSelect: () => setConfirm(true) },
          ]}
        />
      </View>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={t('deleteTitle', { title: a.title })}
        description={t('deleteAnnouncementBody')}
        confirmLabel={t('delete')}
        destructive
        onConfirm={() =>
          remove
            .run()
            .then(() => toast({ title: t('deleted', { title: a.title }) }))
            .catch(failed)
        }
      />
    </View>
  )
}

// ---------------------------------------------------------------- featured sections

function Sections() {
  const t = useCurationT()
  const router = useRouter()
  const list = useQuery('curation:sections', (c) => c.curation.sections(), [
    ...LIST_TOPICS,
    'movies.updated',
  ])
  const reorder = useAction((c, ids: string[]) => c.curation.orderSections({ body: { ids } }))
  // a dropped row stays where it landed while the server saves the order
  const [order, setOrder] = useState<string[] | null>(null)
  const sortMessages = useSortMessages()
  return (
    <Loadable query={list} what={t('featured.what')}>
      {(xs) =>
        xs.length === 0 ? (
          <EmptyState
            icon="curation"
            title={t('featured.none')}
            action={
              <Button variant="primary" onPress={() => router.push(sectionPath('new'))}>
                {t('featured.add')}
              </Button>
            }
          >
            {t('featured.noneBody')}
          </EmptyState>
        ) : (
          <View style={{ gap: s['3'] }}>
            <Caption>{t('featured.order')}</Caption>
            <SortableList
              accessibilityLabel={t('featured.label')}
              messages={sortMessages}
              items={order ? [...xs].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)) : xs}
              id={(f) => f.id}
              label={(f) => f.title}
              onChange={(next) => {
                const ids = next.map((f) => f.id)
                setOrder(ids)
                reorder
                  .run(ids)
                  .catch((e: Error) => toast.error(t('failed'), { description: e.message }))
                  .finally(() => setOrder(null))
              }}
            >
              {(f, handle) => <SectionRow f={f} handle={handle} />}
            </SortableList>
          </View>
        )
      }
    </Loadable>
  )
}

/** The sortable lists' words, from the curation catalog. */
export function useSortMessages() {
  const t = useCurationT()
  return {
    move: (name: string) => t('sort.move', { name }),
    moveUp: (name: string) => t('sort.moveUp', { name }),
    moveDown: (name: string) => t('sort.moveDown', { name }),
    moved: (name: string, index: number, count: number) => t('sort.moved', { name, index, count }),
    pickedUp: (name: string, index: number, count: number) =>
      t('sort.pickedUp', { name, index, count }),
    dropped: (name: string, index: number, count: number) =>
      t('sort.dropped', { name, index, count }),
    cancelled: (name: string) => t('sort.cancelled', { name }),
  }
}

/** A sample's poster: 36 wide (the web's w-9) at 2:3, with the small corner. */
const SAMPLE_WIDTH = 36

export function Thumb({
  title,
  src,
  width,
  label = title,
  fill = 's2',
}: {
  title: string
  src: string | null
  width: number
  /** What it's read as; empty for one beside its own title. */
  label?: string
  fill?: ColorRole
}) {
  const theme = useTheme()
  const box = { width, aspectRatio: 2 / 3, borderRadius: 4, backgroundColor: theme.colors[fill] }
  if (src)
    return (
      <Image
        source={{ uri: src }}
        accessibilityLabel={label || undefined}
        accessible={!!label}
        contentFit="cover"
        style={box}
      />
    )
  return label ? (
    <View role="img" aria-label={label} style={box} />
  ) : (
    <View aria-hidden style={box} />
  )
}

function SectionRow({ f, handle }: { f: SectionSummary; handle: ReactNode }) {
  const t = useCurationT()
  const wide = useWindowAtLeast(breakpoints.expanded)
  const people = usePeople()
  const options = useRuleOptions()
  const audience = useAudienceSummary()
  const source = useSourceSummary()
  const remove = useAction((c) => c.curation.removeSection({ params: { id: f.id } }))
  const [confirm, setConfirm] = useState(false)
  const about = (
    <View style={{ flex: wide ? 1 : undefined, minWidth: 0, gap: s['1'] }}>
      <TitleLine>
        <TitleLink href={sectionPath(f.id)} weight={500}>
          {f.title}
        </TitleLink>
        {f.tagline ? (
          <Text size={ui.size} leading={ui.leading} color="text-2">
            {f.tagline}
          </Text>
        ) : null}
        <Badge>{t(`layout.${f.layout}`)}</Badge>
        {f.status !== 'live' && <StatusBadge status={f.status} />}
      </TitleLine>
      <Caption>
        {source(f.source, [...(options.data?.smart ?? []), ...(options.data?.collections ?? [])])} ·{' '}
        <Count>{t('featured.count', { count: f.itemCount })}</Count> ·{' '}
        {audience(f.audience, people.data)}
      </Caption>
    </View>
  )
  const samples = (
    <View
      role="list"
      aria-label={t('featured.titles', { title: f.title })}
      style={{ flexDirection: 'row', gap: s['1'] + s['0.5'], overflow: 'hidden' }}
    >
      {f.sample.map((m) => (
        <View key={m.id} role="listitem">
          <Thumb title={m.title} src={m.poster} width={SAMPLE_WIDTH} />
        </View>
      ))}
    </View>
  )
  const actions = (
    <View style={{ flexDirection: 'row', gap: s['1'], alignSelf: wide ? 'center' : 'flex-end' }}>
      <Button
        size="sm"
        icon="edit"
        href={sectionPath(f.id)}
        accessibilityLabel={t('editNamed', { title: f.title })}
      >
        {t('edit')}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        iconOnly
        icon="delete"
        accessibilityLabel={t('deleteNamed', { title: f.title })}
        onPress={() => setConfirm(true)}
      />
    </View>
  )
  return (
    <View
      style={{
        flex: 1,
        flexDirection: 'row',
        alignItems: wide ? 'center' : 'flex-start',
        gap: s['3'],
        minWidth: 0,
      }}
    >
      {handle}
      {wide ? (
        <>
          {about}
          {samples}
          {actions}
        </>
      ) : (
        <View style={{ flex: 1, minWidth: 0, gap: s['3'] }}>
          {about}
          {samples}
          {actions}
        </View>
      )}
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={t('deleteTitle', { title: f.title })}
        description={t('deleteSectionBody')}
        confirmLabel={t('delete')}
        destructive
        onConfirm={() =>
          remove
            .run()
            .then(() => toast({ title: t('deleted', { title: f.title }) }))
            .catch((e: Error) => toast.error(t('failed'), { description: e.message }))
        }
      />
    </View>
  )
}

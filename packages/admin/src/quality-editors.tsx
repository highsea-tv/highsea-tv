'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// The profile, format and size editors (checkpoint 8c; settings.md › As built (8c)), ported from
// the signed-off prototype's editors.tsx with the mock client swapped for the SDK. Each edits
// @highsea-tv/quality's real shapes, as the Servarr wiki describes them:
// - a quality profile (https://wiki.servarr.com/radarr/settings#quality-profiles): the qualities
//   highest first, "qualities within the same group are equal", only ticked ones wanted; the cutoff
//   ("Upgrade Until"); the format scores, with a minimum, a score to stop upgrading at and the least
//   gain that counts (TRaSH's `minUpgradeFormatScore`). The server adds what the prototype has no
//   design for, the wait before grabbing (Radarr's delay profile, kept on the profile; ADR 0031);
// - a custom format (https://wiki.servarr.com/radarr/settings#custom-format-conditions): conditions
//   of one kind are alternatives, different kinds must all hold, a required one must hold on its
//   own, and negate inverts one. The test box runs a name through the real parser and matcher;
// - the size table (https://wiki.servarr.com/radarr/settings#quality): MiB per minute of runtime,
//   with an empty preferred size or maximum meaning no limit, as TRaSH's defaults leave them.
// Each is a draft with the save bar, like every settings page; the server checks again, and a name
// it refuses (`name-taken`) shows under the field.
// Drawn with the library's native renderer since D3 (one-client-platform-d.md), on the web through
// react-native-web, with the same parts, words and behaviour as the web renderer's. The qualities'
// sortable list takes its words from curation's, the one other sortable list in the admin.
import type {
  CustomFormat as ApiFormat,
  QualityProfile as ApiProfile,
  FormatCondition,
  QualitySize,
} from '@highsea-tv/api-contract'
import { bytes } from '@highsea-tv/core/format'
import { useLocale, useT } from '@highsea-tv/i18n/react'
import { parse } from '@highsea-tv/parser'
import {
  CONDITION_KINDS,
  type Condition,
  type ConditionKind,
  type CustomFormat,
  completeItems,
  conditionHolds,
  defaultEpisodeSizes,
  defaultQualitySizes,
  describeCondition,
  describeFormat,
  type FormatInput,
  INDEXER_FLAGS,
  type IndexerFlag,
  item,
  languageName,
  MAX_WAIT_MINUTES,
  MIB,
  MODIFIERS,
  matchesFormat,
  qualityOf,
  qualityProfileSchema,
  qualitySizeSchema,
  qualityT,
  RESOLUTIONS,
  SOURCES,
  validateFormat,
} from '@highsea-tv/quality/browser'
import { useAction, useQuery } from '@highsea-tv/sdk/react'
import { line } from '@highsea-tv/tokens'
import {
  Badge,
  Banner,
  Button,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  Field,
  Icon,
  Input,
  type InputProps,
  Press,
  SegmentedControl,
  Select,
  SortableList,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableFrame,
  TableHead,
  TableHeader,
  TableRow,
  Text,
  TitleLink,
  toast,
  tokens,
  useRegularWindow,
  useTheme,
} from '@highsea-tv/ui/native'
import { type ReactNode, useMemo, useState } from 'react'
import { View, type ViewStyle } from 'react-native'
import { useSortMessages } from './curation.tsx'
import { Loadable } from './loadable.tsx'
import { errorReason } from './metadata-locale.ts'
import { useRouter } from './navigation.tsx'
import { editors as messages } from './quality-editors-messages.ts'
import { useServes } from './serves.tsx'
import { Group, SaveBar } from './settings.tsx'
import { Note, WRAP_ANYWHERE } from './settings-card.tsx'
import { AdminPage } from './shell.tsx'
import { RowMenu } from './table-parts.tsx'

const TOPICS = ['settings.updated']
const s = tokens.space
const ui = tokens.adminText.ui
const figure = tokens.adminText.figure
/** react-native-web's link prop, which React Native's types don't name. */
const linkTo = (href: string) => ({ href }) as object
/** CSS grid on the web, through react-native-web's style pass-through. */
const grid = (style: object) => style as unknown as ViewStyle

// ---------------------------------------------------------------- shared

/** The way back to Settings › Profiles and formats (or Quality), above the editor. */
function Back({ to, children }: { to: string; children: string }) {
  return (
    <Press
      role="link"
      {...linkTo(to)}
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: s['1'],
        borderRadius: tokens.radius.sm,
      }}
    >
      {({ hovered }) => (
        <>
          <Icon
            name="chevron-left"
            size={tokens.icon.size.sm}
            color={hovered ? 'text' : 'text-2'}
          />
          <Text size={ui.size} leading={ui.leading} color={hovered ? 'text' : 'text-2'}>
            {children}
          </Text>
        </>
      )}
    </Press>
  )
}

function Missing() {
  const t = useT(messages)
  return (
    <EmptyState
      icon="search"
      title={t('missing')}
      action={<Button href="/settings/profiles">{t('back')}</Button>}
    >
      {t('missingBody')}
    </EmptyState>
  )
}

/** A whole number from an input, or the old value while it's half typed. */
const whole = (value: string, old: number) => {
  const n = Number(value)
  return value.trim() === '' || !Number.isFinite(n) ? old : Math.round(n)
}

/**
 * A number's field: what's typed stays as typed while it's half done ("", "-", "1."), and the
 * figure follows the value when it changes from outside (a Reset, a Discard), as a browser's
 * number field keeps its text. `onText` gets each change.
 */
function NumberInput({
  value,
  onText,
  ...props
}: Omit<InputProps, 'value' | 'onChangeText'> & {
  value: number | null
  onText: (text: string) => void
}) {
  const shown = (v: number | null) => (v === null ? '' : String(v))
  const [text, setText] = useState(shown(value))
  const [seen, setSeen] = useState(value)
  if (value !== seen) {
    setSeen(value)
    const typed = text.trim() === '' ? null : Number(text)
    if (typed !== value) setText(shown(value))
  }
  return (
    <Input
      inputMode="decimal"
      keyboardType="numbers-and-punctuation"
      mono
      {...props}
      value={text}
      onChangeText={(v) => {
        setText(v)
        onText(v)
      }}
    />
  )
}

/** Fields side by side: `columns` in a regular window, one above another below (16 apart). */
function Columns({ columns, children }: { columns: string; children: ReactNode }) {
  const medium = useRegularWindow()
  return (
    <View
      style={grid({
        display: 'grid',
        gridTemplateColumns: medium ? columns : 'minmax(0, 1fr)',
        alignItems: 'start',
        gap: s['4'],
      })}
    >
      {children}
    </View>
  )
}

const LANGUAGES = [
  'en',
  'fr',
  'de',
  'es',
  'it',
  'pt',
  'nl',
  'sv',
  'da',
  'no',
  'fi',
  'pl',
  'ru',
  'ja',
  'ko',
  'zh',
  'hi',
] as const

function useLanguageOptions() {
  const locale = useLocale()
  return useMemo(
    () => LANGUAGES.map((code) => ({ value: code, label: languageName(code, locale) })),
    [locale],
  )
}

/** The editor's frame: the page, the way back, and the loading and error states. */
function EditorPage<T>({
  title,
  description,
  actions,
  back,
  query,
  what,
  children,
}: {
  title: string
  description: string
  actions?: ReactNode
  back: ReactNode
  query: Parameters<typeof Loadable<T>>[0]['query']
  what: string
  children: (data: T) => ReactNode
}) {
  return (
    <AdminPage title={title} description={description} actions={actions}>
      {/* the web's max-w-240: 960 */}
      <View style={{ minWidth: 0, maxWidth: s['16'] * 15, gap: s['6'] }}>
        {back}
        <Loadable query={query} what={what}>
          {children}
        </Loadable>
      </View>
    </AdminPage>
  )
}

/** The page's Delete, asking first. */
function DeleteButton({
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void
}) {
  const t = useT(messages)
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="danger" icon="delete" hasPopup="dialog" onPress={() => setOpen(true)}>
        {t('delete')}
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        description={description}
        confirmLabel={confirmLabel}
        destructive
        onConfirm={onConfirm}
      />
    </>
  )
}

// ---------------------------------------------------------------- quality profile

type ProfileDraft = Omit<ApiProfile, 'id' | 'builtIn'>

const profileDraft = (p: ProfileDraft): ProfileDraft => ({
  name: p.name,
  items: p.items,
  cutoff: p.cutoff,
  upgradeAllowed: p.upgradeAllowed,
  minFormatScore: p.minFormatScore,
  cutoffFormatScore: p.cutoffFormatScore,
  minUpgradeFormatScore: p.minUpgradeFormatScore,
  formats: p.formats,
  language: p.language,
  waitMinutes: p.waitMinutes,
})

/** A new profile: TRaSH's HD Bluray + WEB order, every other quality listed but not wanted. */
const blankProfile = (): ProfileDraft => ({
  name: '',
  items: completeItems([item('Bluray-1080p', true), item('WEB 1080p', true)]),
  cutoff: 'Bluray-1080p',
  upgradeAllowed: true,
  minFormatScore: 0,
  cutoffFormatScore: 10000,
  minUpgradeFormatScore: 1,
  formats: [],
  language: 'any',
  waitMinutes: 0,
})

/** `/settings/profiles/{id}`, or `/settings/profiles/new`. */
export function ProfileEditor({ id }: { id: string }) {
  const t = useT(messages)
  const profiles = useQuery('settings:profiles', (c) => c.quality.profiles(), TOPICS)
  const formats = useQuery('settings:formats', (c) => c.quality.customFormats(), TOPICS)
  const isNew = id === 'new'
  const found = profiles.data?.find((p) => p.id === id)
  const title = isNew ? t('profile.new') : found ? t('profile.edit', { name: found.name }) : ''
  return (
    <EditorPage
      title={title || t('profile.group')}
      description={t('profile.description')}
      actions={found ? <DeleteProfile profile={found} /> : undefined}
      back={<Back to="/settings/profiles">{t('back')}</Back>}
      query={profiles}
      what={t('profile.what')}
    >
      {(ps) => {
        const loaded = isNew ? null : ps.find((p) => p.id === id)
        if (!isNew && !loaded) return <Missing />
        return (
          <ProfileForm
            // a fresh draft whenever the saved profile changes
            key={loaded ? JSON.stringify(loaded) : 'new'}
            id={loaded?.id ?? null}
            loaded={loaded ? profileDraft(loaded) : blankProfile()}
            formats={formats.data ?? []}
            reload={profiles.refetch}
          />
        )
      }}
    </EditorPage>
  )
}

function DeleteProfile({ profile }: { profile: ApiProfile }) {
  const t = useT(messages)
  const router = useRouter()
  const remove = useAction((c, id: string) => c.quality.removeProfile({ params: { id } }))
  return (
    <DeleteButton
      title={t('profile.deleteTitle', { name: profile.name })}
      description={t('profile.deleteBody')}
      confirmLabel={t('profile.deleteConfirm')}
      onConfirm={() =>
        remove.run(profile.id).then(
          () => {
            toast.success(t('profile.deleted', { name: profile.name }))
            router.push('/settings/profiles')
          },
          (e: Error) => toast.error(t('profile.deleteError'), { description: e.message }),
        )
      }
    />
  )
}

function ProfileForm({
  id,
  loaded,
  formats,
  reload,
}: {
  id: string | null
  loaded: ProfileDraft
  formats: ApiFormat[]
  reload: () => void
}) {
  const t = useT(messages)
  const router = useRouter()
  const languageOptions = useLanguageOptions()
  const [p, setDraft] = useState(loaded)
  const [nameTaken, setNameTaken] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)
  const isNew = id === null
  const dirty = JSON.stringify(p) !== JSON.stringify(loaded)
  const save = useAction((c, body: ProfileDraft) =>
    id ? c.quality.saveProfile({ params: { id }, body }) : c.quality.addProfile({ body }),
  )
  const set = (patch: Partial<ProfileDraft>) => {
    setNameTaken(null)
    setDraft((d) => ({ ...d, ...patch }))
  }

  const check = qualityProfileSchema.safeParse({ ...p, id: id ?? 'new' })
  const issues = check.success ? [] : check.error.issues
  const issueAt = (field: string) => issues.find((i) => i.path[0] === field)?.message
  const nameError = p.name.trim() === '' ? t('profile.nameMissing') : (nameTaken ?? undefined)
  const cutoffError = issueAt('cutoff') ? t('profile.cutoffInvalid') : undefined
  const waitError = issueAt('waitMinutes')
    ? t('profile.waitInvalid', { max: MAX_WAIT_MINUTES })
    : undefined
  const other = issues.filter(
    (i) => i.path[0] !== 'cutoff' && i.path[0] !== 'name' && i.path[0] !== 'waitMinutes',
  )

  const onSave = () => {
    setTouched(true)
    const first = nameError ?? cutoffError ?? waitError ?? other[0]?.message
    if (first) return toast.error(t('profile.check'), { description: first })
    save.run({ ...p, name: p.name.trim(), formats: p.formats.filter((f) => f.score !== 0) }).then(
      (saved) => {
        toast.success(t('profile.saved', { name: saved.name }))
        if (isNew) router.replace(`/settings/profiles/${saved.id}`)
        else reload()
      },
      (e: Error) => {
        if (errorReason(e) === 'name-taken') setNameTaken(e.message)
        toast.error(t('profile.saveError'), { description: e.message })
      },
    )
  }

  const allowed = p.items.filter((i) => i.allowed)
  return (
    <>
      <Group title={t('profile.group')}>
        <Columns columns="repeat(2, minmax(0, 1fr))">
          <Field label={t('profile.name')} error={touched || !isNew ? nameError : undefined}>
            <Input value={p.name} onChangeText={(name) => set({ name })} />
          </Field>
          <Field label={t('profile.language')} hint={t('profile.languageHint')}>
            <Select
              value={p.language}
              onValueChange={(language) => set({ language })}
              options={[
                { value: 'any', label: t('anyLanguage') },
                { value: 'original', label: t('originalLanguage') },
                ...languageOptions,
              ]}
            />
          </Field>
          <Field label={t('profile.wait')} hint={t('profile.waitHint')} error={waitError}>
            <NumberInput
              value={p.waitMinutes}
              inputMode="numeric"
              keyboardType="number-pad"
              onText={(v) => set({ waitMinutes: whole(v, p.waitMinutes) })}
            />
          </Field>
        </Columns>
      </Group>
      <Qualities profile={p} set={set} />
      <Group title={t('profile.upgrades')} description={t('profile.upgradesDescription')}>
        <Switch
          label={t('profile.upgradeAllowed')}
          hint={t('profile.upgradeAllowedHint')}
          checked={p.upgradeAllowed}
          onCheckedChange={(upgradeAllowed) => set({ upgradeAllowed })}
        />
        <Columns columns="repeat(2, minmax(0, 1fr))">
          <Field label={t('profile.cutoff')} hint={t('profile.cutoffHint')} error={cutoffError}>
            <Select
              value={p.cutoff}
              onValueChange={(cutoff) => set({ cutoff })}
              disabled={!p.upgradeAllowed}
              options={allowed.map((i) => ({ value: i.name, label: i.name }))}
            />
          </Field>
          <Field label={t('profile.cutoffScore')} hint={t('profile.cutoffScoreHint')}>
            <NumberInput
              value={p.cutoffFormatScore}
              disabled={!p.upgradeAllowed}
              onText={(v) => set({ cutoffFormatScore: whole(v, p.cutoffFormatScore) })}
            />
          </Field>
          <Field label={t('profile.minScore')} hint={t('profile.minScoreHint')}>
            <NumberInput
              value={p.minFormatScore}
              onText={(v) => set({ minFormatScore: whole(v, p.minFormatScore) })}
            />
          </Field>
          <Field label={t('profile.minUpgrade')} hint={t('profile.minUpgradeHint')}>
            <NumberInput
              value={p.minUpgradeFormatScore}
              disabled={!p.upgradeAllowed}
              inputMode="numeric"
              keyboardType="number-pad"
              onText={(v) =>
                set({ minUpgradeFormatScore: Math.max(1, whole(v, p.minUpgradeFormatScore)) })
              }
            />
          </Field>
        </Columns>
      </Group>
      <FormatScores profile={p} formats={formats} set={set} />
      {other.length > 0 ? (
        <Banner tone="danger" title={t('profile.cantSave')}>
          {`${other.map((i) => i.message).join('. ')}.`}
        </Banner>
      ) : null}
      <SaveBar
        dirty={dirty || isNew}
        saving={save.pending}
        onSave={onSave}
        onDiscard={isNew ? () => router.push('/settings/profiles') : () => setDraft(loaded)}
      />
    </>
  )
}

type Item = ApiProfile['items'][number]

/** A group is an item with more than one quality; its name is the owner's. */
const isGroup = (i: Item) => i.qualities.length > 1
/** Each item's first quality is unique across the profile, so it keys the row while a group is renamed. */
const itemKey = (i: Item) => i.qualities[0] ?? i.name
/** A group's name field at most 288 wide (the web's `max-w-72`). */
const GROUP_NAME_WIDTH = s['16'] * 4 + s['8']

function Qualities({
  profile: p,
  set,
}: {
  profile: ProfileDraft
  set: (patch: Partial<ProfileDraft>) => void
}) {
  const t = useT(messages)
  const sortMessages = useSortMessages()
  const replaceAt = (at: number, next: Item[], cutoff = p.cutoff) =>
    set({ items: [...p.items.slice(0, at), ...next, ...p.items.slice(at + next.length)], cutoff })

  const groupWithNext = (at: number) => {
    const a = p.items[at]
    const b = p.items[at + 1]
    if (!a || !b) return
    const name = isGroup(a) ? a.name : `${a.name} / ${b.name}`
    const merged = {
      name,
      allowed: a.allowed || b.allowed,
      qualities: [...a.qualities, ...b.qualities],
    }
    const items = [...p.items.slice(0, at), merged, ...p.items.slice(at + 2)]
    set({ items, cutoff: p.cutoff === a.name || p.cutoff === b.name ? name : p.cutoff })
  }
  const ungroup = (at: number) => {
    const g = p.items[at]
    if (!g) return
    const singles = g.qualities.map((q) => ({ name: q, allowed: g.allowed, qualities: [q] }))
    const items = [...p.items.slice(0, at), ...singles, ...p.items.slice(at + 1)]
    set({ items, cutoff: p.cutoff === g.name ? (g.qualities[0] ?? p.cutoff) : p.cutoff })
  }

  return (
    <Group title={t('profile.qualities')} description={t('profile.qualitiesDescription')}>
      <SortableList
        accessibilityLabel={t('profile.qualitiesLabel')}
        items={p.items}
        id={itemKey}
        label={(i) => i.name}
        onChange={(items) => set({ items })}
        messages={sortMessages}
      >
        {(it, handle) => {
          const at = p.items.indexOf(it)
          const group = isGroup(it)
          return (
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                alignItems: 'center',
                columnGap: s['3'],
                rowGap: s['1'] + s['0.5'],
                minWidth: 0,
              }}
            >
              {handle}
              <Checkbox
                label={t('profile.download', { name: it.name })}
                hideLabel
                checked={it.allowed}
                onCheckedChange={(v) => replaceAt(at, [{ ...it, allowed: v === true }])}
              />
              <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: s['12'] * 2, minWidth: 0 }}>
                {group ? (
                  <View style={{ maxWidth: GROUP_NAME_WIDTH }}>
                    <Field
                      label={t('profile.groupName', { qualities: it.qualities.join(', ') })}
                      hideLabel
                    >
                      <Input
                        value={it.name}
                        onChangeText={(name) =>
                          replaceAt(at, [{ ...it, name }], p.cutoff === it.name ? name : p.cutoff)
                        }
                      />
                    </Field>
                  </View>
                ) : (
                  <Text size={ui.size} leading={ui.leading} color={it.allowed ? 'text' : 'text-3'}>
                    {it.name}
                  </Text>
                )}
                {group ? (
                  <Note style={{ marginTop: s['0.5'] }}>
                    {t('profile.equal', { qualities: it.qualities.join(' · ') })}
                  </Note>
                ) : null}
              </View>
              {p.upgradeAllowed && p.cutoff === it.name ? (
                <Badge tone="accent">{t('profile.cutoffBadge')}</Badge>
              ) : null}
              <RowMenu
                label={t('profile.more', { name: it.name })}
                items={[
                  {
                    label: t('profile.groupWithNext'),
                    icon: 'add',
                    disabled: at === p.items.length - 1,
                    onSelect: () => groupWithNext(at),
                  },
                  ...(group
                    ? [
                        {
                          label: t('profile.ungroup'),
                          icon: 'remove' as const,
                          onSelect: () => ungroup(at),
                        },
                      ]
                    : []),
                ]}
              />
            </View>
          )
        }}
      </SortableList>
    </Group>
  )
}

/** A score's field, 96 wide at the cell's end (the web's `ms-auto w-24 text-end`). */
const SCORE_WIDTH = s['12'] * 2

function FormatScores({
  profile: p,
  formats,
  set,
}: {
  profile: ProfileDraft
  formats: ApiFormat[]
  set: (patch: Partial<ProfileDraft>) => void
}) {
  const t = useT(messages)
  const locale = useLocale()
  const scoreOf = (id: string) => p.formats.find((f) => f.formatId === id)?.score ?? 0
  const setScore = (formatId: string, score: number) =>
    set({
      formats: p.formats.some((f) => f.formatId === formatId)
        ? p.formats.map((f) => (f.formatId === formatId ? { formatId, score } : f))
        : [...p.formats, { formatId, score }],
    })
  return (
    <Group title={t('profile.scores')} description={t('profile.scoresDescription')}>
      {formats.length === 0 ? (
        <Note>{t('profile.noFormats')}</Note>
      ) : (
        <TableFrame>
          <Table label={t('profile.scores')}>
            <TableHeader>
              <TableRow>
                <TableHead>{t('profile.format')}</TableHead>
                <TableHead>{t('profile.matches')}</TableHead>
                <TableHead numeric>{t('profile.score')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {formats.map((f) => (
                <TableRow key={f.id}>
                  <TableCell>
                    <TitleLink href={`/settings/profiles/formats/${f.id}`}>{f.name}</TitleLink>
                  </TableCell>
                  <TableCell>
                    <Description>
                      {describeFormat(f as CustomFormat, locale).join(' · ')}
                    </Description>
                  </TableCell>
                  <TableCell numeric>
                    <View style={{ width: SCORE_WIDTH }}>
                      <Field label={t('profile.scoreLabel', { name: f.name })} hideLabel size="sm">
                        <NumberInput
                          value={scoreOf(f.id)}
                          style={{ textAlign: 'right' }}
                          onText={(v) => setScore(f.id, whole(v, scoreOf(f.id)))}
                        />
                      </Field>
                    </View>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      )}
      <View style={{ alignSelf: 'flex-start' }}>
        <Button size="sm" variant="secondary" icon="add" href="/settings/profiles/formats/new">
          {t('profile.newFormat')}
        </Button>
      </View>
    </Group>
  )
}

/** What a format or condition matches, in mono `figure` type, wrapping where it must. */
function Description({
  children,
  color = 'text-2',
}: {
  children: string
  color?: 'text-2' | 'text-3'
}) {
  return (
    <Text
      size={figure.size}
      leading={figure.leading}
      mono
      color={color}
      style={[{ flexShrink: 1, minWidth: 0 }, WRAP_ANYWHERE]}
    >
      {children}
    </Text>
  )
}

// ---------------------------------------------------------------- custom format

/** A new condition of `kind`, keeping the old one's name, negate and required. */
function conditionOf(kind: ConditionKind, from?: Condition): Condition {
  const base = {
    name: from?.name ?? '',
    negate: from?.negate ?? false,
    required: from?.required ?? false,
  }
  switch (kind) {
    case 'title':
    case 'edition':
    case 'releaseGroup':
      return { kind, value: '', ...base }
    case 'language':
      return { kind, value: { language: 'en', except: false }, ...base }
    case 'indexerFlag':
      return { kind, value: 'freeleech', ...base }
    case 'source':
      return { kind, value: 'bluray', ...base }
    case 'resolution':
      return { kind, value: 1080, ...base }
    case 'modifier':
      return { kind, value: 'remux', ...base }
    case 'size':
      return { kind, value: { min: 0, max: 100 }, ...base }
    case 'year':
      return { kind, value: { min: 1900, max: 2030 }, ...base }
  }
}

type FormatDraft = { name: string; conditions: Condition[] }

/** The draft as @highsea-tv/quality's matcher and checks take a format. */
const asFormat = (f: FormatDraft): CustomFormat => ({
  id: 'draft',
  source: 'custom',
  trashId: null,
  ...f,
})

/** `/settings/profiles/formats/{id}`, or `…/formats/new`. */
export function FormatEditor({ id }: { id: string }) {
  const t = useT(messages)
  const formats = useQuery('settings:formats', (c) => c.quality.customFormats(), TOPICS)
  const isNew = id === 'new'
  const found = formats.data?.find((f) => f.id === id)
  const title = isNew ? t('format.new') : found ? t('format.edit', { name: found.name }) : ''
  return (
    <EditorPage
      title={title || t('format.group')}
      description={t('format.description')}
      actions={found ? <DeleteFormat format={found} /> : undefined}
      back={<Back to="/settings/profiles">{t('back')}</Back>}
      query={formats}
      what={t('format.what')}
    >
      {(fs) => {
        const loaded = isNew ? null : fs.find((f) => f.id === id)
        if (!isNew && !loaded) return <Missing />
        return (
          <FormatForm
            key={loaded ? JSON.stringify(loaded) : 'new'}
            format={loaded ?? null}
            reload={formats.refetch}
            loaded={
              loaded
                ? { name: loaded.name, conditions: loaded.conditions as Condition[] }
                : { name: '', conditions: [conditionOf('title')] }
            }
          />
        )
      }}
    </EditorPage>
  )
}

function DeleteFormat({ format }: { format: ApiFormat }) {
  const t = useT(messages)
  const router = useRouter()
  const remove = useAction((c, id: string) => c.quality.removeFormat({ params: { id } }))
  return (
    <DeleteButton
      title={t('format.deleteTitle', { name: format.name })}
      description={t('format.deleteBody')}
      confirmLabel={t('format.deleteConfirm')}
      onConfirm={() =>
        remove.run(format.id).then(
          () => {
            toast.success(t('format.deleted', { name: format.name }))
            router.push('/settings/profiles')
          },
          (e: Error) => toast.error(t('format.deleteError'), { description: e.message }),
        )
      }
    />
  )
}

function FormatForm({
  format,
  loaded,
  reload,
}: {
  format: ApiFormat | null
  loaded: FormatDraft
  reload: () => void
}) {
  const t = useT(messages)
  const theme = useTheme()
  const locale = useLocale()
  const router = useRouter()
  const [f, setDraft] = useState(loaded)
  const [nameTaken, setNameTaken] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)
  const isNew = format === null
  const dirty = JSON.stringify(f) !== JSON.stringify(loaded)
  const save = useAction((c, body: { name: string; conditions: FormatCondition[] }) =>
    format
      ? c.quality.saveFormat({ params: { id: format.id }, body })
      : c.quality.addFormat({ body }),
  )
  const set = (patch: Partial<FormatDraft>) => {
    setNameTaken(null)
    setDraft((d) => ({ ...d, ...patch }))
  }
  const setAt = (at: number, c: Condition) =>
    set({ conditions: f.conditions.map((x, i) => (i === at ? c : x)) })

  const issues = validateFormat(asFormat(f), qualityT(locale))
  const blankPattern = (c: Condition) =>
    (c.kind === 'title' || c.kind === 'edition' || c.kind === 'releaseGroup') && c.value === ''
  const issueFor = (at: number) => {
    const c = f.conditions[at]
    if (c && blankPattern(c)) return t('format.patternMissing')
    return issues.find((i) => i.condition === at)?.message
  }
  const nameError = f.name.trim() === '' ? t('format.nameMissing') : (nameTaken ?? undefined)
  const general = issues.find((i) => i.condition === null)?.message

  const onSave = () => {
    setTouched(true)
    const first =
      nameError ?? general ?? f.conditions.map((_, i) => issueFor(i)).find(Boolean) ?? null
    if (first) return toast.error(t('format.check'), { description: first })
    save.run({ ...f, name: f.name.trim() }).then(
      (saved) => {
        toast.success(t('format.saved', { name: saved.name }))
        if (isNew) router.replace(`/settings/profiles/formats/${saved.id}`)
        else reload()
      },
      (e: Error) => {
        if (errorReason(e) === 'name-taken') setNameTaken(e.message)
        toast.error(t('format.saveError'), { description: e.message })
      },
    )
  }

  return (
    <>
      <Group title={t('format.group')}>
        <Field label={t('format.name')} error={touched || !isNew ? nameError : undefined}>
          <Input value={f.name} onChangeText={(name) => set({ name })} />
        </Field>
        {format?.source === 'preset' ? (
          <Note>{format.edited ? t('format.yours') : t('format.preset')}</Note>
        ) : null}
      </Group>
      <Group title={t('format.conditions')} description={t('format.conditionsDescription')}>
        {general ? (
          <Text size={ui.size} leading={ui.leading} color="badge-danger" role="alert">
            {general}
          </Text>
        ) : null}
        {/* an ordered list, as the web's <ol>: conditions are numbered in their labels */}
        <View role="list" aria-label={t('format.conditions')} style={{ gap: s['2'] }}>
          {f.conditions.map((c, at) => (
            <View
              // conditions have no ids; the list only grows at the end or loses one row
              // biome-ignore lint/suspicious/noArrayIndexKey: see above
              key={at}
              role="listitem"
              style={{
                gap: s['3'],
                padding: s['3'],
                borderWidth: line.thin,
                borderColor: theme.colors.line,
                borderRadius: tokens.radius.md,
                backgroundColor: theme.colors.s2,
                minWidth: 0,
              }}
            >
              <ConditionRow
                condition={c}
                index={at}
                error={issueFor(at)}
                onChange={(next) => setAt(at, next)}
                onRemove={() => set({ conditions: f.conditions.filter((_, i) => i !== at) })}
              />
            </View>
          ))}
        </View>
        <View style={{ alignSelf: 'flex-start' }}>
          <Button
            size="sm"
            variant="secondary"
            icon="add"
            onPress={() => set({ conditions: [...f.conditions, conditionOf('title')] })}
          >
            {t('format.add')}
          </Button>
        </View>
      </Group>
      <FormatTest format={asFormat(f)} />
      <SaveBar
        dirty={dirty || isNew}
        saving={save.pending}
        onSave={onSave}
        onDiscard={isNew ? () => router.push('/settings/profiles') : () => setDraft(loaded)}
      />
    </>
  )
}

function ConditionRow({
  condition: c,
  index,
  error,
  onChange,
  onRemove,
}: {
  condition: Condition
  index: number
  error: string | undefined
  onChange: (c: Condition) => void
  onRemove: () => void
}) {
  const t = useT(messages)
  const locale = useLocale()
  const n = index + 1
  return (
    <>
      <View
        style={grid({
          display: 'grid',
          gridTemplateColumns: useRegularWindow()
            ? // the web's 12rem: 192
              `${s['12'] * 4}px minmax(0, 1fr) auto`
            : 'minmax(0, 1fr)',
          alignItems: 'end',
          gap: s['3'],
        })}
      >
        <Field label={t('format.condition', { n })}>
          <Select
            value={c.kind}
            onValueChange={(kind) => onChange(conditionOf(kind as ConditionKind, c))}
            options={CONDITION_KINDS.map((k) => ({ value: k, label: t(`kind.${k}`) }))}
          />
        </Field>
        <ConditionValue condition={c} index={n} error={error} onChange={onChange} />
        <Button
          variant="ghost"
          iconOnly
          icon="delete"
          accessibilityLabel={t('format.remove', { n })}
          onPress={onRemove}
        />
      </View>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          columnGap: s['6'],
          rowGap: s['2'],
        }}
      >
        <Checkbox
          label={t('format.not')}
          hint={t('format.notHint')}
          checked={c.negate}
          onCheckedChange={(v) => onChange({ ...c, negate: v === true })}
        />
        <Checkbox
          label={t('format.required')}
          hint={t('format.requiredHint')}
          checked={c.required}
          onCheckedChange={(v) => onChange({ ...c, required: v === true })}
        />
        <View style={{ marginStart: 'auto', flexShrink: 1, minWidth: 0 }}>
          <Description color="text-3">{error ? '' : describeCondition(c, locale)}</Description>
        </View>
      </View>
    </>
  )
}

function ConditionValue({
  condition: c,
  index,
  error,
  onChange,
}: {
  condition: Condition
  index: number
  error: string | undefined
  onChange: (c: Condition) => void
}) {
  const t = useT(messages)
  const languageOptions = useLanguageOptions()
  const medium = useRegularWindow()
  switch (c.kind) {
    case 'title':
    case 'edition':
    case 'releaseGroup':
      return (
        <Field label={t('format.pattern')} hint={t('format.patternHint')} error={error}>
          <Input
            value={c.value}
            mono
            spellCheck={false}
            autoCapitalize="none"
            onChangeText={(value) => onChange({ ...c, value })}
            placeholder={c.kind === 'releaseGroup' ? '^(FraMeSToR|BLURANiUM)$' : '\\b(dv|dovi)\\b'}
          />
        </Field>
      )
    case 'language':
      return (
        <View
          style={grid({
            display: 'grid',
            gridTemplateColumns: medium ? 'minmax(0, 1fr) auto' : 'minmax(0, 1fr)',
            alignItems: 'end',
            gap: s['3'],
          })}
        >
          <Field label={t('kind.language')}>
            <Select
              value={c.value.language}
              onValueChange={(language) => onChange({ ...c, value: { ...c.value, language } })}
              options={[{ value: 'original', label: t('originalLanguage') }, ...languageOptions]}
            />
          </Field>
          <Checkbox
            label={t('format.anyOther')}
            checked={c.value.except}
            onCheckedChange={(v) => onChange({ ...c, value: { ...c.value, except: v === true } })}
          />
        </View>
      )
    case 'indexerFlag':
      return (
        <Field label={t('format.flag')}>
          <Select
            value={c.value}
            onValueChange={(v) => onChange({ ...c, value: v as IndexerFlag })}
            options={INDEXER_FLAGS.map((x) => ({ value: x, label: t(`flag.${x}`) }))}
          />
        </Field>
      )
    case 'source':
      return (
        <Field label={t('format.source')}>
          <Select
            value={c.value}
            onValueChange={(v) => onChange({ ...c, value: v as (typeof SOURCES)[number] })}
            options={SOURCES.map((x) => ({ value: x, label: t(`source.${x}`) }))}
          />
        </Field>
      )
    case 'resolution':
      return (
        <Field label={t('format.resolution')}>
          <Select
            value={String(c.value)}
            onValueChange={(v) =>
              onChange({ ...c, value: Number(v) as (typeof RESOLUTIONS)[number] })
            }
            options={RESOLUTIONS.map((x) => ({ value: String(x), label: `${x}p` }))}
          />
        </Field>
      )
    case 'modifier':
      return (
        <Field label={t('format.modifier')}>
          <Select
            value={c.value}
            onValueChange={(v) => onChange({ ...c, value: v as (typeof MODIFIERS)[number] })}
            options={MODIFIERS.map((x) => ({ value: x, label: t(`modifier.${x}`) }))}
          />
        </Field>
      )
    case 'size':
    case 'year': {
      const gb = c.kind === 'size'
      const end = (key: 'min' | 'max') => {
        const label = gb
          ? t(key === 'min' ? 'format.fromGb' : 'format.toGb')
          : t(key === 'min' ? 'format.from' : 'format.to')
        return (
          <View style={{ flex: 1, minWidth: 0 }}>
            {/* the field reads its number with it ("Condition 2: to GB"), as the web's aria-label */}
            <Field label={label} error={key === 'max' ? error : undefined}>
              <NumberInput
                value={c.value[key]}
                accessibilityLabel={t('format.endLabel', { n: index, end: label })}
                onText={(text) => {
                  const v = Number(text)
                  if (text !== '' && Number.isFinite(v) && v >= 0)
                    onChange({ ...c, value: { ...c.value, [key]: v } })
                }}
              />
            </Field>
          </View>
        )
      }
      return (
        <View style={{ flexDirection: 'row', gap: s['3'] }}>
          {end('min')}
          {end('max')}
        </View>
      )
    }
  }
}

/** A release name through the parser and the format, as a search would judge it. */
function FormatTest({ format }: { format: CustomFormat }) {
  const t = useT(messages)
  const locale = useLocale()
  const [name, setName] = useState(
    'Sintel.2010.2160p.UHD.BluRay.DV.HDR10.HEVC.TrueHD.7.1-FraMeSToR',
  )
  const [size, setSize] = useState('')
  const release = useMemo(() => (name.trim() ? parse(name.trim()) : null), [name])
  const gb = Number(size)
  const input: FormatInput | null = release
    ? { release, size: size.trim() !== '' && Number.isFinite(gb) ? gb * 1024 ** 3 : null }
    : null
  const matched = input ? matchesFormat(format, input) : false
  return (
    <Group title={t('test.title')} description={t('test.description')}>
      {/* the web's 10rem: 160 */}
      <Columns columns={`minmax(0, 1fr) ${s['16'] * 2 + s['8']}px`}>
        <Field label={t('test.name')}>
          <Input
            value={name}
            mono
            spellCheck={false}
            autoCapitalize="none"
            onChangeText={setName}
          />
        </Field>
        <Field label={t('test.size')} hint={t('test.sizeHint')}>
          <Input
            value={size}
            mono
            inputMode="decimal"
            keyboardType="decimal-pad"
            onChangeText={setSize}
          />
        </Field>
      </Columns>
      {release && input ? (
        <View style={{ gap: s['3'], minWidth: 0 }} aria-live="polite">
          <View
            style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: s['2'] }}
          >
            <Badge tone={matched ? 'success' : 'neutral'}>
              {matched ? t('test.matches') : t('test.noMatch')}
            </Badge>
            <Text
              size={ui.size}
              leading={ui.leading}
              color="text-2"
              style={[{ flexShrink: 1, minWidth: 0 }, WRAP_ANYWHERE]}
            >
              {t('test.readAs', { quality: qualityOf(release.quality) })}
              {release.releaseGroup ? t('test.group', { group: release.releaseGroup }) : ''}
              {release.edition ? t('test.edition', { edition: release.edition }) : ''}
              {release.languages.length
                ? t('test.languages', {
                    languages: new Intl.ListFormat(locale, { type: 'conjunction' }).format(
                      release.languages.map((l) => languageName(l, locale)),
                    ),
                  })
                : ''}
            </Text>
          </View>
          <View role="list" aria-label={t('test.each')} style={{ gap: s['1'] }}>
            {format.conditions.map((c, i) => {
              const holds = conditionHolds(c, input)
              return (
                <View
                  // biome-ignore lint/suspicious/noArrayIndexKey: conditions have no ids
                  key={i}
                  role="listitem"
                  style={{ flexDirection: 'row', alignItems: 'center', gap: s['2'] }}
                >
                  <Badge tone={holds ? 'success' : 'neutral'}>
                    {holds ? t('test.yes') : t('test.no')}
                  </Badge>
                  <Text
                    variant="caption"
                    mono
                    color="text-2"
                    style={[{ flexShrink: 1, minWidth: 0 }, WRAP_ANYWHERE]}
                  >
                    {c.kind === 'title' && c.value === ''
                      ? t('kind.title')
                      : describeCondition(c, locale)}
                  </Text>
                </View>
              )
            })}
          </View>
        </View>
      ) : null}
    </Group>
  )
}

// ---------------------------------------------------------------- sizes

/** A film's size from MiB per minute: Radarr's sizes are MiB (the Servarr wiki's "MB"). */
const filmSize = (perMinute: number, minutes: number) => bytes(perMinute * MIB * minutes)

/**
 * `/settings/quality/sizes`: the size table, with each row checked and a film's size beside it.
 * When the server serves shows (D3's answer 5), a switch chooses movies' table or episodes', as the
 * prototype's stage 6 drew: both drafts are kept while switching, Save saves both, and Reset resets
 * the one shown. Episodes' sizes come from Shows' drafted route (series-settings.ts).
 */
export function SizeEditor() {
  const t = useT(messages)
  const shows = useServes('shows')
  const data = useQuery('settings:quality-sizes', (c) => c.settings.qualitySizes(), TOPICS)
  const [kind, setKind] = useState<SizeKind>('movies')
  // what's changed and not saved, per kind; a kind not here shows what's saved
  const [drafts, setDrafts] = useState<Drafts>({})
  const shown = shows ? kind : 'movies'
  return (
    <EditorPage
      title={t('sizes.title')}
      description={shows ? t('sizes.descriptionShows') : t('sizes.description')}
      actions={
        <Button
          variant="secondary"
          icon="replay"
          disabled={data.status !== 'success'}
          onPress={() => {
            setDrafts((d) => ({
              ...d,
              [shown]: shown === 'shows' ? defaultEpisodeSizes() : defaultQualitySizes(),
            }))
            toast({
              title: !shows
                ? t('sizes.resetDone')
                : shown === 'shows'
                  ? t('sizes.resetEpisodes')
                  : t('sizes.resetMovies'),
              description: t('sizes.resetBody'),
            })
          }}
        >
          {t('sizes.reset')}
        </Button>
      }
      back={<Back to="/settings/quality">{t('backQuality')}</Back>}
      query={data}
      what={t('sizes.what')}
    >
      {(movies) => {
        const table = (episodes?: QualitySize[], refetch?: () => void) => (
          <SizeTable
            kind={shown}
            onKind={episodes ? setKind : undefined}
            loaded={{ movies, shows: episodes }}
            drafts={drafts}
            setDrafts={setDrafts}
            onSaved={() => {
              data.refetch()
              refetch?.()
            }}
          />
        )
        return shows ? <WithEpisodeSizes>{table}</WithEpisodeSizes> : table()
      }}
    </EditorPage>
  )
}

type SizeKind = 'movies' | 'shows'
type Drafts = Partial<Record<SizeKind, QualitySize[]>>

/** Episodes' sizes, read only when the server serves shows. */
function WithEpisodeSizes({
  children,
}: {
  children: (rows: QualitySize[], refetch: () => void) => ReactNode
}) {
  const t = useT(messages)
  const data = useQuery('settings:episode-sizes', (c) => c.series.qualitySizes(), TOPICS)
  return (
    <Loadable query={data} what={t('sizes.what')}>
      {(rows) => children(rows, () => data.refetch())}
    </Loadable>
  )
}

/** The minutes field at most 240 wide (the web's `max-w-60`). */
const MINUTES_WIDTH = s['16'] * 3 + s['12']

function SizeTable({
  kind,
  onKind,
  loaded,
  drafts,
  setDrafts,
  onSaved,
}: {
  kind: SizeKind
  /** Given when there's an episodes' table to switch to. */
  onKind?: (kind: SizeKind) => void
  loaded: { movies: QualitySize[]; shows?: QualitySize[] }
  drafts: Drafts
  setDrafts: (next: (d: Drafts) => Drafts) => void
  onSaved: () => void
}) {
  const t = useT(messages)
  const [minuteFor, setMinuteFor] = useState<Record<SizeKind, number>>({ movies: 120, shows: 45 })
  const minutes = minuteFor[kind]
  const setMinutes = (m: number) => setMinuteFor((all) => ({ ...all, [kind]: m }))
  const saveMovies = useAction((c, body: QualitySize[]) => c.settings.saveQualitySizes({ body }))
  const saveEpisodes = useAction((c, body: QualitySize[]) => c.series.saveQualitySizes({ body }))
  const saved = (k: SizeKind) => (k === 'shows' ? (loaded.shows ?? []) : loaded.movies)
  const rowsOf = (k: SizeKind) => drafts[k] ?? saved(k)
  const changed = (k: SizeKind) =>
    drafts[k] !== undefined && JSON.stringify(drafts[k]) !== JSON.stringify(saved(k))
  const kinds: SizeKind[] = loaded.shows ? ['movies', 'shows'] : ['movies']
  const dirty = kinds.some(changed)
  const rows = rowsOf(kind)
  const setRows = (next: (all: QualitySize[]) => QualitySize[]) =>
    setDrafts((d) => ({ ...d, [kind]: next(d[kind] ?? saved(kind)) }))
  const check = (all: QualitySize[]) =>
    all.map((r) => {
      const c = qualitySizeSchema.safeParse(r)
      return c.success ? null : (c.error.issues[0]?.message ?? t('sizes.rowInvalid'))
    })
  const errors = check(rows)
  const episodes = kind === 'shows'
  const onSave = () => {
    const toSave = kinds.filter(changed)
    for (const k of toSave) {
      const all = rowsOf(k)
      const found = check(all)
      const at = found.findIndex(Boolean)
      if (at >= 0) {
        onKind?.(k)
        return toast.error(t('sizes.check'), {
          description: `${all[at]?.quality}: ${found[at]}`,
        })
      }
    }
    Promise.all(toSave.map((k) => (k === 'shows' ? saveEpisodes : saveMovies).run(rowsOf(k)))).then(
      () => {
        toast.success(t('sizes.saved'))
        setDrafts(() => ({}))
        onSaved()
      },
      (e: Error) => toast.error(t('sizes.saveError'), { description: e.message }),
    )
  }
  return (
    <>
      {onKind ? (
        <View style={{ alignSelf: 'flex-start' }}>
          <SegmentedControl
            aria-label={t('sizes.kind')}
            size="sm"
            value={kind}
            onValueChange={(k) => onKind(k as SizeKind)}
            options={[
              { value: 'movies', label: t('sizes.kind.movies') },
              { value: 'shows', label: t('sizes.kind.shows') },
            ]}
          />
        </View>
      ) : null}
      <Group
        title={episodes ? t('sizes.episodes.group') : t('sizes.group')}
        description={episodes ? t('sizes.episodes.groupDescription') : t('sizes.groupDescription')}
      >
        <View style={{ maxWidth: MINUTES_WIDTH }}>
          <Field
            label={episodes ? t('sizes.episodes.minutes') : t('sizes.minutes')}
            hint={episodes ? t('sizes.episodes.minutesHint') : t('sizes.minutesHint')}
          >
            <NumberInput
              value={minutes}
              inputMode="numeric"
              keyboardType="number-pad"
              onText={(v) => setMinutes(Math.min(600, Math.max(1, whole(v, minutes))))}
            />
          </Field>
        </View>
        <TableFrame>
          <Table label={episodes ? t('sizes.episodes.group') : t('sizes.group')}>
            <TableHeader>
              <TableRow>
                <TableHead>{t('sizes.quality')}</TableHead>
                <TableHead numeric>{t('sizes.min')}</TableHead>
                <TableHead numeric>{t('sizes.preferred')}</TableHead>
                <TableHead numeric>{t('sizes.max')}</TableHead>
                <TableHead numeric>
                  {episodes ? t('sizes.episode', { minutes }) : t('sizes.film', { minutes })}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((q, i) => {
                const cell = (key: 'min' | 'preferred' | 'max') => (
                  <TableCell numeric>
                    <View style={{ width: SCORE_WIDTH }}>
                      <NumberInput
                        size="sm"
                        accessibilityLabel={t(`sizes.cell.${key}`, { quality: q.quality })}
                        invalid={errors[i] ? true : undefined}
                        aria-invalid={errors[i] ? true : undefined}
                        value={q[key]}
                        placeholder={key === 'min' ? '0' : t('sizes.noLimit')}
                        style={{ textAlign: 'right' }}
                        onText={(v) => {
                          const n = Number(v)
                          if (v !== '' && (!Number.isFinite(n) || n < 0)) return
                          setRows((all) =>
                            all.map((r, j) =>
                              j === i
                                ? { ...r, [key]: v === '' ? (key === 'min' ? 0 : null) : n }
                                : r,
                            ),
                          )
                        }}
                      />
                    </View>
                  </TableCell>
                )
                return (
                  <TableRow key={q.quality}>
                    <TableCell>
                      <View style={{ minWidth: 0 }}>
                        <Text size={ui.size} leading={ui.leading}>
                          {q.quality}
                        </Text>
                        {errors[i] ? (
                          <Text variant="caption" color="badge-danger" role="alert">
                            {errors[i]}
                          </Text>
                        ) : null}
                      </View>
                    </TableCell>
                    {cell('min')}
                    {cell('preferred')}
                    {cell('max')}
                    <TableCell numeric>
                      {q.max === null
                        ? q.min === 0
                          ? t('sizes.any')
                          : t('sizes.orMore', { min: filmSize(q.min, minutes) })
                        : t('sizes.range', {
                            min: filmSize(q.min, minutes),
                            max: filmSize(q.max, minutes),
                          })}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableFrame>
      </Group>
      <SaveBar
        dirty={dirty}
        saving={saveMovies.pending || saveEpisodes.pending}
        onSave={onSave}
        onDiscard={() => setDrafts(() => ({}))}
      />
    </>
  )
}

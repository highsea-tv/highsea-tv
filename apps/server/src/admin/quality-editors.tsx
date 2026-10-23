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
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
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
  toast,
} from '@highsea-tv/ui-web'
import { useRouter } from 'next/navigation'
import { type ReactNode, useMemo, useState } from 'react'
import { Loadable } from './loadable.tsx'
import { errorReason } from './metadata-locale.ts'
import { editors as messages } from './quality-editors-messages.ts'
import { Group, SaveBar } from './settings.tsx'
import { AdminPage } from './shell.tsx'

const TOPICS = ['settings.updated']

// ---------------------------------------------------------------- shared

/** The way back to Settings › Profiles and formats (or Quality), above the editor. */
function Back({ to, children }: { to: string; children: ReactNode }) {
  return (
    <a
      href={to}
      className="flex items-center gap-1 justify-self-start rounded-sm text-text-2 text-ui outline-none hover:text-text focus-visible:ring-focus"
    >
      <Icon name="chevron-left" size={16} />
      {children}
    </a>
  )
}

function Missing() {
  const t = useT(messages)
  return (
    <EmptyState
      icon="search"
      title={t('missing')}
      action={
        <Button asChild>
          <a href="/settings/profiles">{t('back')}</a>
        </Button>
      }
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
      <div className="grid min-w-0 max-w-240 content-start gap-6">
        {back}
        <Loadable query={query} what={what}>
          {children}
        </Loadable>
      </div>
    </AdminPage>
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
    <ConfirmDialog
      trigger={
        <Button variant="danger" icon="delete">
          {t('delete')}
        </Button>
      }
      title={t('profile.deleteTitle', { name: profile.name })}
      description={t('profile.deleteBody')}
      confirmLabel={t('profile.deleteConfirm')}
      destructive
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
        <div className="grid items-start gap-4 medium:grid-cols-2">
          <Field label={t('profile.name')} error={touched || !isNew ? nameError : undefined}>
            <Input value={p.name} onChange={(e) => set({ name: e.target.value })} />
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
            <Input
              type="number"
              min={0}
              max={MAX_WAIT_MINUTES}
              value={p.waitMinutes}
              onChange={(e) => set({ waitMinutes: whole(e.target.value, p.waitMinutes) })}
              className="font-mono"
            />
          </Field>
        </div>
      </Group>
      <Qualities profile={p} set={set} />
      <Group title={t('profile.upgrades')} description={t('profile.upgradesDescription')}>
        <Field inline label={t('profile.upgradeAllowed')} hint={t('profile.upgradeAllowedHint')}>
          <Switch
            checked={p.upgradeAllowed}
            onCheckedChange={(upgradeAllowed) => set({ upgradeAllowed })}
          />
        </Field>
        <div className="grid items-start gap-4 medium:grid-cols-2">
          <Field label={t('profile.cutoff')} hint={t('profile.cutoffHint')} error={cutoffError}>
            <Select
              value={p.cutoff}
              onValueChange={(cutoff) => set({ cutoff })}
              disabled={!p.upgradeAllowed}
              options={allowed.map((i) => ({ value: i.name, label: i.name }))}
            />
          </Field>
          <Field label={t('profile.cutoffScore')} hint={t('profile.cutoffScoreHint')}>
            <Input
              type="number"
              value={p.cutoffFormatScore}
              disabled={!p.upgradeAllowed}
              onChange={(e) =>
                set({ cutoffFormatScore: whole(e.target.value, p.cutoffFormatScore) })
              }
              className="font-mono"
            />
          </Field>
          <Field label={t('profile.minScore')} hint={t('profile.minScoreHint')}>
            <Input
              type="number"
              value={p.minFormatScore}
              onChange={(e) => set({ minFormatScore: whole(e.target.value, p.minFormatScore) })}
              className="font-mono"
            />
          </Field>
          <Field label={t('profile.minUpgrade')} hint={t('profile.minUpgradeHint')}>
            <Input
              type="number"
              min={1}
              value={p.minUpgradeFormatScore}
              disabled={!p.upgradeAllowed}
              onChange={(e) =>
                set({
                  minUpgradeFormatScore: Math.max(
                    1,
                    whole(e.target.value, p.minUpgradeFormatScore),
                  ),
                })
              }
              className="font-mono"
            />
          </Field>
        </div>
      </Group>
      <FormatScores profile={p} formats={formats} set={set} />
      {other.length > 0 && (
        <Banner tone="danger" title={t('profile.cantSave')}>
          {other.map((i) => i.message).join('. ')}.
        </Banner>
      )}
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

function Qualities({
  profile: p,
  set,
}: {
  profile: ProfileDraft
  set: (patch: Partial<ProfileDraft>) => void
}) {
  const t = useT(messages)
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
        aria-label={t('profile.qualitiesLabel')}
        items={p.items}
        id={itemKey}
        label={(i) => i.name}
        onChange={(items) => set({ items })}
        className="grid gap-1.5"
        itemClassName="rounded-md border border-line bg-s2"
      >
        {(it, handle) => {
          const at = p.items.indexOf(it)
          const group = isGroup(it)
          return (
            <div className="flex min-w-0 items-center gap-3 px-2 py-1.5">
              {handle}
              <Checkbox
                aria-label={t('profile.download', { name: it.name })}
                checked={it.allowed}
                onCheckedChange={(v) => replaceAt(at, [{ ...it, allowed: v === true }])}
              />
              <div className="grid min-w-0 flex-1 gap-0.5">
                {group ? (
                  <Input
                    aria-label={t('profile.groupName', { qualities: it.qualities.join(', ') })}
                    value={it.name}
                    onChange={(e) =>
                      replaceAt(
                        at,
                        [{ ...it, name: e.target.value }],
                        p.cutoff === it.name ? e.target.value : p.cutoff,
                      )
                    }
                    className="max-w-72"
                  />
                ) : (
                  <span className={it.allowed ? 'text-text text-ui' : 'text-text-3 text-ui'}>
                    {it.name}
                  </span>
                )}
                {group && (
                  <span className="truncate text-caption text-text-3">
                    {t('profile.equal', { qualities: it.qualities.join(' · ') })}
                  </span>
                )}
              </div>
              {p.upgradeAllowed && p.cutoff === it.name && (
                <Badge tone="accent">{t('profile.cutoffBadge')}</Badge>
              )}
              <Menu>
                <MenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    iconOnly
                    icon="more"
                    aria-label={t('profile.more', { name: it.name })}
                  />
                </MenuTrigger>
                <MenuContent>
                  <MenuItem
                    icon="add"
                    disabled={at === p.items.length - 1}
                    onSelect={() => groupWithNext(at)}
                  >
                    {t('profile.groupWithNext')}
                  </MenuItem>
                  {group && (
                    <MenuItem icon="remove" onSelect={() => ungroup(at)}>
                      {t('profile.ungroup')}
                    </MenuItem>
                  )}
                </MenuContent>
              </Menu>
            </div>
          )
        }}
      </SortableList>
    </Group>
  )
}

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
        <p className="text-caption text-text-3">{t('profile.noFormats')}</p>
      ) : (
        <TableFrame>
          <Table aria-label={t('profile.scores')}>
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
                  <TableCell className="text-text">
                    <a href={`/settings/profiles/formats/${f.id}`} className="hover:underline">
                      {f.name}
                    </a>
                  </TableCell>
                  <TableCell className="whitespace-normal break-words font-mono text-figure text-text-2">
                    {describeFormat(f as CustomFormat, locale).join(' · ')}
                  </TableCell>
                  <TableCell numeric>
                    <Input
                      type="number"
                      aria-label={t('profile.scoreLabel', { name: f.name })}
                      value={scoreOf(f.id)}
                      onChange={(e) => setScore(f.id, whole(e.target.value, scoreOf(f.id)))}
                      className="ms-auto w-24 text-end font-mono"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      )}
      <Button size="sm" variant="secondary" icon="add" className="justify-self-start" asChild>
        <a href="/settings/profiles/formats/new">{t('profile.newFormat')}</a>
      </Button>
    </Group>
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
    <ConfirmDialog
      trigger={
        <Button variant="danger" icon="delete">
          {t('delete')}
        </Button>
      }
      title={t('format.deleteTitle', { name: format.name })}
      description={t('format.deleteBody')}
      confirmLabel={t('format.deleteConfirm')}
      destructive
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
          <Input value={f.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        {format?.source === 'preset' && (
          <p className="text-caption text-text-3">
            {format.edited ? t('format.yours') : t('format.preset')}
          </p>
        )}
      </Group>
      <Group title={t('format.conditions')} description={t('format.conditionsDescription')}>
        {general && (
          <p role="alert" className="text-badge-danger text-ui">
            {general}
          </p>
        )}
        <ol aria-label={t('format.conditions')} className="grid gap-2">
          {f.conditions.map((c, at) => (
            <li
              // conditions have no ids; the list only grows at the end or loses one row
              // biome-ignore lint/suspicious/noArrayIndexKey: see above
              key={at}
              className="grid gap-3 rounded-md border border-line bg-s2 p-3"
            >
              <ConditionRow
                condition={c}
                index={at}
                error={issueFor(at)}
                onChange={(next) => setAt(at, next)}
                onRemove={() => set({ conditions: f.conditions.filter((_, i) => i !== at) })}
              />
            </li>
          ))}
        </ol>
        <Button
          size="sm"
          variant="secondary"
          icon="add"
          className="justify-self-start"
          onClick={() => set({ conditions: [...f.conditions, conditionOf('title')] })}
        >
          {t('format.add')}
        </Button>
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
      <div className="grid gap-3 medium:grid-cols-[12rem_minmax(0,1fr)_auto] medium:items-end">
        <Field label={t('format.condition', { n })}>
          <Select
            value={c.kind}
            onValueChange={(kind) => onChange(conditionOf(kind as ConditionKind, c))}
            options={CONDITION_KINDS.map((k) => ({ value: k, label: t(`kind.${k}`) }))}
          />
        </Field>
        <ConditionValue condition={c} index={n} error={error} onChange={onChange} />
        <Button
          size="sm"
          variant="ghost"
          iconOnly
          icon="delete"
          aria-label={t('format.remove', { n })}
          onClick={onRemove}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Field inline label={t('format.not')} hint={t('format.notHint')}>
          <Checkbox
            checked={c.negate}
            onCheckedChange={(v) => onChange({ ...c, negate: v === true })}
          />
        </Field>
        <Field inline label={t('format.required')} hint={t('format.requiredHint')}>
          <Checkbox
            checked={c.required}
            onCheckedChange={(v) => onChange({ ...c, required: v === true })}
          />
        </Field>
        <span className="ms-auto font-mono text-figure text-text-3">
          {error ? '' : describeCondition(c, locale)}
        </span>
      </div>
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
  switch (c.kind) {
    case 'title':
    case 'edition':
    case 'releaseGroup':
      return (
        <Field label={t('format.pattern')} hint={t('format.patternHint')} error={error}>
          <Input
            value={c.value}
            onChange={(e) => onChange({ ...c, value: e.target.value })}
            className="font-mono"
            placeholder={c.kind === 'releaseGroup' ? '^(FraMeSToR|BLURANiUM)$' : '\\b(dv|dovi)\\b'}
          />
        </Field>
      )
    case 'language':
      return (
        <div className="grid gap-3 medium:grid-cols-[minmax(0,1fr)_auto] medium:items-end">
          <Field label={t('kind.language')}>
            <Select
              value={c.value.language}
              onValueChange={(language) => onChange({ ...c, value: { ...c.value, language } })}
              options={[{ value: 'original', label: t('originalLanguage') }, ...languageOptions]}
            />
          </Field>
          <Field inline label={t('format.anyOther')}>
            <Checkbox
              checked={c.value.except}
              onCheckedChange={(v) => onChange({ ...c, value: { ...c.value, except: v === true } })}
            />
          </Field>
        </div>
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
          <Field label={label} error={key === 'max' ? error : undefined}>
            <Input
              type="number"
              min={0}
              aria-label={t('format.endLabel', { n: index, end: label })}
              value={c.value[key]}
              onChange={(e) => {
                const v = Number(e.target.value)
                if (e.target.value !== '' && Number.isFinite(v) && v >= 0)
                  onChange({ ...c, value: { ...c.value, [key]: v } })
              }}
              className="font-mono"
            />
          </Field>
        )
      }
      return (
        <div className="grid grid-cols-2 gap-3">
          {end('min')}
          {end('max')}
        </div>
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
      <div className="grid gap-4 medium:grid-cols-[minmax(0,1fr)_10rem]">
        <Field label={t('test.name')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="font-mono" />
        </Field>
        <Field label={t('test.size')} hint={t('test.sizeHint')}>
          <Input
            type="number"
            min={0}
            value={size}
            onChange={(e) => setSize(e.target.value)}
            className="font-mono"
          />
        </Field>
      </div>
      {release && input && (
        <div className="grid gap-3" aria-live="polite">
          <p className="flex flex-wrap items-center gap-2 text-ui">
            <Badge tone={matched ? 'success' : 'neutral'}>
              {matched ? t('test.matches') : t('test.noMatch')}
            </Badge>
            <span className="text-text-2">
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
            </span>
          </p>
          <ul aria-label={t('test.each')} className="grid gap-1">
            {format.conditions.map((c, i) => {
              const holds = conditionHolds(c, input)
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: conditions have no ids
                <li key={i} className="flex items-center gap-2 text-caption">
                  <Badge tone={holds ? 'success' : 'neutral'}>
                    {holds ? t('test.yes') : t('test.no')}
                  </Badge>
                  <span className="font-mono text-text-2">
                    {c.kind === 'title' && c.value === ''
                      ? t('kind.title')
                      : describeCondition(c, locale)}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </Group>
  )
}

// ---------------------------------------------------------------- sizes

/** A film's size from MiB per minute: Radarr's sizes are MiB (the Servarr wiki's "MB"). */
const filmSize = (perMinute: number, minutes: number) => bytes(perMinute * MIB * minutes)

/** `/settings/quality/sizes`: the size table, with each row checked and a film's size beside it. */
export function SizeEditor() {
  const t = useT(messages)
  const data = useQuery('settings:quality-sizes', (c) => c.settings.qualitySizes(), TOPICS)
  const [reset, setReset] = useState<QualitySize[] | null>(null)
  return (
    <EditorPage
      title={t('sizes.title')}
      description={t('sizes.description')}
      actions={
        <Button
          variant="secondary"
          icon="replay"
          disabled={data.status !== 'success'}
          onClick={() => {
            setReset(defaultQualitySizes())
            toast({ title: t('sizes.resetDone'), description: t('sizes.resetBody') })
          }}
        >
          {t('sizes.reset')}
        </Button>
      }
      back={<Back to="/settings/quality">{t('backQuality')}</Back>}
      query={data}
      what={t('sizes.what')}
    >
      {(rows) => (
        <SizeTable
          // a fresh draft when the saved sizes change, or on Reset
          key={JSON.stringify([rows, reset])}
          loaded={rows}
          initial={reset ?? rows}
          onSaved={() => {
            setReset(null)
            data.refetch()
          }}
          onDiscard={() => setReset(null)}
        />
      )}
    </EditorPage>
  )
}

function SizeTable({
  loaded,
  initial,
  onSaved,
  onDiscard,
}: {
  loaded: QualitySize[]
  initial: QualitySize[]
  onSaved: () => void
  onDiscard: () => void
}) {
  const t = useT(messages)
  const [rows, setRows] = useState(initial)
  const [minutes, setMinutes] = useState(120)
  const save = useAction((c, body: QualitySize[]) => c.settings.saveQualitySizes({ body }))
  const dirty = JSON.stringify(rows) !== JSON.stringify(loaded)
  const errors = rows.map((r) => {
    const c = qualitySizeSchema.safeParse(r)
    return c.success ? null : (c.error.issues[0]?.message ?? t('sizes.rowInvalid'))
  })
  const onSave = () => {
    const at = errors.findIndex(Boolean)
    if (at >= 0)
      return toast.error(t('sizes.check'), {
        description: `${rows[at]?.quality}: ${errors[at]}`,
      })
    save.run(rows).then(
      () => {
        toast.success(t('sizes.saved'))
        onSaved()
      },
      (e: Error) => toast.error(t('sizes.saveError'), { description: e.message }),
    )
  }
  return (
    <>
      <Group title={t('sizes.group')} description={t('sizes.groupDescription')}>
        <Field label={t('sizes.minutes')} hint={t('sizes.minutesHint')} className="max-w-60">
          <Input
            type="number"
            min={1}
            max={600}
            value={minutes}
            onChange={(e) => setMinutes(Math.max(1, whole(e.target.value, minutes)))}
            className="font-mono"
          />
        </Field>
        <TableFrame>
          <Table aria-label={t('sizes.group')}>
            <TableHeader>
              <TableRow>
                <TableHead>{t('sizes.quality')}</TableHead>
                <TableHead numeric>{t('sizes.min')}</TableHead>
                <TableHead numeric>{t('sizes.preferred')}</TableHead>
                <TableHead numeric>{t('sizes.max')}</TableHead>
                <TableHead numeric>{t('sizes.film', { minutes })}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((q, i) => {
                const cell = (key: 'min' | 'preferred' | 'max') => (
                  <TableCell numeric>
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      aria-label={t(`sizes.cell.${key}`, { quality: q.quality })}
                      aria-invalid={errors[i] ? true : undefined}
                      value={q[key] ?? ''}
                      placeholder={key === 'min' ? '0' : t('sizes.noLimit')}
                      onChange={(e) => {
                        const v = e.target.value
                        const n = Number(v)
                        if (v !== '' && (!Number.isFinite(n) || n < 0)) return
                        setRows(
                          rows.map((r, j) =>
                            j === i
                              ? { ...r, [key]: v === '' ? (key === 'min' ? 0 : null) : n }
                              : r,
                          ),
                        )
                      }}
                      className="ms-auto w-24 text-end font-mono"
                    />
                  </TableCell>
                )
                return (
                  <TableRow key={q.quality}>
                    <TableCell className="text-text">
                      {q.quality}
                      {errors[i] && (
                        <span role="alert" className="block text-badge-danger text-caption">
                          {errors[i]}
                        </span>
                      )}
                    </TableCell>
                    {cell('min')}
                    {cell('preferred')}
                    {cell('max')}
                    <TableCell numeric className="whitespace-nowrap text-text-2">
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
        saving={save.pending}
        onSave={onSave}
        onDiscard={() => {
          setRows(loaded)
          onDiscard()
        }}
      />
    </>
  )
}

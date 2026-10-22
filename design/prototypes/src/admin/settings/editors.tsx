// SPDX-License-Identifier: AGPL-3.0-only
// The profile, format and size editors (checkpoint 8a's prototype, built in 8c; the plan's question
// 9): what the owner reviews before the server's Settings › Profiles and Quality stop being
// read-only. Each edits @highsea/quality's real shapes, as the Servarr wiki describes them:
// - a quality profile (https://wiki.servarr.com/radarr/settings#quality-profiles): the qualities
//   highest first, "qualities within the same group are equal", only ticked ones wanted; the cutoff
//   ("Upgrade Until"); the format scores, with a minimum, a score to stop upgrading at and the least
//   gain that counts (TRaSH's `minUpgradeFormatScore`, https://trash-guides.info/Radarr/radarr-setup-quality-profiles/);
// - a custom format (https://wiki.servarr.com/radarr/settings#custom-format-conditions): conditions
//   of one kind are alternatives, different kinds must all hold, a required one must hold on its
//   own, and negate inverts one. The test box runs a name through the real parser and matcher;
// - the size table (https://wiki.servarr.com/radarr/settings#quality): MB per minute of runtime,
//   with an empty preferred size or maximum meaning no limit, as TRaSH's defaults leave them.
// Each is a draft with the save bar, like every settings page (settings.md › Decisions).

import { bytes } from '@highsea/core/format'
import { parse } from '@highsea/parser'
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
  MIB,
  MODIFIERS,
  matchesFormat,
  type ProfileItem,
  type QualityProfile,
  qualityOf,
  qualityProfileSchema,
  qualitySizeSchema,
  RESOLUTIONS,
  SOURCES,
  validateFormat,
} from '@highsea/quality/browser'
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
} from '@highsea/ui-web'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'wouter'
import { useAction, useQuery } from '../../mock/hooks.tsx'
import { AdminPage, adminHref } from '../shell.tsx'
import { Group, SaveBar, useSettingsDraft } from './settings.tsx'

// ---------------------------------------------------------------- shared

/** A draft of `loaded`: kept once it arrives, dirty while it differs. */
function useDraft<T>(loaded: T | undefined) {
  const [draft, setDraft] = useState<T | null>(null)
  useEffect(() => {
    if (loaded !== undefined) setDraft((d) => d ?? loaded)
  }, [loaded])
  return {
    draft,
    setDraft,
    dirty: draft !== null && JSON.stringify(draft) !== JSON.stringify(loaded),
    discard: () => loaded !== undefined && setDraft(loaded),
  }
}

/** The way back to Settings › Profiles and formats (or Quality), above the editor. */
function Back({ to, children }: { to: string; children: ReactNode }) {
  return (
    <a
      href={adminHref(to)}
      className="flex items-center gap-1 justify-self-start rounded-sm text-text-2 text-ui outline-none hover:text-text focus-visible:ring-focus"
    >
      <Icon name="chevron-left" size={16} />
      {children}
    </a>
  )
}

function Missing({ what, back }: { what: string; back: string }) {
  const [, navigate] = useLocation()
  return (
    <EmptyState
      icon="search"
      title={`There’s no ${what} here`}
      action={<Button onClick={() => navigate(back)}>Profiles and formats</Button>}
    >
      It may have been deleted.
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

const languageOptions = LANGUAGES.map((code) => ({ value: code, label: languageName(code) }))

// ---------------------------------------------------------------- quality profile

const newId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 8)}`

/** A new profile: TRaSH's HD Bluray + WEB order, every other quality listed but not wanted. */
const blankProfile = (): QualityProfile => ({
  id: newId('qp'),
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

/** The editor's address: `/settings/profiles/{id}`, or `/settings/profiles/new`. */
export function ProfileEditor({ id }: { id: string }) {
  const profiles = useQuery('settings:profiles', (c) => c.movies.qualityProfiles(), [
    'settings.updated',
  ])
  const formats = useQuery('settings:formats', (c) => c.movies.customFormats(), [
    'settings.updated',
  ])
  const [blank] = useState(blankProfile)
  const isNew = id === 'new'
  const loaded = isNew ? blank : profiles.data?.find((p) => p.id === id)
  const title = isNew ? 'New profile' : loaded ? `Edit ${loaded.name}` : 'Edit profile'
  return (
    <AdminPage
      title={title}
      description="What to download for a movie, and when to stop upgrading."
      actions={!isNew && loaded ? <DeleteProfile profile={loaded} /> : undefined}
    >
      <div className="grid min-w-0 max-w-240 content-start gap-6">
        <Back to="/settings/profiles">Profiles and formats</Back>
        {profiles.status === 'error' ? (
          <p className="text-badge-danger text-ui">
            Couldn’t load the profile. {profiles.error.message}
          </p>
        ) : profiles.status === 'loading' ? (
          <p aria-busy className="text-caption text-text-3">
            Loading…
          </p>
        ) : !loaded ? (
          <Missing what="profile" back="/settings/profiles" />
        ) : (
          <ProfileForm key={loaded.id} loaded={loaded} isNew={isNew} formats={formats.data ?? []} />
        )}
      </div>
    </AdminPage>
  )
}

function DeleteProfile({ profile }: { profile: QualityProfile }) {
  const [, navigate] = useLocation()
  const remove = useAction((c, id: string) => c.movies.deleteQualityProfile(id))
  return (
    <ConfirmDialog
      trigger={
        <Button variant="danger" icon="delete">
          Delete
        </Button>
      }
      title={`Delete ${profile.name}?`}
      description="Movies can’t use it once it’s gone. A profile a movie still uses can’t be deleted."
      confirmLabel="Delete profile"
      destructive
      onConfirm={() =>
        remove.run(profile.id).then(
          () => {
            toast.success(`${profile.name} deleted`)
            navigate('/settings/profiles')
          },
          (e: Error) => toast.error('Couldn’t delete the profile', { description: e.message }),
        )
      }
    />
  )
}

function ProfileForm({
  loaded,
  isNew,
  formats,
}: {
  loaded: QualityProfile
  isNew: boolean
  formats: CustomFormat[]
}) {
  const [, navigate] = useLocation()
  const { draft, setDraft, dirty, discard } = useDraft(loaded)
  const save = useAction((c, p: QualityProfile) => c.movies.saveQualityProfile(p))
  if (!draft) return null
  const p = draft
  const set = (patch: Partial<QualityProfile>) => setDraft({ ...p, ...patch })

  const check = qualityProfileSchema.safeParse(p)
  const issues = check.success ? [] : check.error.issues
  const issueAt = (field: string) => issues.find((i) => i.path[0] === field)?.message
  const nameError = p.name.trim() === '' ? 'Give the profile a name.' : undefined
  const cutoffError = issueAt('cutoff')
    ? 'The cutoff has to be a quality the profile wants.'
    : undefined
  const other = issues.filter((i) => i.path[0] !== 'cutoff' && i.path[0] !== 'name')

  const onSave = () => {
    if (nameError || cutoffError || other.length > 0) {
      toast.error('Check the profile', {
        description: nameError ?? cutoffError ?? other[0]?.message,
      })
      return
    }
    save.run({ ...p, formats: p.formats.filter((f) => f.score !== 0) }).then(
      (saved) => {
        setDraft(saved)
        toast.success(`${saved.name} saved`)
        if (isNew) navigate(`/settings/profiles/${saved.id}`)
      },
      (e: Error) => toast.error('Couldn’t save the profile', { description: e.message }),
    )
  }

  const allowed = p.items.filter((i) => i.allowed)
  return (
    <>
      <Group title="Profile">
        <div className="grid items-start gap-4 medium:grid-cols-2">
          <Field label="Name" error={dirty || !isNew ? nameError : undefined}>
            <Input value={p.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field
            label="Language"
            hint="Releases in another language are rejected. A MULTi release counts as the movie’s original language too."
          >
            <Select
              value={p.language}
              onValueChange={(language) => set({ language })}
              options={[
                { value: 'any', label: 'Any language' },
                { value: 'original', label: 'The movie’s original language' },
                ...languageOptions,
              ]}
            />
          </Field>
        </div>
      </Group>
      <Qualities profile={p} set={set} />
      <Group
        title="Upgrades"
        description="When a movie has a file, highsea keeps looking for a better one until it reaches the cutoff."
      >
        <Field
          inline
          label="Upgrade files"
          hint="Off: the first file that fits is kept, whatever turns up later."
        >
          <Switch
            checked={p.upgradeAllowed}
            onCheckedChange={(upgradeAllowed) => set({ upgradeAllowed })}
          />
        </Field>
        <div className="grid items-start gap-4 medium:grid-cols-2">
          <Field
            label="Upgrade until"
            hint="A file at this quality or higher in the list isn’t upgraded for quality."
            error={cutoffError}
          >
            <Select
              value={p.cutoff}
              onValueChange={(cutoff) => set({ cutoff })}
              disabled={!p.upgradeAllowed}
              options={allowed.map((i) => ({ value: i.name, label: i.name }))}
            />
          </Field>
          <Field
            label="Upgrade until format score"
            hint="Once a file’s format score reaches this, upgrades for score stop."
          >
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
          <Field label="Minimum format score" hint="A release scoring less is rejected.">
            <Input
              type="number"
              value={p.minFormatScore}
              onChange={(e) => set({ minFormatScore: whole(e.target.value, p.minFormatScore) })}
              className="font-mono"
            />
          </Field>
          <Field
            label="Least score gain for an upgrade"
            hint="A release has to beat the file’s score by at least this much."
          >
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
        <Banner tone="danger" title="This profile can’t be saved yet">
          {other.map((i) => i.message).join('. ')}.
        </Banner>
      )}
      {(dirty || isNew) && (
        <SaveBar
          dirty
          saving={save.pending}
          onSave={onSave}
          onDiscard={isNew ? () => navigate('/settings/profiles') : discard}
        />
      )}
    </>
  )
}

/** A group is an item with more than one quality; its name is the owner's. */
const isGroup = (i: ProfileItem) => i.qualities.length > 1
/** Each item's first quality is unique across the profile, so it keys the row while a group is renamed. */
const itemKey = (i: ProfileItem) => i.qualities[0] ?? i.name

function Qualities({
  profile: p,
  set,
}: {
  profile: QualityProfile
  set: (patch: Partial<QualityProfile>) => void
}) {
  const replaceAt = (at: number, next: ProfileItem[], cutoff = p.cutoff) =>
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
    <Group
      title="Qualities"
      description="Higher in the list is preferred. Qualities in a group are equal. Only ticked qualities are downloaded."
    >
      <SortableList
        aria-label="Qualities, most preferred first"
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
                aria-label={`Download ${it.name}`}
                checked={it.allowed}
                onCheckedChange={(v) => replaceAt(at, [{ ...it, allowed: v === true }])}
              />
              <div className="grid min-w-0 flex-1 gap-0.5">
                {group ? (
                  <Input
                    aria-label={`Name of the group with ${it.qualities.join(', ')}`}
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
                    Equal: {it.qualities.join(' · ')}
                  </span>
                )}
              </div>
              {p.upgradeAllowed && p.cutoff === it.name && <Badge tone="accent">Cutoff</Badge>}
              <Menu>
                <MenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    iconOnly
                    icon="more"
                    aria-label={`More for ${it.name}`}
                  />
                </MenuTrigger>
                <MenuContent>
                  <MenuItem
                    icon="add"
                    disabled={at === p.items.length - 1}
                    onSelect={() => groupWithNext(at)}
                  >
                    Group with the one below
                  </MenuItem>
                  {group && (
                    <MenuItem icon="remove" onSelect={() => ungroup(at)}>
                      Ungroup
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
  profile: QualityProfile
  formats: CustomFormat[]
  set: (patch: Partial<QualityProfile>) => void
}) {
  const scoreOf = (id: string) => p.formats.find((f) => f.formatId === id)?.score ?? 0
  const setScore = (formatId: string, score: number) =>
    set({
      formats: p.formats.some((f) => f.formatId === formatId)
        ? p.formats.map((f) => (f.formatId === formatId ? { formatId, score } : f))
        : [...p.formats, { formatId, score }],
    })
  return (
    <Group
      title="Custom format scores"
      description="A release’s score is the sum of the formats it matches. Unscored formats count 0."
    >
      {formats.length === 0 ? (
        <p className="text-caption text-text-3">There are no custom formats yet.</p>
      ) : (
        <TableFrame>
          <Table aria-label="Custom format scores">
            <TableHeader>
              <TableRow>
                <TableHead>Format</TableHead>
                <TableHead>Matches</TableHead>
                <TableHead numeric>Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {formats.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="text-text">
                    <a
                      href={adminHref(`/settings/profiles/formats/${f.id}`)}
                      className="hover:underline"
                    >
                      {f.name}
                    </a>
                  </TableCell>
                  <TableCell className="whitespace-normal break-words font-mono text-figure text-text-2">
                    {describeFormat(f).join(' · ')}
                  </TableCell>
                  <TableCell numeric>
                    <Input
                      type="number"
                      aria-label={`${f.name}: score`}
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
        <a href={adminHref('/settings/profiles/formats/new')}>New format</a>
      </Button>
    </Group>
  )
}

// ---------------------------------------------------------------- custom format

const KIND_LABELS: Record<ConditionKind, string> = {
  title: 'Release title',
  edition: 'Edition',
  releaseGroup: 'Release group',
  language: 'Language',
  indexerFlag: 'Indexer flag',
  source: 'Source',
  resolution: 'Resolution',
  modifier: 'Modifier',
  size: 'Size',
  year: 'Year',
}

const SOURCE_LABELS: Record<(typeof SOURCES)[number], string> = {
  unknown: 'Unknown',
  cam: 'CAM',
  telesync: 'TELESYNC',
  telecine: 'TELECINE',
  workprint: 'WORKPRINT',
  dvd: 'DVD',
  tv: 'TV',
  webdl: 'WEB-DL',
  webrip: 'WEBRip',
  bluray: 'Blu-ray',
}

const MODIFIER_LABELS: Record<(typeof MODIFIERS)[number], string> = {
  none: 'None',
  regional: 'Regional',
  screener: 'Screener',
  rawhd: 'Raw HD',
  brdisk: 'BR-DISK',
  remux: 'Remux',
}

const FLAG_LABELS: Record<IndexerFlag, string> = {
  freeleech: 'Freeleech',
  halfleech: 'Halfleech',
  doubleUpload: 'Double upload',
  golden: 'Golden',
  approved: 'Approved',
  internal: 'Internal',
  scene: 'Scene',
  freeleech75: 'Freeleech 75%',
  freeleech25: 'Freeleech 25%',
}

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

const blankFormat = (): CustomFormat => ({
  id: newId('cf'),
  name: '',
  source: 'custom',
  trashId: null,
  conditions: [conditionOf('title')],
})

/** The editor's address: `/settings/profiles/formats/{id}`, or `…/formats/new`. */
export function FormatEditor({ id }: { id: string }) {
  const formats = useQuery('settings:formats', (c) => c.movies.customFormats(), [
    'settings.updated',
  ])
  const [blank] = useState(blankFormat)
  const isNew = id === 'new'
  const loaded = isNew ? blank : formats.data?.find((f) => f.id === id)
  const title = isNew ? 'New custom format' : loaded ? `Edit ${loaded.name}` : 'Edit format'
  return (
    <AdminPage
      title={title}
      description="A set of conditions a release name matches or doesn’t. Each profile scores it."
      actions={!isNew && loaded ? <DeleteFormat format={loaded} /> : undefined}
    >
      <div className="grid min-w-0 max-w-240 content-start gap-6">
        <Back to="/settings/profiles">Profiles and formats</Back>
        {formats.status === 'error' ? (
          <p className="text-badge-danger text-ui">
            Couldn’t load the format. {formats.error.message}
          </p>
        ) : formats.status === 'loading' ? (
          <p aria-busy className="text-caption text-text-3">
            Loading…
          </p>
        ) : !loaded ? (
          <Missing what="format" back="/settings/profiles" />
        ) : (
          <FormatForm key={loaded.id} loaded={loaded} isNew={isNew} />
        )}
      </div>
    </AdminPage>
  )
}

function DeleteFormat({ format }: { format: CustomFormat }) {
  const [, navigate] = useLocation()
  const remove = useAction((c, id: string) => c.movies.deleteCustomFormat(id))
  return (
    <ConfirmDialog
      trigger={
        <Button variant="danger" icon="delete">
          Delete
        </Button>
      }
      title={`Delete ${format.name}?`}
      description="Its scores go from every profile, so releases that matched it may rank differently."
      confirmLabel="Delete format"
      destructive
      onConfirm={() =>
        remove.run(format.id).then(
          () => {
            toast.success(`${format.name} deleted`)
            navigate('/settings/profiles')
          },
          (e: Error) => toast.error('Couldn’t delete the format', { description: e.message }),
        )
      }
    />
  )
}

function FormatForm({ loaded, isNew }: { loaded: CustomFormat; isNew: boolean }) {
  const [, navigate] = useLocation()
  const { draft, setDraft, dirty, discard } = useDraft(loaded)
  const save = useAction((c, f: CustomFormat) => c.movies.saveCustomFormat(f))
  if (!draft) return null
  const f = draft
  const set = (patch: Partial<CustomFormat>) => setDraft({ ...f, ...patch })
  const setAt = (at: number, c: Condition) =>
    set({ conditions: f.conditions.map((x, i) => (i === at ? c : x)) })

  const issues = validateFormat(f)
  const blankPattern = (c: Condition) =>
    (c.kind === 'title' || c.kind === 'edition' || c.kind === 'releaseGroup') && c.value === ''
  const issueFor = (at: number) => {
    const c = f.conditions[at]
    if (c && blankPattern(c)) return 'Enter a pattern to match.'
    return issues.find((i) => i.condition === at)?.message
  }
  const nameError = f.name.trim() === '' ? 'Give the format a name.' : undefined
  const general = issues.find((i) => i.condition === null)?.message

  const onSave = () => {
    const first =
      nameError ?? general ?? f.conditions.map((_, i) => issueFor(i)).find(Boolean) ?? null
    if (first) {
      toast.error('Check the format', { description: first })
      return
    }
    save.run(f).then(
      (saved) => {
        setDraft(saved)
        toast.success(`${saved.name} saved`)
        if (isNew) navigate(`/settings/profiles/formats/${saved.id}`)
      },
      (e: Error) => toast.error('Couldn’t save the format', { description: e.message }),
    )
  }

  return (
    <>
      <Group title="Format">
        <Field label="Name" error={dirty || !isNew ? nameError : undefined}>
          <Input value={f.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        {f.source === 'preset' && (
          <p className="text-caption text-text-3">
            From the catalog (TRaSH Guides). Saving a change makes it yours: the catalog’s updates
            leave it alone from then on.
          </p>
        )}
      </Group>
      <Group
        title="Conditions"
        description="Conditions of the same kind are alternatives: one of them has to match. Different kinds all have to match. A required condition has to match on its own."
      >
        {general && (
          <p role="alert" className="text-badge-danger text-ui">
            {general}
          </p>
        )}
        <ol aria-label="Conditions" className="grid gap-2">
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
          Add a condition
        </Button>
      </Group>
      <FormatTest format={f} />
      {(dirty || isNew) && (
        <SaveBar
          dirty
          saving={save.pending}
          onSave={onSave}
          onDiscard={isNew ? () => navigate('/settings/profiles') : discard}
        />
      )}
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
  const n = index + 1
  return (
    <>
      <div className="grid gap-3 medium:grid-cols-[12rem_minmax(0,1fr)_auto] medium:items-end">
        <Field label={`Condition ${n}`}>
          <Select
            value={c.kind}
            onValueChange={(kind) => onChange(conditionOf(kind as ConditionKind, c))}
            options={CONDITION_KINDS.map((k) => ({ value: k, label: KIND_LABELS[k] }))}
          />
        </Field>
        <ConditionValue condition={c} index={n} error={error} onChange={onChange} />
        <Button
          size="sm"
          variant="ghost"
          iconOnly
          icon="delete"
          aria-label={`Remove condition ${n}`}
          onClick={onRemove}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Field inline label="Not" hint="Matches when this doesn’t.">
          <Checkbox
            checked={c.negate}
            onCheckedChange={(v) => onChange({ ...c, negate: v === true })}
          />
        </Field>
        <Field inline label="Required" hint="Has to match, whatever the others of its kind do.">
          <Checkbox
            checked={c.required}
            onCheckedChange={(v) => onChange({ ...c, required: v === true })}
          />
        </Field>
        <span className="ms-auto font-mono text-figure text-text-3">
          {error ? '' : describeCondition(c)}
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
  switch (c.kind) {
    case 'title':
    case 'edition':
    case 'releaseGroup':
      return (
        <Field label="Matches" hint="A regular expression, case-insensitive." error={error}>
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
          <Field label="Language">
            <Select
              value={c.value.language}
              onValueChange={(language) => onChange({ ...c, value: { ...c.value, language } })}
              options={[
                { value: 'original', label: 'The movie’s original language' },
                ...languageOptions,
              ]}
            />
          </Field>
          <Field inline label="Any other language">
            <Checkbox
              checked={c.value.except}
              onCheckedChange={(v) => onChange({ ...c, value: { ...c.value, except: v === true } })}
            />
          </Field>
        </div>
      )
    case 'indexerFlag':
      return (
        <Field label="Flag">
          <Select
            value={c.value}
            onValueChange={(v) => onChange({ ...c, value: v as IndexerFlag })}
            options={INDEXER_FLAGS.map((x) => ({ value: x, label: FLAG_LABELS[x] }))}
          />
        </Field>
      )
    case 'source':
      return (
        <Field label="Source">
          <Select
            value={c.value}
            onValueChange={(v) => onChange({ ...c, value: v as (typeof SOURCES)[number] })}
            options={SOURCES.map((x) => ({ value: x, label: SOURCE_LABELS[x] }))}
          />
        </Field>
      )
    case 'resolution':
      return (
        <Field label="Resolution">
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
        <Field label="Modifier">
          <Select
            value={c.value}
            onValueChange={(v) => onChange({ ...c, value: v as (typeof MODIFIERS)[number] })}
            options={MODIFIERS.map((x) => ({ value: x, label: MODIFIER_LABELS[x] }))}
          />
        </Field>
      )
    case 'size':
    case 'year': {
      const unit = c.kind === 'size' ? ' (GB)' : ''
      const end = (key: 'min' | 'max', label: string) => (
        <Field label={`${label}${unit}`} error={key === 'max' ? error : undefined}>
          <Input
            type="number"
            min={0}
            aria-label={`Condition ${index}: ${label.toLowerCase()}${unit}`}
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
      return (
        <div className="grid grid-cols-2 gap-3">
          {end('min', 'From')}
          {end('max', 'To')}
        </div>
      )
    }
  }
}

/** A release name through the parser and the format, as a search would judge it. */
function FormatTest({ format }: { format: CustomFormat }) {
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
    <Group
      title="Try a release name"
      description="Runs it through the parser and this format as it stands, saved or not."
    >
      <div className="grid gap-4 medium:grid-cols-[minmax(0,1fr)_10rem]">
        <Field label="Release name">
          <Input value={name} onChange={(e) => setName(e.target.value)} className="font-mono" />
        </Field>
        <Field label="Size (GB)" hint="Optional.">
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
              {matched ? 'Matches' : 'Doesn’t match'}
            </Badge>
            <span className="text-text-2">
              Read as {qualityOf(release.quality)}
              {release.releaseGroup ? `, group ${release.releaseGroup}` : ''}
              {release.edition ? `, ${release.edition}` : ''}
              {release.languages.length
                ? `, in ${release.languages.map((l) => languageName(l)).join(' and ')}`
                : ''}
            </span>
          </p>
          <ul aria-label="Each condition" className="grid gap-1">
            {format.conditions.map((c, i) => {
              const holds = conditionHolds(c, input)
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: conditions have no ids
                <li key={i} className="flex items-center gap-2 text-caption">
                  <Badge tone={holds ? 'success' : 'neutral'}>{holds ? 'Yes' : 'No'}</Badge>
                  <span className="font-mono text-text-2">
                    {c.kind === 'title' && c.value === ''
                      ? KIND_LABELS.title
                      : describeCondition(c)}
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
  const s = useSettingsDraft('qualitySizes')
  const [minutes, setMinutes] = useState(120)
  return (
    <AdminPage
      title="Edit sizes"
      description="How large a release may be for its quality, per minute of the movie’s runtime."
      actions={
        <Button
          variant="secondary"
          icon="replay"
          disabled={!s.draft}
          onClick={() => {
            s.replace(defaultQualitySizes())
            toast({ title: 'Reset to TRaSH’s sizes', description: 'Save to keep them.' })
          }}
        >
          Reset to TRaSH’s sizes
        </Button>
      }
    >
      <div className="grid min-w-0 max-w-240 content-start gap-6">
        <Back to="/settings/quality">Quality</Back>
        {s.query.status === 'error' ? (
          <p className="text-badge-danger text-ui">
            Couldn’t load the sizes. {s.query.error.message}
          </p>
        ) : !s.draft ? (
          <p aria-busy className="text-caption text-text-3">
            Loading…
          </p>
        ) : (
          <SizeTable
            rows={s.draft}
            minutes={minutes}
            setMinutes={setMinutes}
            replace={s.replace}
            save={() => s.save()}
            saving={s.saving}
            dirty={s.dirty}
            discard={s.discard}
          />
        )}
      </div>
    </AdminPage>
  )
}

type SizeRow = ReturnType<typeof defaultQualitySizes>[number]

function SizeTable({
  rows,
  minutes,
  setMinutes,
  replace,
  save,
  saving,
  dirty,
  discard,
}: {
  rows: SizeRow[]
  minutes: number
  setMinutes: (m: number) => void
  replace: (rows: SizeRow[]) => void
  save: () => Promise<unknown>
  saving: boolean
  dirty: boolean
  discard: () => void
}) {
  const errors = rows.map((r) => {
    const c = qualitySizeSchema.safeParse(r)
    return c.success ? null : (c.error.issues[0]?.message ?? 'Check this row')
  })
  const onSave = () => {
    const at = errors.findIndex(Boolean)
    if (at >= 0) {
      toast.error('Check the sizes', { description: `${rows[at]?.quality}: ${errors[at]}` })
      return
    }
    save().then(
      () => toast.success('Sizes saved'),
      (e: Error) => toast.error('Couldn’t save', { description: e.message }),
    )
  }
  return (
    <>
      <Group
        title="Sizes per minute of runtime"
        description="In MB per minute. A release outside the range is rejected; nearer the preferred size wins a tie. Leave the preferred size or the maximum empty for no limit."
      >
        <Field
          label="Show sizes for a film of"
          hint="Minutes. A movie whose runtime isn’t known is taken as 110."
          className="max-w-60"
        >
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
          <Table aria-label="Sizes per minute of runtime">
            <TableHeader>
              <TableRow>
                <TableHead>Quality</TableHead>
                <TableHead numeric>Min</TableHead>
                <TableHead numeric>Preferred</TableHead>
                <TableHead numeric>Max</TableHead>
                <TableHead numeric>{`A ${minutes}-minute film`}</TableHead>
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
                      aria-label={`${q.quality}: ${key === 'min' ? 'minimum' : key === 'max' ? 'maximum' : 'preferred'} MB per minute`}
                      aria-invalid={errors[i] ? true : undefined}
                      value={q[key] ?? ''}
                      placeholder={key === 'min' ? '0' : 'No limit'}
                      onChange={(e) => {
                        const v = e.target.value
                        const n = Number(v)
                        if (v !== '' && (!Number.isFinite(n) || n < 0)) return
                        replace(
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
                          ? 'Any size'
                          : `${filmSize(q.min, minutes)} or more`
                        : `${filmSize(q.min, minutes)} to ${filmSize(q.max, minutes)}`}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableFrame>
      </Group>
      <SaveBar dirty={dirty} saving={saving} onSave={onSave} onDiscard={discard} />
    </>
  )
}

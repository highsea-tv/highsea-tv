'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// A2 Setup wizard (docs/product/setup.md), ported from the prototype as install-simplicity B shrank
// it (4.3c). highsea fills in what it can find (`setup.detect`: the server's name, the folders under
// /data, the address apps use, the graphics chip; the browser's languages and time zone) and asks
// only for the owner; movie details come with highsea's own TMDB key. Folders become a step only
// when highsea found none. Review lists what highsea decided, and each line opens its own editor
// in place. What real data changed from the prototype: the starter pack lists only public starters
// that need no setting, so the "Needs an account" badge has nothing to mark; highsea knows 186
// subtitle languages, so the chips are the prototype's dozen and whatever is picked, and a select
// adds any other; the folder picker stops at the media root, as the server does. Progress is kept
// in the browser so a reload picks up where you left off, except the password and the TMDB key,
// which never go into storage (OWASP HTML5 Security Cheat Sheet: no sensitive data in
// localStorage). Drawn with the library's native renderer since D3 (one-client-platform-d.md):
// there's no <form>, so a step's Continue is its primary button and Enter in a field.
import type { SetupDetected, SetupInput } from '@highsea-tv/api-contract'
import { useT } from '@highsea-tv/i18n/react'
import type { ApiError } from '@highsea-tv/sdk'
import { useAction, useQuery } from '@highsea-tv/sdk/react'
import { breakpoints } from '@highsea-tv/tokens'
import {
  Banner,
  Button,
  Checkbox,
  Chip,
  Dialog,
  EmptyState,
  Field,
  Icon,
  Input,
  Lockup,
  Press,
  RadioMark,
  ScrollView,
  Select,
  Skeleton,
  Stepper,
  Text,
  Toaster,
  toast,
  tokens,
  useTheme,
  useWindowAtLeast,
} from '@highsea-tv/ui/native'
import { type ComponentRef, type ReactNode, useEffect, useRef, useState } from 'react'
import { useWindowDimensions, View } from 'react-native'
import { shell } from './messages.ts'
import { errorReason, keyRejected, metadataLocale, tmdbBusy } from './metadata-locale.ts'
import { useLoad } from './navigation.tsx'
import { setup as messages } from './setup-messages.ts'

const s = tokens.space
const ui = tokens.adminText.ui
const form = tokens.adminText.form
const mono = tokens.text.web.mono
/** The steps' column from expanded up (the web's 13rem), and the page's widest (max-w-240). */
const STEPS_WIDTH = 208
const PAGE_WIDTH = 960
/** The form's widest (the web's max-w-150). */
const FORM_WIDTH = 600
/** A Review line's label column from medium up (the web's 10rem). */
const LABEL_WIDTH = 160
/** The folder picker's list (the web's h-64), and a folder's row (h-9). */
const LIST_HEIGHT = 256
const ROW_HEIGHT = 36
/** Words that wrap anywhere (the web's [overflow-wrap:anywhere]), for paths and addresses. */
const ANYWHERE = { overflowWrap: 'anywhere' } as object

type StepId = 'owner' | 'folders' | 'review'

/** Folders are a step only when highsea found none. */
const stepsFor = (found: SetupDetected): StepId[] => [
  'owner',
  ...(found.folders ? [] : (['folders'] as const)),
  'review',
]

type Remote = SetupInput['remoteAccess']['kind']

type Draft = {
  serverName: string
  owner: { displayName: string; username: string; password: string; confirm: string }
  folders: { movies: string; downloads: string }
  /** The owner's own TMDB key, as typed. Never stored. */
  metadataKey: string
  /** Starter-pack definition ids to add at Finish. */
  indexers: string[]
  /** Codes, in order: the first is preferred. */
  subtitleLanguages: string[]
  timeZone: string
  address: string
  remote: Remote
  proxyUrl: string
  port: string
}

/** The Review lines with an editor; one the owner changed loses its "from this browser" note. */
type Line = 'folders' | 'metadata' | 'indexers' | 'subtitles' | 'timeZone' | 'address' | 'remote'

type Saved = {
  step: StepId
  reached: number
  draft: Draft
  /** The detected defaults have been filled in, once. */
  seeded: boolean
  changed: Line[]
}

const blank: Draft = {
  serverName: '',
  owner: { displayName: '', username: '', password: '', confirm: '' },
  folders: { movies: '', downloads: '' },
  metadataKey: '',
  indexers: [],
  subtitleLanguages: [],
  timeZone: '',
  address: '',
  remote: 'local-only',
  proxyUrl: '',
  port: '8484',
}

const fresh = (): Saved => ({ step: 'owner', reached: 0, draft: blank, seeded: false, changed: [] })
const storageKey = 'highsea:setup'

function load(): Saved | null {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return null
    const kept = JSON.parse(raw) as Saved
    // a draft from before 4.3c's setup has numbered steps: start again
    if (typeof kept.step !== 'string') return null
    return {
      ...kept,
      draft: { ...blank, ...kept.draft, owner: { ...blank.owner, ...kept.draft.owner } },
    }
  } catch {
    return null
  }
}

function persist(saved: Saved | null) {
  try {
    if (!saved) return localStorage.removeItem(storageKey)
    const { password: _, confirm: __, ...owner } = saved.draft.owner
    const { metadataKey: ___, ...draft } = saved.draft
    localStorage.setItem(storageKey, JSON.stringify({ ...saved, draft: { ...draft, owner } }))
  } catch {
    // private mode: progress just isn't remembered
  }
}

// ---------------------------------------------------------------- what the browser knows

const browserZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

const allZones = (current: string) => {
  let zones: string[] = []
  try {
    zones = Intl.supportedValuesOf('timeZone')
  } catch {
    // an older browser: the detected zone alone
  }
  return zones.includes(current) ? zones : [current, ...zones]
}

/** The browser's languages that highsea has subtitles in, in the browser's order. */
function browserLanguages(available: { code: string }[]): string[] {
  const codes = (typeof navigator === 'undefined' ? [] : (navigator.languages ?? []))
    .map((l) => l.split('-')[0]?.toLowerCase() ?? '')
    .filter((c, i, all) => c && all.indexOf(c) === i && available.some((l) => l.code === c))
  return codes.length ? codes : ['en']
}

// ---------------------------------------------------------------- checks

type Errors = Partial<Record<string, string>>
type T = ReturnType<typeof useT<typeof messages>>

function ownerErrors(d: Draft, t: T): Errors {
  const e: Errors = {}
  if (!d.owner.displayName.trim()) e.displayName = t('owner.nameMissing')
  if (!/^[a-z0-9._-]{2,32}$/.test(d.owner.username)) e.username = t('owner.usernameInvalid')
  if (d.owner.password.length < 10) e.password = t('owner.short')
  else if (d.owner.confirm !== d.owner.password) e.confirm = t('owner.mismatch')
  if (!d.serverName.trim()) e.serverName = t('owner.serverNameMissing')
  return e
}

function folderErrors(d: Draft, t: T): Errors {
  const e: Errors = {}
  if (!d.folders.movies) e.movies = t('folders.moviesMissing')
  if (!d.folders.downloads) e.downloads = t('folders.downloadsMissing')
  if (d.folders.movies && d.folders.movies === d.folders.downloads) e.downloads = t('folders.same')
  return e
}

/** The checks behind each Review line's Done, and Finish. */
function lineErrors(line: Line, d: Draft, t: T): Errors {
  const e: Errors = {}
  if (line === 'folders') return folderErrors(d, t)
  if (line === 'subtitles' && d.subtitleLanguages.length === 0) e.languages = t('subtitles.missing')
  if (line === 'address' && !/^[^\s/]+(:\d{1,5})?$/.test(d.address.trim()))
    e.address = t('review.addressInvalid')
  if (line === 'remote') {
    if (d.remote === 'reverse-proxy' && !/^https:\/\/[^\s/]+/.test(d.proxyUrl))
      e.proxyUrl = t('remote.addressInvalid')
    const port = Number(d.port)
    if (d.remote === 'port-forward' && !(Number.isInteger(port) && port >= 1024 && port <= 65535))
      e.port = t('remote.portInvalid')
  }
  return e
}

/** Where a field the server refused lives: a step, or a Review line, and the error's key. */
const FIELDS: Record<string, [StepId | Line, string]> = {
  serverName: ['owner', 'serverName'],
  displayName: ['owner', 'displayName'],
  username: ['owner', 'username'],
  password: ['owner', 'password'],
  'folders.movies': ['folders', 'movies'],
  'folders.downloads': ['folders', 'downloads'],
  subtitleLanguages: ['subtitles', 'languages'],
  timeZone: ['timeZone', 'timeZone'],
  address: ['address', 'address'],
  'remoteAccess.url': ['remote', 'proxyUrl'],
  'remoteAccess.port': ['remote', 'port'],
}

const toInput = (d: Draft): SetupInput => ({
  serverName: d.serverName.trim(),
  owner: {
    displayName: d.owner.displayName.trim(),
    username: d.owner.username,
    password: d.owner.password,
  },
  folders: d.folders,
  indexers: d.indexers,
  subtitleLanguages: d.subtitleLanguages,
  remoteAccess:
    d.remote === 'reverse-proxy'
      ? { kind: 'reverse-proxy', url: d.proxyUrl }
      : d.remote === 'port-forward'
        ? { kind: 'port-forward', port: Number(d.port) }
        : { kind: 'local-only' },
  cloudLink: false,
  // the owner's locale for the metadata language and region (decision 5), with their key if added
  metadata: {
    ...metadataLocale(typeof navigator === 'undefined' ? undefined : navigator.language),
    ...(d.metadataKey.trim() ? { key: d.metadataKey.trim() } : {}),
  },
  timeZone: d.timeZone,
  address: d.address.trim(),
})

// ---------------------------------------------------------------- the wizard

export function Setup() {
  const t = useT(messages)
  const detect = useQuery('setup-detect', (c) => c.setup.detect())
  const defaults = useQuery('setup-defaults', (c) => c.setup.defaults())
  const pack = useQuery('starter-pack', (c) => c.setup.starterPack())
  const languages = useQuery('setup-languages', (c) => c.setup.languages())
  const [saved, setSaved] = useState<Saved>(fresh)
  const [restored, setRestored] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  // the Review line whose editor is open
  const [open, setOpen] = useState<Line | null>(null)
  const heading = useRef<ComponentRef<typeof View>>(null)
  const tShell = useT(shell)
  const loadPage = useLoad()
  const theme = useTheme()
  const medium = useWindowAtLeast(breakpoints.medium)
  const expanded = useWindowAtLeast(breakpoints.expanded)
  const { height } = useWindowDimensions()
  const first = useRef(true)
  const complete = useAction((c, input: SetupInput) => c.setup.complete({ body: input }))
  const { step, reached, draft } = saved

  // what was kept, read once the page is in the browser
  useEffect(() => {
    const kept = load()
    if (kept) setSaved(kept)
    setRestored(true)
  }, [])
  useEffect(() => {
    if (restored) persist(saved)
  }, [saved, restored])

  // the detected defaults go in once, when the server and the lists have answered
  // biome-ignore lint/correctness/useExhaustiveDependencies: seeds once
  useEffect(() => {
    if (!restored || saved.seeded || detect.status !== 'success') return
    if (pack.status === 'loading' || languages.status === 'loading') return
    const found = detect.data
    setSaved((s) => ({
      ...s,
      seeded: true,
      draft: {
        ...s.draft,
        serverName: s.draft.serverName || (found.serverName ?? ''),
        folders: found.folders ?? s.draft.folders,
        indexers: pack.status === 'success' ? pack.data.map((d) => d.id) : [],
        subtitleLanguages:
          languages.status === 'success' ? browserLanguages(languages.data) : ['en'],
        timeZone: browserZone(),
        // a bridge network can't see the host's address, so the one this browser used is the best guess
        address: found.address ?? (typeof location === 'undefined' ? '' : location.host),
      },
    }))
  }, [restored, detect.status, pack.status, languages.status, saved.seeded])

  const steps = detect.status === 'success' ? stepsFor(detect.data) : (['owner'] as StepId[])
  const index = Math.max(0, steps.indexOf(step))
  const id = steps[index] ?? 'owner'

  // each step moves focus to its heading, so a screen reader hears where it is
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on step change
  useEffect(() => {
    if (first.current) first.current = false
    else heading.current?.focus()
  }, [id])

  const update = (patch: Partial<Draft>, line?: Line) =>
    setSaved((s) => ({
      ...s,
      draft: { ...s.draft, ...patch },
      changed: line && !s.changed.includes(line) ? [...s.changed, line] : s.changed,
    }))
  const go = (to: StepId) => {
    setErrors({})
    setOpen(null)
    const at = steps.indexOf(to)
    setSaved((s) => ({ ...s, step: to, reached: Math.max(s.reached, at) }))
  }
  /** A field the server or Finish found wrong: its step, or its Review line opened. */
  const show = (where: StepId | Line, found: Errors) => {
    if (where === 'owner' || (where === 'folders' && steps.includes('folders'))) {
      go(where)
      setErrors(found)
    } else {
      if (id !== 'review') go('review')
      setOpen(where as Line)
      setErrors(found)
    }
  }

  const next = async () => {
    if (complete.pending) return
    const found =
      id === 'owner' ? ownerErrors(draft, t) : id === 'folders' ? folderErrors(draft, t) : {}
    setErrors(found)
    if (Object.keys(found).length) return
    if (id !== 'review') return go(steps[index + 1] ?? 'review')
    // after a reload the password is gone: ask for it again
    const owner = ownerErrors(draft, t)
    if (Object.keys(owner).length)
      return show('owner', { ...owner, password: owner.password && t('owner.forgotten') })
    // an editor left wrong opens again with its message
    for (const line of ['folders', 'subtitles', 'address', 'remote'] as const) {
      const wrong = lineErrors(line, draft, t)
      if (Object.keys(wrong).length) return show(line, wrong)
    }
    try {
      const result = await complete.run(toInput(draft))
      persist(null)
      toast.success(t('ready', { name: result.server.name }), { description: t('readyBody') })
      // a fresh load: the server components see the owner's new session
      loadPage('/')
    } catch (err) {
      const reason = errorReason(err)
      if (keyRejected(reason) || tmdbBusy(reason))
        return show('metadata', {
          metadataKey: keyRejected(reason) ? t('review.keyRejected') : t('review.keyUnavailable'),
        })
      const field = ((err as ApiError).details as { field?: string } | undefined)?.field
      const at = field ? FIELDS[field] : undefined
      if (at) show(at[0], { [at[1]]: (err as Error).message })
      else toast.error(t('failed'), { description: (err as Error).message })
    }
  }

  const startOver = () => {
    setErrors({})
    setOpen(null)
    setSaved(fresh())
  }

  const root = defaults.data?.dataDir ?? '/'
  const body: Record<StepId, { title: string; detail: string; content: ReactNode }> = {
    owner: {
      title: t('owner.title'),
      detail: t('owner.detail'),
      content: (
        <>
          <Field label={t('owner.name')} error={errors.displayName}>
            <Input
              value={draft.owner.displayName}
              autoComplete="name"
              onChangeText={(displayName) => update({ owner: { ...draft.owner, displayName } })}
              onSubmitEditing={next}
            />
          </Field>
          <Field label={t('owner.username')} hint={t('owner.usernameHint')} error={errors.username}>
            <Input
              value={draft.owner.username}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              onChangeText={(username) =>
                update({ owner: { ...draft.owner, username: username.toLowerCase() } })
              }
              onSubmitEditing={next}
            />
          </Field>
          <View
            style={{
              flexDirection: medium ? 'row' : 'column',
              alignItems: 'flex-start',
              gap: s['4'],
            }}
          >
            <View style={medium ? { flex: 1, minWidth: 0 } : { alignSelf: 'stretch' }}>
              <Field
                label={t('owner.password')}
                hint={t('owner.passwordHint')}
                error={errors.password}
              >
                <Input
                  secureTextEntry
                  value={draft.owner.password}
                  autoComplete="new-password"
                  onChangeText={(password) => update({ owner: { ...draft.owner, password } })}
                  onSubmitEditing={next}
                />
              </Field>
            </View>
            <View style={medium ? { flex: 1, minWidth: 0 } : { alignSelf: 'stretch' }}>
              <Field label={t('owner.confirm')} error={errors.confirm}>
                <Input
                  secureTextEntry
                  value={draft.owner.confirm}
                  autoComplete="new-password"
                  onChangeText={(confirm) => update({ owner: { ...draft.owner, confirm } })}
                  onSubmitEditing={next}
                />
              </Field>
            </View>
          </View>
          <Field
            label={t('owner.serverName')}
            hint={detect.data?.serverName ? t('owner.serverNameFound') : t('owner.serverNameHint')}
            error={errors.serverName}
          >
            <Input
              value={draft.serverName}
              placeholder="Harbor"
              autoComplete="off"
              maxLength={60}
              onChangeText={(serverName) => update({ serverName })}
              onSubmitEditing={next}
            />
          </Field>
          {/* plain text: Settings › Migration opens only once setup has signed the owner in */}
          <Text variant="caption" color="text-3">
            {t('owner.later')}
          </Text>
        </>
      ),
    },
    folders: {
      title: t('folders.title'),
      detail: t('folders.detail'),
      content: (
        <Folders draft={draft} errors={errors} update={(p) => update(p, 'folders')} root={root} />
      ),
    },
    review: {
      title: t('review.title'),
      detail: t('review.detail'),
      content:
        detect.status === 'success' ? (
          <Review
            found={detect.data}
            saved={saved}
            steps={steps}
            open={open}
            errors={errors}
            root={root}
            onOpen={(line) => {
              setErrors({})
              setOpen(line)
            }}
            onDone={(line) => {
              const wrong = lineErrors(line, draft, t)
              setErrors(wrong)
              if (Object.keys(wrong).length === 0) setOpen(null)
            }}
            update={update}
            onStep={go}
          />
        ) : null,
    },
  }
  const current = body[id]
  const gutter = medium ? s['6'] : s['4']

  return (
    <View style={{ minHeight: height, backgroundColor: theme.colors.bg }}>
      <View
        style={{
          minHeight: 56,
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          columnGap: s['3'],
          rowGap: s['1'],
          paddingHorizontal: gutter,
          paddingVertical: s['2'],
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.line,
        }}
      >
        <Lockup size={17} />
        <Text variant="caption" color="text-3">
          {t('label')}
        </Text>
        <View style={{ flex: 1 }} />
        {(index > 0 || reached > 0) && (
          <Button variant="ghost" size="sm" icon="replay" onPress={startOver}>
            {t('startOver')}
          </Button>
        )}
      </View>
      <View
        style={{
          width: '100%',
          maxWidth: PAGE_WIDTH,
          alignSelf: 'center',
          flexDirection: expanded ? 'row' : 'column',
          alignItems: expanded ? 'flex-start' : 'stretch',
          gap: expanded ? s['10'] : s['6'],
          paddingHorizontal: gutter,
          paddingVertical: medium ? s['10'] : s['6'],
        }}
      >
        <View style={expanded ? { width: STEPS_WIDTH } : undefined}>
          {detect.status === 'success' ? (
            <Stepper
              steps={steps.map((st) => ({ id: st, label: t(`step.${st}`) }))}
              current={index}
              reached={Math.min(reached, steps.length - 1)}
              onSelect={(i) => go(steps[i] ?? 'owner')}
              label={t('steps.label')}
              stepOf={(at, total) => t('steps.of', { current: at, total })}
              progressLabel={t('steps.progress')}
              doneLabel={t('steps.done')}
            />
          ) : (
            <Skeleton height={expanded ? 160 : 96} />
          )}
        </View>
        <View role="main" style={{ flex: expanded ? 1 : undefined, minWidth: 0 }}>
          {detect.status === 'error' ? (
            <EmptyState
              tone="error"
              icon="error"
              title={t('unreachable')}
              action={<Button onPress={detect.refetch}>{t('retry')}</Button>}
            >
              {detect.error.message}
            </EmptyState>
          ) : detect.status === 'loading' || !saved.seeded ? (
            <View aria-busy style={{ maxWidth: FORM_WIDTH, gap: s['4'] }}>
              <Skeleton width={256} height={32} />
              <Skeleton height={20} />
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} height={64} />
              ))}
            </View>
          ) : (
            <View style={{ maxWidth: FORM_WIDTH, gap: s['6'] }}>
              <View style={{ gap: s['1'] + s['0.5'] }}>
                {/* focused on each step (the web's h1 with tabIndex -1): a View, which takes a ref */}
                <View ref={heading} tabIndex={-1} style={{ outlineStyle: 'none' } as object}>
                  <Text variant="heading" role="heading" aria-level={1}>
                    {current.title}
                  </Text>
                </View>
                <Text variant="body" color="text-2">
                  {current.detail}
                </Text>
              </View>
              <View style={{ gap: s['4'] }}>{current.content}</View>
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: s['2'],
                  paddingTop: s['5'],
                  borderTopWidth: 1,
                  borderTopColor: theme.colors.line,
                }}
              >
                {index > 0 && (
                  <Button
                    variant="ghost"
                    icon="arrow-left"
                    onPress={() => go(steps[index - 1] ?? 'owner')}
                  >
                    {t('back')}
                  </Button>
                )}
                <View style={{ flex: 1 }} />
                <Button
                  variant="primary"
                  iconEnd={id === 'review' ? undefined : 'arrow-right'}
                  icon={id === 'review' ? 'check' : undefined}
                  loading={complete.pending}
                  onPress={next}
                >
                  {id === 'review' ? t('finish') : t('continue')}
                </Button>
              </View>
            </View>
          )}
        </View>
      </View>
      {/* setup stands outside the shell, so it holds its own toasts (Finish's, a failure's) */}
      <Toaster label={tShell('notifications')} />
    </View>
  )
}

// ---------------------------------------------------------------- review

function Review({
  found,
  saved,
  steps,
  open,
  errors,
  root,
  onOpen,
  onDone,
  update,
  onStep,
}: {
  found: SetupDetected
  saved: Saved
  steps: StepId[]
  open: Line | null
  errors: Errors
  root: string
  onOpen: (line: Line) => void
  onDone: (line: Line) => void
  update: (patch: Partial<Draft>, line?: Line) => void
  onStep: (step: StepId) => void
}) {
  const t = useT(messages)
  const theme = useTheme()
  const medium = useWindowAtLeast(breakpoints.medium)
  const { draft, changed } = saved
  const pack = useQuery('starter-pack', (c) => c.setup.starterPack())
  const languages = useQuery('setup-languages', (c) => c.setup.languages())
  const { movies, downloads } = draft.folders
  const links = useQuery(`hardlinks:${movies}:${downloads}`, (c) =>
    c.setup.checkHardlinks({ query: { a: downloads, b: movies } }),
  )

  const indexerNames = draft.indexers.map((i) => pack.data?.find((d) => d.id === i)?.name ?? i)
  const languageNames = draft.subtitleLanguages.map(
    (c) => languages.data?.find((l) => l.code === c)?.name ?? c,
  )
  const asked = (st: StepId) => steps.includes(st)
  const note = (line: Line, text: string) => (changed.includes(line) ? undefined : text)
  const edit = (line: Line, patch: Partial<Draft>) => update(patch, line)
  const key = draft.metadataKey.trim()
  const monoText = (text: string) => (
    <Text mono size={mono.size} leading={mono.leading} style={ANYWHERE}>
      {text}
    </Text>
  )

  type Row = {
    id: string
    label: string
    value: ReactNode
    note?: string
    /** A step to go back to, an editor here, or nothing to change now. */
    change?: { step: StepId } | { line: Line; editor: ReactNode }
  }

  const rows: Row[] = [
    {
      id: 'owner',
      label: t('review.owner'),
      value: (
        <Text size={ui.size} leading={ui.leading}>
          {`${draft.owner.displayName} `}
          <Text mono size={ui.size} leading={ui.leading} color="text-3">
            @{draft.owner.username}
          </Text>
        </Text>
      ),
      change: { step: 'owner' },
    },
    {
      id: 'name',
      label: t('review.serverName'),
      value: draft.serverName,
      change: { step: 'owner' },
    },
    {
      id: 'folders',
      label: t('review.folders'),
      value: (
        <View>
          {monoText(movies)}
          {monoText(downloads)}
        </View>
      ),
      note:
        movies && downloads && movies !== downloads && links.status === 'success'
          ? links.data.sameDevice
            ? t('review.hardlinked')
            : t('review.copied')
          : undefined,
      change: asked('folders')
        ? { step: 'folders' }
        : {
            line: 'folders',
            editor: (
              <Folders
                draft={draft}
                errors={errors}
                update={(p) => edit('folders', p)}
                root={root}
              />
            ),
          },
    },
    {
      id: 'metadata',
      label: t('review.metadata'),
      value: key ? t('review.ownKey', { last4: key.slice(-4) }) : t('review.highseaKey'),
      change: {
        line: 'metadata',
        editor: (
          <Field label={t('review.keyLabel')} hint={t('review.keyHint')} error={errors.metadataKey}>
            <Input
              secureTextEntry
              value={draft.metadataKey}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              mono
              onChangeText={(metadataKey) => edit('metadata', { metadataKey })}
            />
          </Field>
        ),
      },
    },
    {
      id: 'indexers',
      label: t('review.indexers'),
      value: indexerNames.length ? indexerNames.join(', ') : t('review.noIndexers'),
      note: note('indexers', t('review.indexersNote')),
      change: {
        line: 'indexers',
        editor: (
          <Indexers
            selected={draft.indexers}
            onChange={(indexers) => edit('indexers', { indexers })}
          />
        ),
      },
    },
    {
      id: 'subtitles',
      label: t('review.subtitles'),
      value: languageNames.join(t('review.then')),
      note: note('subtitles', t('review.subtitlesNote')),
      change: {
        line: 'subtitles',
        editor: (
          <Languages
            selected={draft.subtitleLanguages}
            error={errors.languages}
            onChange={(subtitleLanguages) => edit('subtitles', { subtitleLanguages })}
          />
        ),
      },
    },
    {
      id: 'timeZone',
      label: t('review.timeZone'),
      value: draft.timeZone,
      note: note('timeZone', t('review.timeZoneNote')),
      change: {
        line: 'timeZone',
        editor: (
          <Field
            label={t('review.timeZone')}
            hint={t('review.timeZoneHint')}
            error={errors.timeZone}
          >
            <Select
              value={draft.timeZone}
              onValueChange={(timeZone) => edit('timeZone', { timeZone })}
              options={allZones(draft.timeZone).map((z) => ({ value: z, label: z }))}
            />
          </Field>
        ),
      },
    },
    {
      id: 'address',
      label: t('review.address'),
      value: monoText(draft.address),
      note: note('address', found.address ? t('review.addressFound') : t('review.addressBrowser')),
      change: {
        line: 'address',
        editor: (
          <Field label={t('review.address')} hint={t('review.addressHint')} error={errors.address}>
            <Input
              value={draft.address}
              spellCheck={false}
              autoCapitalize="none"
              mono
              onChangeText={(address) => edit('address', { address })}
            />
          </Field>
        ),
      },
    },
    {
      id: 'remote',
      label: t('review.remote'),
      value:
        draft.remote === 'reverse-proxy'
          ? t('review.remoteProxy', { url: draft.proxyUrl })
          : draft.remote === 'port-forward'
            ? t('review.remotePort', { port: draft.port })
            : t('remote.local'),
      note: note('remote', t('review.remoteNote')),
      change: {
        line: 'remote',
        editor: <RemoteAccess draft={draft} errors={errors} update={(p) => edit('remote', p)} />,
      },
    },
    {
      id: 'graphics',
      label: t('review.graphics'),
      value: found.graphics
        ? t('review.graphicsFound', {
            name: found.graphics.name,
            path: t(`path.${found.graphics.path}`),
          })
        : t('review.processor'),
      note: found.graphics ? t('review.graphicsNote') : t('review.processorNote'),
    },
    {
      id: 'cloud',
      label: t('review.cloud'),
      value: t('review.notLinked'),
      note: t('review.cloudNote'),
    },
  ]

  return (
    <View
      role="list"
      style={{
        borderWidth: 1,
        borderColor: theme.colors.line,
        borderRadius: tokens.radius.md,
        backgroundColor: theme.colors.s1,
      }}
    >
      {rows.map((r, i) => {
        const change = r.change
        const editing = !!change && 'line' in change && open === change.line
        const what = r.label.toLowerCase()
        return (
          <View
            key={r.id}
            role="listitem"
            style={{
              gap: s['3'],
              paddingHorizontal: s['4'],
              paddingVertical: s['3'],
              borderBottomWidth: i < rows.length - 1 ? 1 : 0,
              borderBottomColor: theme.colors.line,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', columnGap: s['3'] }}>
              <View
                style={{
                  flex: 1,
                  minWidth: 0,
                  flexDirection: medium ? 'row' : 'column',
                  columnGap: s['3'],
                  rowGap: s['0.5'],
                }}
              >
                <View style={medium ? { width: LABEL_WIDTH, paddingTop: s['0.5'] } : undefined}>
                  <Text variant="caption" color="text-3">
                    {r.label}
                  </Text>
                </View>
                <View style={{ flex: medium ? 1 : undefined, minWidth: 0 }}>
                  {typeof r.value === 'string' ? (
                    <Text size={ui.size} leading={ui.leading}>
                      {r.value}
                    </Text>
                  ) : (
                    r.value
                  )}
                  {r.note ? (
                    <Text variant="caption" color="text-3">
                      {r.note}
                    </Text>
                  ) : null}
                </View>
              </View>
              {change &&
                ('step' in change ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onPress={() => onStep(change.step)}
                    accessibilityLabel={t('review.changeLabel', { what })}
                  >
                    {t('review.change')}
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    accessibilityState={{ expanded: editing }}
                    onPress={() => (editing ? onDone(change.line) : onOpen(change.line))}
                    accessibilityLabel={t(editing ? 'review.doneLabel' : 'review.changeLabel', {
                      what,
                    })}
                  >
                    {editing ? t('review.done') : t('review.change')}
                  </Button>
                ))}
            </View>
            {editing && 'line' in change && (
              <View
                style={{
                  gap: s['4'],
                  paddingTop: s['3'],
                  borderTopWidth: 1,
                  borderTopColor: theme.colors.line,
                }}
              >
                {change.editor}
              </View>
            )}
          </View>
        )
      })}
    </View>
  )
}

// ---------------------------------------------------------------- folders

function Folders({
  draft,
  errors,
  update,
  root,
}: {
  draft: Draft
  errors: Errors
  update: (patch: Partial<Draft>) => void
  root: string
}) {
  const t = useT(messages)
  const [picking, setPicking] = useState<'movies' | 'downloads' | null>(null)
  const { movies, downloads } = draft.folders
  const check = useQuery(`hardlinks:${movies}:${downloads}`, (c) =>
    c.setup.checkHardlinks({ query: { a: downloads, b: movies } }),
  )
  const set = (key: 'movies' | 'downloads', path: string) =>
    update({ folders: { ...draft.folders, [key]: path } })
  return (
    <>
      {(['movies', 'downloads'] as const).map((key) => (
        <Field key={key} label={t(`folders.${key}`)} error={errors[key]}>
          <View style={{ flexDirection: 'row', gap: s['2'] }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Input
                value={draft.folders[key]}
                icon="folder"
                mono
                spellCheck={false}
                autoCapitalize="none"
                onChangeText={(path) => set(key, path)}
              />
            </View>
            <Button onPress={() => setPicking(key)}>{t('folders.browse')}</Button>
          </View>
        </Field>
      ))}
      {movies && downloads && movies !== downloads && check.status === 'success' && (
        <Banner
          tone={check.data.sameDevice ? 'success' : 'warning'}
          title={check.data.sameDevice ? t('folders.hardlinks') : t('folders.copies')}
        >
          {check.data.message}
        </Banner>
      )}
      <PathPicker
        open={picking !== null}
        title={picking === 'downloads' ? t('picker.downloads') : t('picker.movies')}
        root={root}
        start={picking ? draft.folders[picking] || root : root}
        onClose={() => setPicking(null)}
        onPick={(path) => {
          if (picking) set(picking, path)
          setPicking(null)
        }}
      />
    </>
  )
}

/** The folders under the media root: browsing stops there, as the server does. */
function PathPicker({
  open,
  title,
  root,
  start,
  onClose,
  onPick,
}: {
  open: boolean
  title: string
  root: string
  start: string
  onClose: () => void
  onPick: (path: string) => void
}) {
  const t = useT(messages)
  const theme = useTheme()
  const inside = (p: string) => p === root || p.startsWith(`${root}/`)
  const [path, setPath] = useState(inside(start) ? start : root)
  // biome-ignore lint/correctness/useExhaustiveDependencies: resets when the picker opens
  useEffect(() => {
    if (open) setPath(inside(start) ? start : root)
  }, [open, start, root])
  const list = useQuery(`fs:${path}`, (c) => c.setup.listFolders({ query: { path } }))
  const below = path.slice(root.length).split('/').filter(Boolean)
  const crumbs = [
    { label: root, to: root },
    ...below.map((name, i) => ({ label: name, to: `${root}/${below.slice(0, i + 1).join('/')}` })),
  ]
  const up = path === root ? null : path.slice(0, path.lastIndexOf('/')) || root
  const crumbText = { size: mono.size, leading: mono.leading, mono: true } as const
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={t('picker.detail')}
      footer={
        <>
          <Button variant="ghost" onPress={onClose}>
            {t('picker.cancel')}
          </Button>
          <Button variant="primary" onPress={() => onPick(path)} disabled={list.status === 'error'}>
            {t('picker.use')}
          </Button>
        </>
      }
    >
      <View style={{ gap: s['4'] }}>
        <View
          role="navigation"
          aria-label={t('picker.path')}
          style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: s['1'] }}
        >
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1
            return (
              <View
                key={c.to}
                style={{ flexDirection: 'row', alignItems: 'center', gap: s['1'], minWidth: 0 }}
              >
                {i > 0 && (
                  <Text {...crumbText} color="text-3">
                    /
                  </Text>
                )}
                {last ? (
                  <Text {...crumbText} aria-current="location" style={ANYWHERE}>
                    {c.label}
                  </Text>
                ) : (
                  <Press
                    role="button"
                    onPress={() => setPath(c.to)}
                    style={({ hovered }) => ({
                      borderRadius: 4,
                      paddingHorizontal: s['0.5'],
                      backgroundColor: hovered ? theme.colors.s4 : 'transparent',
                    })}
                  >
                    {({ hovered }) => (
                      <Text {...crumbText} color={hovered ? 'text' : 'text-2'} style={ANYWHERE}>
                        {c.label}
                      </Text>
                    )}
                  </Press>
                )}
              </View>
            )
          })}
        </View>
        <View
          style={{
            height: LIST_HEIGHT,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: theme.colors.line,
            borderRadius: tokens.radius.md,
            backgroundColor: theme.colors.s2,
          }}
        >
          {list.status === 'loading' ? (
            <View style={{ gap: s['1'], padding: s['2'] }}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} height={ROW_HEIGHT} />
              ))}
            </View>
          ) : list.status === 'error' ? (
            <EmptyState size="sm" tone="error" icon="error" title={t('picker.error')}>
              {list.error.message}
            </EmptyState>
          ) : (
            <ScrollView>
              <View role="list" style={{ padding: s['1'] }}>
                {up && (
                  <View role="listitem">
                    <FolderRow
                      icon="chevron-up"
                      label={t('picker.up')}
                      onPress={() => setPath(up)}
                    />
                  </View>
                )}
                {list.data.map((f) => (
                  <View key={f.path} role="listitem">
                    <FolderRow icon="folder" label={f.name} onPress={() => setPath(f.path)} />
                  </View>
                ))}
                {list.data.length === 0 && (
                  <View
                    role="listitem"
                    style={{ paddingHorizontal: s['3'], paddingVertical: s['6'] }}
                  >
                    <Text variant="caption" color="text-3" align="center">
                      {t('picker.empty')}
                    </Text>
                  </View>
                )}
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Dialog>
  )
}

function FolderRow({
  icon,
  label,
  onPress,
}: {
  icon: 'folder' | 'chevron-up'
  label: string
  onPress: () => void
}) {
  const theme = useTheme()
  return (
    <Press
      role="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ hovered }) => ({
        height: ROW_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        gap: s['2'] + s['0.5'],
        paddingHorizontal: s['2'] + s['0.5'],
        borderRadius: tokens.radius.sm,
        backgroundColor: hovered ? theme.colors.s4 : 'transparent',
      })}
    >
      <Icon name={icon} size={16} color="text-3" />
      <Text mono size={mono.size} leading={mono.leading} numberOfLines={1} style={{ flex: 1 }}>
        {label}
      </Text>
      {icon === 'folder' && <Icon name="chevron-right" size={14} color="text-3" />}
    </Press>
  )
}

// ---------------------------------------------------------------- indexers

function Indexers({
  selected,
  onChange,
}: {
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  const t = useT(messages)
  const theme = useTheme()
  const pack = useQuery('starter-pack', (c) => c.setup.starterPack())
  if (pack.status === 'loading')
    return (
      <View aria-busy style={{ gap: s['2'] }}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={64} />
        ))}
      </View>
    )
  if (pack.status === 'error')
    return (
      <EmptyState
        size="sm"
        tone="error"
        icon="error"
        title={t('indexers.failed')}
        action={<Button onPress={pack.refetch}>{t('retry')}</Button>}
      >
        {t('indexers.failedBody', { message: pack.error.message })}
      </EmptyState>
    )
  if (!pack.data.length)
    return (
      <EmptyState size="sm" icon="inbox" title={t('indexers.none')}>
        {t('indexers.noneBody')}
      </EmptyState>
    )
  return (
    <View role="list" style={{ gap: s['2'] }}>
      {pack.data.map((d) => (
        <View
          key={d.id}
          role="listitem"
          style={{
            padding: s['3'],
            borderWidth: 1,
            borderColor: theme.colors.line,
            borderRadius: tokens.radius.md,
            backgroundColor: theme.colors.s2,
          }}
        >
          <Checkbox
            label={d.name}
            hint={d.description}
            checked={selected.includes(d.id)}
            onCheckedChange={(v) =>
              onChange(v ? [...selected, d.id] : selected.filter((x) => x !== d.id))
            }
          />
        </View>
      ))}
    </View>
  )
}

// ---------------------------------------------------------------- subtitles

/** The prototype's chips: the languages most libraries want, in its order. */
const COMMON = ['en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'ja', 'ko', 'zh', 'ar', 'hi']
/** The "more" select's widest (the web's max-w-56). */
const MORE_WIDTH = 224

function Languages({
  selected,
  error,
  onChange,
}: {
  selected: string[]
  error?: string
  onChange: (codes: string[]) => void
}) {
  const t = useT(messages)
  const languages = useQuery('setup-languages', (c) => c.setup.languages())
  if (languages.status === 'loading') return <Skeleton height={96} />
  if (languages.status === 'error')
    return (
      <EmptyState
        size="sm"
        tone="error"
        icon="error"
        title={t('subtitles.failed')}
        action={<Button onPress={languages.refetch}>{t('retry')}</Button>}
      >
        {languages.error.message}
      </EmptyState>
    )
  const all = languages.data
  const name = (code: string) => all.find((l) => l.code === code)?.name ?? code
  const chips = [
    ...COMMON.filter((c) => all.some((l) => l.code === c)),
    ...selected.filter((c) => !COMMON.includes(c)),
  ]
  const others = all.filter((l) => !chips.includes(l.code))
  return (
    <View style={{ gap: s['3'] }}>
      <View role="group" aria-label={t('subtitles.legend')} style={{ gap: s['2'] }}>
        <Text size={form.size - 1} leading={form.leading} weight={500} color="text-2">
          {t('subtitles.legend')}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s['2'] }}>
          {chips.map((code) => {
            const on = selected.includes(code)
            return (
              <Chip
                key={code}
                selected={on}
                icon={on ? 'check' : undefined}
                onPress={() =>
                  onChange(on ? selected.filter((c) => c !== code) : [...selected, code])
                }
              >
                {name(code)}
              </Chip>
            )
          })}
        </View>
      </View>
      <View style={{ width: '100%', maxWidth: MORE_WIDTH }}>
        <Select
          value=""
          onValueChange={(code) => code && onChange([...selected, code])}
          placeholder={t('subtitles.more')}
          aria-label={t('subtitles.more')}
          options={others.map((l) => ({ value: l.code, label: l.name }))}
        />
      </View>
      {/* the error is about none being picked, so picking one answers it */}
      {error && selected.length === 0 ? (
        <View
          role="alert"
          style={{ flexDirection: 'row', alignItems: 'flex-start', gap: s['1'] + s['0.5'] }}
        >
          <View style={{ marginTop: 1 }}>
            <Icon name="alert" size={14} color="badge-danger" />
          </View>
          <Text variant="caption" color="badge-danger" style={{ flex: 1, minWidth: 0 }}>
            {error}
          </Text>
        </View>
      ) : selected.length === 0 ? null : (
        <Text variant="caption" color="text-3" aria-live="polite">
          {selected.length === 1
            ? t('subtitles.only', { language: name(selected[0] ?? '') })
            : t('subtitles.order', { languages: selected.map(name).join(t('review.then')) })}
        </Text>
      )}
    </View>
  )
}

// ---------------------------------------------------------------- remote access

const remoteOptions = [
  { kind: 'local-only', title: 'remote.local', detail: 'remote.localDetail' },
  { kind: 'reverse-proxy', title: 'remote.proxy', detail: 'remote.proxyDetail' },
  { kind: 'port-forward', title: 'remote.port', detail: 'remote.portDetail' },
] as const

/** The fields under a chosen card, in line with its words (the web's ps-7). */
const UNDER_WORDS = s['6'] + s['1']
/** The port field's width (the web's w-28). */
const PORT_WIDTH = 112

function RemoteAccess({
  draft,
  errors,
  update,
}: {
  draft: Draft
  errors: Errors
  update: (patch: Partial<Draft>) => void
}) {
  const t = useT(messages)
  const theme = useTheme()
  return (
    <View role="radiogroup" aria-label={t('remote.legend')} style={{ gap: s['2'] }}>
      {remoteOptions.map((o) => {
        const on = draft.remote === o.kind
        return (
          <View
            key={o.kind}
            style={{
              gap: s['3'],
              padding: s['3'],
              borderWidth: 1,
              borderRadius: tokens.radius.md,
              borderColor: on ? theme.colors.accent : theme.colors.line,
              backgroundColor: on ? theme.colors.s2 : theme.colors.s1,
            }}
          >
            <Press
              // the row is the radio, its mark inside (a radio's children are presentational)
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={t(o.title)}
              accessibilityHint={t(o.detail)}
              onPress={() => update({ remote: o.kind })}
              style={{ flexDirection: 'row', columnGap: s['3'] }}
            >
              <View style={{ paddingTop: s['0.5'] }}>
                <RadioMark checked={on} />
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: s['0.5'] }}>
                <Text size={ui.size} leading={ui.leading} weight={600}>
                  {t(o.title)}
                </Text>
                <Text variant="caption" color="text-2">
                  {t(o.detail)}
                </Text>
              </View>
            </Press>
            {on && o.kind === 'reverse-proxy' && (
              <View style={{ paddingStart: UNDER_WORDS }}>
                <Field label={t('remote.address')} error={errors.proxyUrl}>
                  <Input
                    value={draft.proxyUrl}
                    placeholder="https://movies.example.com"
                    inputMode="url"
                    autoCapitalize="none"
                    spellCheck={false}
                    mono
                    onChangeText={(url) => update({ proxyUrl: url.trim() })}
                  />
                </Field>
              </View>
            )}
            {on && o.kind === 'port-forward' && (
              <View style={{ paddingStart: UNDER_WORDS }}>
                <Field
                  label={t('remote.portLabel')}
                  hint={t('remote.portHint')}
                  error={errors.port}
                >
                  <View style={{ width: PORT_WIDTH }}>
                    <Input
                      value={draft.port}
                      inputMode="numeric"
                      mono
                      onChangeText={(port) => update({ port: port.replace(/\D/g, '') })}
                    />
                  </View>
                </Field>
              </View>
            )}
          </View>
        )
      })}
    </View>
  )
}

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
// localStorage).
import type { SetupDetected, SetupInput } from '@highsea-tv/api-contract'
import { useT } from '@highsea-tv/i18n/react'
import type { ApiError } from '@highsea-tv/sdk'
import { useAction, useQuery } from '@highsea-tv/sdk/react'
import {
  Banner,
  Button,
  Checkbox,
  cn,
  Dialog,
  DialogContent,
  EmptyState,
  Field,
  Icon,
  Input,
  Lockup,
  Select,
  Skeleton,
  Stepper,
  toast,
} from '@highsea-tv/ui-web'
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { errorReason, keyRejected, metadataLocale, tmdbBusy } from './metadata-locale.ts'
import { setup as messages } from './setup-messages.ts'

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
  const heading = useRef<HTMLHeadingElement>(null)
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

  const next = async (e?: FormEvent) => {
    e?.preventDefault()
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
      window.location.assign('/')
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
  const body: Record<StepId, { title: string; detail: ReactNode; content: ReactNode }> = {
    owner: {
      title: t('owner.title'),
      detail: t('owner.detail'),
      content: (
        <>
          <Field label={t('owner.name')} error={errors.displayName}>
            <Input
              value={draft.owner.displayName}
              autoComplete="name"
              onChange={(e) => update({ owner: { ...draft.owner, displayName: e.target.value } })}
            />
          </Field>
          <Field label={t('owner.username')} hint={t('owner.usernameHint')} error={errors.username}>
            <Input
              value={draft.owner.username}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              onChange={(e) =>
                update({ owner: { ...draft.owner, username: e.target.value.toLowerCase() } })
              }
            />
          </Field>
          <div className="grid items-start gap-4 medium:grid-cols-2">
            <Field
              label={t('owner.password')}
              hint={t('owner.passwordHint')}
              error={errors.password}
            >
              <Input
                type="password"
                value={draft.owner.password}
                autoComplete="new-password"
                onChange={(e) => update({ owner: { ...draft.owner, password: e.target.value } })}
              />
            </Field>
            <Field label={t('owner.confirm')} error={errors.confirm}>
              <Input
                type="password"
                value={draft.owner.confirm}
                autoComplete="new-password"
                onChange={(e) => update({ owner: { ...draft.owner, confirm: e.target.value } })}
              />
            </Field>
          </div>
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
              onChange={(e) => update({ serverName: e.target.value })}
            />
          </Field>
          {/* plain text: Settings › Migration opens only once setup has signed the owner in */}
          <p className="text-caption text-text-3">{t('owner.later')}</p>
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

  return (
    <div className="flex min-h-screen flex-col bg-bg text-text">
      <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-line border-b px-4 py-2 medium:px-6">
        <Lockup size={17} />
        <span className="text-caption text-text-3">{t('label')}</span>
        <div className="flex-1" />
        {(index > 0 || reached > 0) && (
          <Button variant="ghost" size="sm" icon="replay" onClick={startOver}>
            {t('startOver')}
          </Button>
        )}
      </header>
      <div className="mx-auto grid w-full max-w-240 flex-1 content-start gap-6 px-4 py-6 medium:px-6 medium:py-10 expanded:grid-cols-[13rem_minmax(0,1fr)] expanded:gap-10">
        {detect.status === 'success' ? (
          <Stepper
            steps={steps.map((s) => ({ id: s, label: t(`step.${s}`) }))}
            current={index}
            reached={Math.min(reached, steps.length - 1)}
            onSelect={(i) => go(steps[i] ?? 'owner')}
          />
        ) : (
          <Skeleton className="h-24 expanded:h-40" />
        )}
        <main className="min-w-0">
          {detect.status === 'error' ? (
            <EmptyState
              tone="error"
              title={t('unreachable')}
              action={<Button onClick={detect.refetch}>{t('retry')}</Button>}
            >
              {detect.error.message}
            </EmptyState>
          ) : detect.status === 'loading' || !saved.seeded ? (
            <div aria-busy className="grid max-w-150 gap-4">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-5" />
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : (
            <form onSubmit={next} noValidate className="grid max-w-150 gap-6">
              <div className="grid gap-1.5">
                <h1 ref={heading} tabIndex={-1} className="text-heading outline-none">
                  {current.title}
                </h1>
                <p className="text-body text-text-2">{current.detail}</p>
              </div>
              <div className="grid gap-4">{current.content}</div>
              <div className="flex flex-wrap items-center gap-2 border-line border-t pt-5">
                {index > 0 && (
                  <Button
                    variant="ghost"
                    icon="arrow-left"
                    onClick={() => go(steps[index - 1] ?? 'owner')}
                  >
                    {t('back')}
                  </Button>
                )}
                <div className="flex-1" />
                <Button
                  type="submit"
                  variant="primary"
                  iconEnd={id === 'review' ? undefined : 'arrow-right'}
                  icon={id === 'review' ? 'check' : undefined}
                  loading={complete.pending}
                >
                  {id === 'review' ? t('finish') : t('continue')}
                </Button>
              </div>
            </form>
          )}
        </main>
      </div>
    </div>
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
  const asked = (s: StepId) => steps.includes(s)
  const note = (line: Line, text: string) => (changed.includes(line) ? undefined : text)
  const edit = (line: Line, patch: Partial<Draft>) => update(patch, line)
  const key = draft.metadataKey.trim()

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
        <>
          {draft.owner.displayName}{' '}
          <span className="font-mono text-text-3">@{draft.owner.username}</span>
        </>
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
        <span className="grid font-mono text-mono [overflow-wrap:anywhere]">
          <span>{movies}</span>
          <span>{downloads}</span>
        </span>
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
              type="password"
              value={draft.metadataKey}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="font-mono"
              onChange={(e) => edit('metadata', { metadataKey: e.target.value })}
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
      value: <span className="font-mono text-mono [overflow-wrap:anywhere]">{draft.address}</span>,
      note: note('address', found.address ? t('review.addressFound') : t('review.addressBrowser')),
      change: {
        line: 'address',
        editor: (
          <Field label={t('review.address')} hint={t('review.addressHint')} error={errors.address}>
            <Input
              value={draft.address}
              spellCheck={false}
              autoCapitalize="none"
              className="font-mono"
              onChange={(e) => edit('address', { address: e.target.value })}
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
    <ul className="grid rounded-md border border-line bg-s1">
      {rows.map((r) => {
        const change = r.change
        const editing = change && 'line' in change && open === change.line
        const what = r.label.toLowerCase()
        return (
          <li key={r.id} className="grid gap-3 border-line border-b px-4 py-3 last:border-b-0">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3">
              <dl className="grid min-w-0 gap-x-3 gap-y-0.5 medium:grid-cols-[10rem_minmax(0,1fr)]">
                <dt className="text-caption text-text-3 medium:pt-0.5">{r.label}</dt>
                <dd className="min-w-0 break-words text-text text-ui">
                  {r.value}
                  {r.note && <span className="block text-caption text-text-3">{r.note}</span>}
                </dd>
              </dl>
              {change &&
                ('step' in change ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onStep(change.step)}
                    aria-label={t('review.changeLabel', { what })}
                  >
                    {t('review.change')}
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-expanded={editing}
                    aria-controls={editing ? `edit-${r.id}` : undefined}
                    onClick={() => (editing ? onDone(change.line) : onOpen(change.line))}
                    aria-label={t(editing ? 'review.doneLabel' : 'review.changeLabel', { what })}
                  >
                    {editing ? t('review.done') : t('review.change')}
                  </Button>
                ))}
            </div>
            {editing && 'line' in change && (
              <div id={`edit-${r.id}`} className="grid gap-4 border-line border-t pt-3">
                {change.editor}
              </div>
            )}
          </li>
        )
      })}
    </ul>
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
          <div className="flex gap-2">
            <Input
              value={draft.folders[key]}
              icon="folder"
              className="flex-1 font-mono"
              spellCheck={false}
              onChange={(e) => set(key, e.target.value)}
            />
            <Button onClick={() => setPicking(key)}>{t('folders.browse')}</Button>
          </div>
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
        onOpenChange={(open) => !open && setPicking(null)}
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
  onOpenChange,
  onPick,
}: {
  open: boolean
  title: string
  root: string
  start: string
  onOpenChange: (open: boolean) => void
  onPick: (path: string) => void
}) {
  const t = useT(messages)
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={title}
        description={t('picker.detail')}
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t('picker.cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={() => onPick(path)}
              disabled={list.status === 'error'}
            >
              {t('picker.use')}
            </Button>
          </>
        }
      >
        <nav
          aria-label={t('picker.path')}
          className="flex flex-wrap items-center gap-1 font-mono text-mono"
        >
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1
            return (
              <span key={c.to} className="flex min-w-0 items-center gap-1 [overflow-wrap:anywhere]">
                {i > 0 && <span className="text-text-3">/</span>}
                {last ? (
                  <span aria-current="location" className="text-text">
                    {c.label}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPath(c.to)}
                    className="rounded-[4px] px-0.5 text-text-2 hover:bg-s4 hover:text-text"
                  >
                    {c.label}
                  </button>
                )}
              </span>
            )
          })}
        </nav>
        <div className="h-64 overflow-y-auto rounded-md border border-line bg-s2">
          {list.status === 'loading' ? (
            <div className="grid gap-1 p-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-9" />
              ))}
            </div>
          ) : list.status === 'error' ? (
            <EmptyState size="sm" tone="error" title={t('picker.error')}>
              {list.error.message}
            </EmptyState>
          ) : (
            <ul className="grid grid-cols-[minmax(0,1fr)] p-1">
              {up && (
                <li>
                  <FolderRow icon="chevron-up" label={t('picker.up')} onClick={() => setPath(up)} />
                </li>
              )}
              {list.data.map((f) => (
                <li key={f.path}>
                  <FolderRow icon="folder" label={f.name} onClick={() => setPath(f.path)} />
                </li>
              ))}
              {list.data.length === 0 && (
                <li className="px-3 py-6 text-center text-caption text-text-3">
                  {t('picker.empty')}
                </li>
              )}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function FolderRow({
  icon,
  label,
  onClick,
}: {
  icon: 'folder' | 'chevron-up'
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-9 w-full items-center gap-2.5 rounded-sm px-2.5 text-start text-ui transition-tint hover:bg-s4"
    >
      <Icon name={icon} size={16} className="text-text-3" />
      <span className="min-w-0 flex-1 truncate font-mono text-mono">{label}</span>
      {icon === 'folder' && <Icon name="chevron-right" size={14} className="text-text-3" />}
    </button>
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
  const pack = useQuery('starter-pack', (c) => c.setup.starterPack())
  if (pack.status === 'loading')
    return (
      <div aria-busy className="grid gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    )
  if (pack.status === 'error')
    return (
      <EmptyState
        size="sm"
        tone="error"
        title={t('indexers.failed')}
        action={<Button onClick={pack.refetch}>{t('retry')}</Button>}
      >
        {t('indexers.failedBody', { message: pack.error.message })}
      </EmptyState>
    )
  if (!pack.data.length)
    return (
      <EmptyState size="sm" title={t('indexers.none')}>
        {t('indexers.noneBody')}
      </EmptyState>
    )
  return (
    <ul className="grid gap-2">
      {pack.data.map((d) => (
        <li key={d.id}>
          <Field
            inline
            label={<span className="text-text">{d.name}</span>}
            hint={d.description}
            className="rounded-md border border-line bg-s2 p-3"
          >
            <Checkbox
              checked={selected.includes(d.id)}
              onCheckedChange={(v) =>
                onChange(v ? [...selected, d.id] : selected.filter((x) => x !== d.id))
              }
            />
          </Field>
        </li>
      ))}
    </ul>
  )
}

// ---------------------------------------------------------------- subtitles

/** The prototype's chips: the languages most libraries want, in its order. */
const COMMON = ['en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'ja', 'ko', 'zh', 'ar', 'hi']

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
  if (languages.status === 'loading') return <Skeleton className="h-24" />
  if (languages.status === 'error')
    return (
      <EmptyState
        size="sm"
        tone="error"
        title={t('subtitles.failed')}
        action={<Button onClick={languages.refetch}>{t('retry')}</Button>}
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
    <div className="grid gap-3">
      <fieldset className="grid gap-2">
        <legend className="mb-2 font-medium text-[13px] text-text-2">
          {t('subtitles.legend')}
        </legend>
        <div className="flex flex-wrap gap-2">
          {chips.map((code) => {
            const on = selected.includes(code)
            return (
              <button
                key={code}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  onChange(on ? selected.filter((c) => c !== code) : [...selected, code])
                }
                className={cn(
                  'flex h-8 items-center gap-1.5 rounded-full border px-3 text-ui transition-tint',
                  on
                    ? 'border-accent bg-accent-soft text-accent-text'
                    : 'border-line-strong text-text-2 hover:bg-s2 hover:text-text',
                )}
              >
                {on && <Icon name="check" size={14} />}
                {name(code)}
              </button>
            )
          })}
        </div>
      </fieldset>
      <Select
        value=""
        onValueChange={(code) => code && onChange([...selected, code])}
        placeholder={t('subtitles.more')}
        aria-label={t('subtitles.more')}
        options={others.map((l) => ({ value: l.code, label: l.name }))}
        className="w-full max-w-56"
      />
      {/* the error is about none being picked, so picking one answers it */}
      {error && selected.length === 0 ? (
        <p role="alert" className="flex items-start gap-1.5 text-badge-danger text-caption">
          <Icon name="alert" size={14} className="mt-px shrink-0" />
          {error}
        </p>
      ) : selected.length === 0 ? null : (
        <p className="text-caption text-text-3" aria-live="polite">
          {selected.length === 1
            ? t('subtitles.only', { language: name(selected[0] ?? '') })
            : t('subtitles.order', { languages: selected.map(name).join(t('review.then')) })}
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- remote access

const remoteOptions = [
  { kind: 'local-only', title: 'remote.local', detail: 'remote.localDetail' },
  { kind: 'reverse-proxy', title: 'remote.proxy', detail: 'remote.proxyDetail' },
  { kind: 'port-forward', title: 'remote.port', detail: 'remote.portDetail' },
] as const

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
  return (
    <fieldset className="grid gap-2">
      <legend className="sr-only">{t('remote.legend')}</legend>
      {remoteOptions.map((o) => {
        const on = draft.remote === o.kind
        return (
          <div
            key={o.kind}
            className={cn(
              'grid gap-3 rounded-md border p-3 transition-tint',
              on ? 'border-accent bg-s2' : 'border-line bg-s1',
            )}
          >
            <label className="grid cursor-pointer grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
              <input
                type="radio"
                name="remote"
                checked={on}
                onChange={() => update({ remote: o.kind })}
                className="mt-0.5 size-4 accent-(--color-accent-fill)"
              />
              <span className="font-semibold text-text text-ui">{t(o.title)}</span>
              <span className="col-start-2 text-caption text-text-2">{t(o.detail)}</span>
            </label>
            {on && o.kind === 'reverse-proxy' && (
              <Field label={t('remote.address')} error={errors.proxyUrl} className="ps-7">
                <Input
                  value={draft.proxyUrl}
                  placeholder="https://movies.example.com"
                  inputMode="url"
                  spellCheck={false}
                  className="font-mono"
                  onChange={(e) => update({ proxyUrl: e.target.value.trim() })}
                />
              </Field>
            )}
            {on && o.kind === 'port-forward' && (
              <Field
                label={t('remote.portLabel')}
                hint={t('remote.portHint')}
                error={errors.port}
                className="ps-7"
              >
                <Input
                  value={draft.port}
                  inputMode="numeric"
                  className="w-28 font-mono"
                  onChange={(e) => update({ port: e.target.value.replace(/\D/g, '') })}
                />
              </Field>
            )}
          </div>
        )
      })}
    </fieldset>
  )
}

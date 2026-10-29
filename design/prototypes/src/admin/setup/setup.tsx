// SPDX-License-Identifier: AGPL-3.0-only
// A2 Setup wizard (docs/product/setup.md), as install-simplicity B shrinks it: highsea fills in
// what it can find (the server's name, the folders under /data, the browser's languages and time
// zone, the address apps use) and asks only for the owner; movie details come with highsea's own
// TMDB key. Folders become a step only when highsea found none. Review lists what highsea decided, and each line
// opens its own editor in place. Progress is kept in the browser, so a reload picks up where you
// left off.
import {
  Badge,
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
import { useLocation } from 'wouter'
import { useAction, useClient, useQuery } from '../../mock/hooks.tsx'
import type { Language, RemoteAccess, SetupDetected, SetupInput } from '../../mock/types.ts'

type StepId = 'owner' | 'folders' | 'review'

const stepLabels: Record<StepId, string> = {
  owner: 'Owner account',
  folders: 'Media folders',
  review: 'Review',
}

/** Folders are a step only when highsea found none. */
const stepsFor = (found: SetupDetected): StepId[] => [
  'owner',
  ...(found.folders ? [] : (['folders'] as const)),
  'review',
]

type Draft = {
  serverName: string
  owner: SetupInput['owner'] & { confirm: string }
  folders: SetupInput['folders']
  metadataKey: string
  indexers: string[]
  subtitleLanguages: string[]
  timeZone: string
  address: string
  remote: RemoteAccess['kind']
  proxyUrl: string
  port: string
}

/** The Review lines the owner changed, which lose their "from this browser" note. */
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

// one draft per server, so the toolbar's Populated and Empty don't share answers
const storageKey = (server: string) => `highsea-proto:setup:${server}`

function load(key: string): Saved | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as Saved) : null
  } catch {
    return null
  }
}

function persist(key: string, saved: Saved | null) {
  try {
    if (saved) localStorage.setItem(key, JSON.stringify(saved))
    else localStorage.removeItem(key)
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
function browserLanguages(available: Language[]): string[] {
  const codes = (typeof navigator === 'undefined' ? [] : (navigator.languages ?? []))
    .map((l) => l.split('-')[0]?.toLowerCase() ?? '')
    .filter((c, i, all) => c && all.indexOf(c) === i && available.some((l) => l.code === c))
  return codes.length ? codes : ['en']
}

// ---------------------------------------------------------------- checks

type Errors = Partial<Record<string, string>>

const ownerErrors = (d: Draft): Errors => {
  const e: Errors = {}
  if (!d.owner.displayName.trim()) e.displayName = 'Enter your name.'
  if (!/^[a-z0-9._-]{2,32}$/.test(d.owner.username))
    e.username = 'Use 2 to 32 lowercase letters, numbers, dots, dashes or underscores.'
  if (d.owner.password.length < 10) e.password = 'Use at least 10 characters.'
  else if (d.owner.confirm !== d.owner.password) e.confirm = 'The passwords don’t match.'
  if (!d.serverName.trim()) e.serverName = 'Give the server a name.'
  return e
}

const folderErrors = (d: Draft): Errors => {
  const e: Errors = {}
  if (!d.folders.movies) e.movies = 'Pick a folder for movies.'
  if (!d.folders.downloads) e.downloads = 'Pick a folder for downloads.'
  if (d.folders.movies && d.folders.movies === d.folders.downloads)
    e.downloads = 'Use a different folder from the movies folder.'
  return e
}

/** The checks behind each Review line's Done, and Finish. */
function lineErrors(line: Line, d: Draft): Errors {
  const e: Errors = {}
  if (line === 'folders') return folderErrors(d)
  if (line === 'subtitles' && d.subtitleLanguages.length === 0)
    e.languages = 'Pick at least one language, or turn subtitles off later in Settings.'
  if (line === 'address' && !/^[^\s/]+(:\d{1,5})?$/.test(d.address.trim()))
    e.address = 'Enter the address apps use, such as 192.168.1.20:3000.'
  if (line === 'remote') {
    if (d.remote === 'reverse-proxy' && !/^https:\/\/[^\s/]+/.test(d.proxyUrl))
      e.proxyUrl = 'Enter the full address, starting with https://'
    const port = Number(d.port)
    if (d.remote === 'port-forward' && !(Number.isInteger(port) && port >= 1024 && port <= 65535))
      e.port = 'Use a port from 1024 to 65535.'
  }
  return e
}

const toInput = (d: Draft): SetupInput => ({
  serverName: d.serverName.trim(),
  owner: {
    displayName: d.owner.displayName,
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
  metadataKey: d.metadataKey.trim() || undefined,
  timeZone: d.timeZone,
  address: d.address.trim(),
})

// ---------------------------------------------------------------- the wizard

export function Setup() {
  const [, navigate] = useLocation()
  const client = useClient()
  const key = storageKey(client.dataState)
  const [saved, setSaved] = useState<Saved>(() => load(key) ?? fresh())
  const [errors, setErrors] = useState<Errors>({})
  // the Review line whose editor is open
  const [open, setOpen] = useState<Line | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const first = useRef(true)
  const detect = useQuery('setup-detect', (c) => c.setup.detect())
  const pack = useQuery('starter-pack', (c) => c.catalog.starterPack())
  const languages = useQuery('languages', (c) => c.subtitles.languages())
  const complete = useAction((c, input: SetupInput) => c.setup.complete(input))
  const { step, reached, draft } = saved

  useEffect(() => persist(key, saved), [key, saved])
  useEffect(() => {
    document.title = 'Set up highsea'
  }, [])

  // the detected defaults go in once, when the server and the lists have answered
  // biome-ignore lint/correctness/useExhaustiveDependencies: seeds once
  useEffect(() => {
    if (saved.seeded || detect.status !== 'success') return
    if (pack.status === 'loading' || languages.status === 'loading') return
    const found = detect.data
    setSaved((s) => ({
      ...s,
      seeded: true,
      draft: {
        ...s.draft,
        serverName: s.draft.serverName || (found.serverName ?? ''),
        folders: found.folders ?? s.draft.folders,
        indexers:
          pack.status === 'success'
            ? pack.data.filter((d) => d.privacy === 'public').map((d) => d.id)
            : [],
        subtitleLanguages:
          languages.status === 'success' ? browserLanguages(languages.data) : ['en'],
        timeZone: browserZone(),
        // bridge mode can't see the host's address, so the one this browser used is the best guess
        address: found.address ?? (typeof location === 'undefined' ? '' : location.host),
      },
    }))
  }, [detect.status, pack.status, languages.status, saved.seeded])

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
  const forward = () => go(steps[index + 1] ?? 'review')

  const next = async (e?: FormEvent) => {
    e?.preventDefault()
    const found = id === 'owner' ? ownerErrors(draft) : id === 'folders' ? folderErrors(draft) : {}
    setErrors(found)
    if (Object.keys(found).length) return
    if (id !== 'review') return forward()
    // an editor left wrong opens again with its message
    for (const line of ['folders', 'subtitles', 'address', 'remote'] as const) {
      const wrong = lineErrors(line, draft)
      if (Object.keys(wrong).length) {
        setOpen(line)
        setErrors(wrong)
        return
      }
    }
    try {
      const server = await complete.run(toInput(draft))
      persist(key, null)
      toast.success(`${server.name} is ready`, {
        description: 'Add your first movie from Discover.',
      })
      navigate('/')
    } catch (err) {
      toast.error('Setup didn’t finish', { description: (err as Error).message })
    }
  }

  const startOver = () => {
    setErrors({})
    setSaved(fresh())
  }

  const body: Record<StepId, { title: string; detail: ReactNode; content: ReactNode }> = {
    owner: {
      title: 'Create the owner account',
      detail:
        'The owner can do everything, including inviting people and giving them roles. Keep this password somewhere safe.',
      content: (
        <>
          <Field label="Your name" error={errors.displayName}>
            <Input
              value={draft.owner.displayName}
              autoComplete="name"
              onChange={(e) => update({ owner: { ...draft.owner, displayName: e.target.value } })}
            />
          </Field>
          <Field label="Username" hint="You sign in with this." error={errors.username}>
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
            <Field label="Password" hint="At least 10 characters." error={errors.password}>
              <Input
                type="password"
                value={draft.owner.password}
                autoComplete="new-password"
                onChange={(e) => update({ owner: { ...draft.owner, password: e.target.value } })}
              />
            </Field>
            <Field label="Confirm password" error={errors.confirm}>
              <Input
                type="password"
                value={draft.owner.confirm}
                autoComplete="new-password"
                onChange={(e) => update({ owner: { ...draft.owner, confirm: e.target.value } })}
              />
            </Field>
          </div>
          <Field
            label="Server name"
            hint={
              detect.data?.serverName
                ? 'From this computer’s name. Everyone who connects sees it.'
                : 'Everyone who connects sees this name.'
            }
            error={errors.serverName}
          >
            <Input
              value={draft.serverName}
              placeholder="Harbor"
              autoComplete="off"
              onChange={(e) => update({ serverName: e.target.value })}
            />
          </Field>
          <p className="text-caption text-text-3">
            You can turn on two-factor sign-in and passkeys in Settings › Security. Coming from
            Radarr or qBittorrent? You can bring your library across after setup.
          </p>
        </>
      ),
    },
    folders: {
      title: 'Choose your folders',
      detail:
        'highsea didn’t find a movies folder and a downloads folder under /data. Pick the folders you mounted for it.',
      content: <Folders draft={draft} errors={errors} update={(p) => update(p, 'folders')} />,
    },
    review: {
      title: 'Check and finish',
      detail:
        'highsea chose these from what it found. Change anything here now, or later in Settings.',
      content:
        detect.status === 'success' ? (
          <Review
            found={detect.data}
            saved={saved}
            steps={steps}
            open={open}
            errors={errors}
            onOpen={(line) => {
              setErrors({})
              setOpen(line)
            }}
            onDone={(line) => {
              const wrong = lineErrors(line, draft)
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
      <header className="flex h-14 shrink-0 items-center gap-3 border-line border-b px-4 medium:px-6">
        <Lockup size={17} />
        <span className="text-caption text-text-3">Setup</span>
        <div className="flex-1" />
        {(index > 0 || reached > 0) && (
          <Button variant="ghost" size="sm" icon="replay" onClick={startOver}>
            Start over
          </Button>
        )}
      </header>
      <div className="mx-auto grid w-full max-w-240 flex-1 content-start gap-6 px-4 py-6 medium:px-6 medium:py-10 expanded:grid-cols-[13rem_minmax(0,1fr)] expanded:gap-10">
        {detect.status === 'success' ? (
          <Stepper
            steps={steps.map((s) => ({ id: s, label: stepLabels[s] }))}
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
              title="Can’t reach the server"
              action={<Button onClick={detect.refetch}>Try again</Button>}
            >
              {detect.error.message}
            </EmptyState>
          ) : detect.status === 'loading' || !saved.seeded ? (
            <div className="grid max-w-150 gap-4">
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
                    Back
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
                  {id === 'review' ? 'Finish setup' : 'Continue'}
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
  onOpen: (line: Line) => void
  onDone: (line: Line) => void
  update: (patch: Partial<Draft>, line?: Line) => void
  onStep: (step: StepId) => void
}) {
  const { draft, changed } = saved
  const pack = useQuery('starter-pack', (c) => c.catalog.starterPack())
  const languages = useQuery('languages', (c) => c.subtitles.languages())
  const { movies, downloads } = draft.folders
  const links = useQuery(`hardlinks:${movies}:${downloads}`, (c) =>
    c.fs.checkHardlinks(movies, downloads),
  )

  const indexerNames = draft.indexers.map((i) => pack.data?.find((d) => d.id === i)?.name ?? i)
  const languageNames = draft.subtitleLanguages.map(
    (c) => languages.data?.find((l) => l.code === c)?.name ?? c,
  )
  const asked = (s: StepId) => steps.includes(s)
  const note = (line: Line, text: string) => (changed.includes(line) ? undefined : text)

  const edit = (line: Line, patch: Partial<Draft>) => update(patch, line)

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
      label: 'Owner',
      value: (
        <>
          {draft.owner.displayName}{' '}
          <span className="font-mono text-text-3">@{draft.owner.username}</span>
        </>
      ),
      change: { step: 'owner' },
    },
    { id: 'name', label: 'Server name', value: draft.serverName, change: { step: 'owner' } },
    {
      id: 'folders',
      label: 'Folders',
      value: (
        <span className="grid font-mono text-mono">
          <span>{movies}</span>
          <span>{downloads}</span>
        </span>
      ),
      note:
        links.status === 'success' && links.data.ok
          ? links.data.sameDevice
            ? 'Same disk, so imports are hardlinked.'
            : 'Different disks, so imports are copied.'
          : undefined,
      change: asked('folders')
        ? { step: 'folders' }
        : {
            line: 'folders',
            editor: <Folders draft={draft} errors={errors} update={(p) => edit('folders', p)} />,
          },
    },
    {
      id: 'metadata',
      label: 'Movie details',
      value: draft.metadataKey.trim()
        ? `From TMDB, with your key ending in ${draft.metadataKey.trim().slice(-4)}`
        : 'From TMDB, with highsea’s key',
      change: {
        line: 'metadata',
        editor: (
          <Field
            label="Your own TMDB key"
            hint="Optional. highsea uses its own key unless you add one; yours wins."
          >
            <Input
              type="password"
              value={draft.metadataKey}
              autoComplete="off"
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
      label: 'Indexers',
      value: indexerNames.length ? indexerNames.join(', ') : 'None yet',
      note: note('indexers', 'The catalog’s public indexers. They need no account.'),
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
      label: 'Subtitles',
      value: languageNames.join(', then '),
      note: note('subtitles', 'From this browser’s languages.'),
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
      label: 'Time zone',
      value: draft.timeZone,
      note: note('timeZone', 'From this browser.'),
      change: {
        line: 'timeZone',
        editor: (
          <Field label="Time zone" hint="Schedules, history and notifications use it.">
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
      label: 'Address on your network',
      value: <span className="font-mono text-mono">{draft.address}</span>,
      note: note(
        'address',
        found.address
          ? 'This server’s address. Apps on your network find it here.'
          : 'The address you opened setup at. Apps on your network find the server here.',
      ),
      change: {
        line: 'address',
        editor: (
          <Field
            label="Address on your network"
            hint="Apps on your network connect here. Use the address of the computer highsea runs on, with its port."
            error={errors.address}
          >
            <Input
              value={draft.address}
              spellCheck={false}
              className="font-mono"
              onChange={(e) => edit('address', { address: e.target.value })}
            />
          </Field>
        ),
      },
    },
    {
      id: 'remote',
      label: 'Away from home',
      value:
        draft.remote === 'reverse-proxy'
          ? `Reverse proxy at ${draft.proxyUrl}`
          : draft.remote === 'port-forward'
            ? `Port ${draft.port}, forwarded by your router`
            : 'Only at home',
      note: note('remote', 'Nothing is opened to the internet unless you choose it.'),
      change: {
        line: 'remote',
        editor: <Remote draft={draft} errors={errors} update={(p) => edit('remote', p)} />,
      },
    },
    {
      id: 'graphics',
      label: 'Video conversion',
      value: found.graphics
        ? `${found.graphics.name}, through ${found.graphics.path}`
        : 'This computer’s processor',
      note: found.graphics
        ? 'Its check passed. You can change it in Settings › Playback.'
        : 'highsea found no graphics chip. The install guide shows how to hand one over.',
    },
    {
      id: 'cloud',
      label: 'highsea cloud',
      value: 'Not linked',
      note: 'Optional, and nothing here needs it. Linking comes in a later version.',
    },
  ]

  return (
    <ul className="grid rounded-md border border-line bg-s1">
      {rows.map((r) => {
        const change = r.change
        const editing = change && 'line' in change && open === change.line
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
                    aria-label={`Change ${r.label.toLowerCase()}`}
                  >
                    Change
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-expanded={editing}
                    aria-controls={editing ? `edit-${r.id}` : undefined}
                    onClick={() => (editing ? onDone(change.line) : onOpen(change.line))}
                    aria-label={`${editing ? 'Done with' : 'Change'} ${r.label.toLowerCase()}`}
                  >
                    {editing ? 'Done' : 'Change'}
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
}: {
  draft: Draft
  errors: Errors
  update: (patch: Partial<Draft>) => void
}) {
  const [picking, setPicking] = useState<'movies' | 'downloads' | null>(null)
  const { movies, downloads } = draft.folders
  const check = useQuery(`hardlinks:${movies}:${downloads}`, (c) =>
    c.fs.checkHardlinks(movies, downloads),
  )
  const set = (key: 'movies' | 'downloads', path: string) =>
    update({ folders: { ...draft.folders, [key]: path } })
  return (
    <>
      {(['movies', 'downloads'] as const).map((key) => (
        <Field
          key={key}
          label={key === 'movies' ? 'Movies folder' : 'Downloads folder'}
          error={errors[key]}
        >
          <div className="flex gap-2">
            <Input
              value={draft.folders[key]}
              icon="folder"
              className="flex-1 font-mono"
              spellCheck={false}
              onChange={(e) => set(key, e.target.value)}
            />
            <Button onClick={() => setPicking(key)}>Browse</Button>
          </div>
        </Field>
      ))}
      {movies && downloads && check.status === 'success' && check.data.ok && (
        <Banner
          tone={check.data.sameDevice ? 'success' : 'warning'}
          title={check.data.sameDevice ? 'Hardlinks will work' : 'Imports will be copied'}
        >
          {check.data.message}
          {!check.data.sameDevice &&
            ' To avoid it, pick a downloads folder on the same disk as your movies.'}
        </Banner>
      )}
      <PathPicker
        open={picking !== null}
        title={picking === 'downloads' ? 'Choose the downloads folder' : 'Choose the movies folder'}
        start={(picking && draft.folders[picking]) || '/data'}
        onOpenChange={(open) => !open && setPicking(null)}
        onPick={(path) => {
          if (picking) set(picking, path)
          setPicking(null)
        }}
      />
    </>
  )
}

const parentOf = (path: string) =>
  path === '/' ? null : path.slice(0, path.lastIndexOf('/')) || '/'

function PathPicker({
  open,
  title,
  start,
  onOpenChange,
  onPick,
}: {
  open: boolean
  title: string
  start: string
  onOpenChange: (open: boolean) => void
  onPick: (path: string) => void
}) {
  const [path, setPath] = useState(start)
  useEffect(() => {
    if (open) setPath(start)
  }, [open, start])
  const list = useQuery(`fs:${path}`, (c) => c.fs.list(path))
  const crumbs = path === '/' ? ['/'] : ['/', ...path.split('/').filter(Boolean)]
  const up = parentOf(path)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={title}
        description="Folders on the server, not on this device."
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => onPick(path)}
              disabled={list.status === 'error'}
            >
              Use this folder
            </Button>
          </>
        }
      >
        <nav
          aria-label="Folder path"
          className="flex flex-wrap items-center gap-1 font-mono text-mono"
        >
          {crumbs.map((c, i) => {
            const to = i === 0 ? '/' : `/${crumbs.slice(1, i + 1).join('/')}`
            const last = i === crumbs.length - 1
            return (
              <span key={to} className="flex items-center gap-1">
                {i > 1 && <span className="text-text-3">/</span>}
                {last ? (
                  <span aria-current="location" className="text-text">
                    {c}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPath(to)}
                    className="rounded-[4px] px-0.5 text-text-2 hover:bg-s4 hover:text-text"
                  >
                    {c}
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
            <EmptyState size="sm" tone="error" title="Can’t open this folder">
              {list.error.message}
            </EmptyState>
          ) : (
            <ul className="grid grid-cols-[minmax(0,1fr)] p-1">
              {up && (
                <li>
                  <FolderRow icon="chevron-up" label="Up one level" onClick={() => setPath(up)} />
                </li>
              )}
              {list.data.map((f) => (
                <li key={f.path}>
                  <FolderRow icon="folder" label={f.name} onClick={() => setPath(f.path)} />
                </li>
              ))}
              {list.data.length === 0 && (
                <li className="px-3 py-6 text-center text-caption text-text-3">
                  No folders inside. Use this one, or go up a level.
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
  const pack = useQuery('starter-pack', (c) => c.catalog.starterPack())
  if (pack.status === 'loading')
    return (
      <div className="grid gap-2">
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
        title="Couldn’t load the catalog"
        action={<Button onClick={pack.refetch}>Try again</Button>}
      >
        {pack.error.message} You can skip this and add indexers later.
      </EmptyState>
    )
  return (
    <ul className="grid gap-2">
      {pack.data.map((d) => {
        const on = selected.includes(d.id)
        const needsAccount = d.privacy !== 'public'
        return (
          <li key={d.id}>
            <Field
              inline
              label={
                <span className="flex flex-wrap items-center gap-2 text-text">
                  {d.name}
                  {needsAccount && <Badge tone="neutral">Needs an account</Badge>}
                </span>
              }
              hint={d.description}
              className="rounded-md border border-line bg-s2 p-3"
            >
              <Checkbox
                checked={on}
                onCheckedChange={(v) =>
                  onChange(v ? [...selected, d.id] : selected.filter((x) => x !== d.id))
                }
              />
            </Field>
          </li>
        )
      })}
    </ul>
  )
}

// ---------------------------------------------------------------- subtitles

function Languages({
  selected,
  error,
  onChange,
}: {
  selected: string[]
  error?: string
  onChange: (codes: string[]) => void
}) {
  const languages = useQuery('languages', (c) => c.subtitles.languages())
  if (languages.status === 'loading') return <Skeleton className="h-24" />
  if (languages.status === 'error')
    return (
      <EmptyState
        size="sm"
        tone="error"
        title="Couldn’t load the languages"
        action={<Button onClick={languages.refetch}>Try again</Button>}
      >
        {languages.error.message}
      </EmptyState>
    )
  const name = (code: string) => languages.data.find((l) => l.code === code)?.name ?? code
  return (
    <div className="grid gap-3">
      <fieldset className="grid gap-2">
        <legend className="mb-2 font-medium text-[13px] text-text-2">Subtitle languages</legend>
        <div className="flex flex-wrap gap-2">
          {languages.data.map((l) => {
            const on = selected.includes(l.code)
            return (
              <button
                key={l.code}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  onChange(on ? selected.filter((c) => c !== l.code) : [...selected, l.code])
                }
                className={cn(
                  'flex h-8 items-center gap-1.5 rounded-full border px-3 text-ui transition-tint',
                  on
                    ? 'border-accent bg-accent-soft text-accent-text'
                    : 'border-line-strong text-text-2 hover:bg-s2 hover:text-text',
                )}
              >
                {on && <Icon name="check" size={14} />}
                {l.name}
              </button>
            )
          })}
        </div>
      </fieldset>
      {error ? (
        <p role="alert" className="flex items-start gap-1.5 text-badge-danger text-caption">
          <Icon name="alert" size={14} className="mt-px shrink-0" />
          {error}
        </p>
      ) : (
        <p className="text-caption text-text-3" aria-live="polite">
          {selected.length === 1
            ? `${name(selected[0] ?? '')} only.`
            : `${selected.map(name).join(', then ')}, in that order. The first is preferred.`}
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- remote access

const remoteOptions: { kind: RemoteAccess['kind']; title: string; detail: string }[] = [
  {
    kind: 'local-only',
    title: 'Only at home',
    detail: 'Apps connect on this network. Nothing is opened to the internet.',
  },
  {
    kind: 'reverse-proxy',
    title: 'Through my reverse proxy',
    detail: 'You already serve it at an address of your own, such as Caddy or Traefik with HTTPS.',
  },
  {
    kind: 'port-forward',
    title: 'Forward a port on my router',
    detail:
      'highsea asks your router to forward this port, using UPnP or NAT-PMP, and serves HTTPS on it. If the router doesn’t answer, Health says how to forward it yourself.',
  },
]

function Remote({
  draft,
  errors,
  update,
}: {
  draft: Draft
  errors: Errors
  update: (patch: Partial<Draft>) => void
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="sr-only">Away from home</legend>
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
              <span className="font-semibold text-text text-ui">{o.title}</span>
              <span className="col-start-2 text-caption text-text-2">{o.detail}</span>
            </label>
            {on && o.kind === 'reverse-proxy' && (
              <Field label="Public address" error={errors.proxyUrl} className="ps-7">
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
                label="Port"
                hint="The TCP port your router forwards to this server."
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

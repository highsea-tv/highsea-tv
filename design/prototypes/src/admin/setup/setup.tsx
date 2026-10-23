// SPDX-License-Identifier: AGPL-3.0-only
// A2 Setup wizard (docs/product/setup.md). First run, before anyone has signed in: name the
// server, create the owner, pick folders, add indexers and subtitle languages, choose remote
// access and the optional highsea cloud link, then review and finish on the dashboard. Progress
// is kept in the browser, so a reload picks up where you left off.
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
  Skeleton,
  type Step,
  Stepper,
  Switch,
  toast,
} from '@highsea-tv/ui-web'
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import { useAction, useQuery } from '../../mock/hooks.tsx'
import type { RemoteAccess, SetupInput } from '../../mock/types.ts'

const steps: Step[] = [
  { id: 'name', label: 'Server name' },
  { id: 'owner', label: 'Owner account' },
  { id: 'folders', label: 'Media folders' },
  { id: 'indexers', label: 'Indexers' },
  { id: 'subtitles', label: 'Subtitles' },
  { id: 'remote', label: 'Remote access' },
  { id: 'cloud', label: 'highsea cloud' },
  { id: 'review', label: 'Review' },
]

type Draft = Omit<SetupInput, 'owner' | 'remoteAccess'> & {
  owner: SetupInput['owner'] & { confirm: string }
  remote: RemoteAccess['kind']
  proxyUrl: string
  port: string
}

// the server detects the usual container layout and suggests it
const initial: Draft = {
  serverName: '',
  owner: { displayName: '', username: '', password: '', confirm: '' },
  folders: { movies: '/data/media/movies', downloads: '/data/downloads' },
  indexers: [],
  subtitleLanguages: ['en'],
  cloudLink: false,
  remote: 'local-only',
  proxyUrl: '',
  port: '8484',
}

type Saved = { step: number; reached: number; draft: Draft; indexersSeeded: boolean }
const storageKey = 'highsea-proto:setup'

function load(): Saved | null {
  try {
    const raw = localStorage.getItem(storageKey)
    return raw ? (JSON.parse(raw) as Saved) : null
  } catch {
    return null
  }
}

function persist(saved: Saved | null) {
  try {
    if (saved) localStorage.setItem(storageKey, JSON.stringify(saved))
    else localStorage.removeItem(storageKey)
  } catch {
    // private mode: progress just isn't remembered
  }
}

type Errors = Partial<Record<string, string>>

function validate(step: string, d: Draft): Errors {
  const e: Errors = {}
  if (step === 'name' && !d.serverName.trim()) e.serverName = 'Give the server a name.'
  if (step === 'owner') {
    if (!d.owner.displayName.trim()) e.displayName = 'Enter your name.'
    if (!/^[a-z0-9._-]{2,32}$/.test(d.owner.username))
      e.username = 'Use 2 to 32 lowercase letters, numbers, dots, dashes or underscores.'
    if (d.owner.password.length < 10) e.password = 'Use at least 10 characters.'
    else if (d.owner.confirm !== d.owner.password) e.confirm = 'The passwords don’t match.'
  }
  if (step === 'folders') {
    if (!d.folders.movies) e.movies = 'Pick a folder for movies.'
    if (!d.folders.downloads) e.downloads = 'Pick a folder for downloads.'
    if (d.folders.movies && d.folders.movies === d.folders.downloads)
      e.downloads = 'Use a different folder from the movies folder.'
  }
  if (step === 'subtitles' && d.subtitleLanguages.length === 0)
    e.languages = 'Pick at least one language, or turn subtitles off later in Settings.'
  if (step === 'remote') {
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
  cloudLink: d.cloudLink,
})

// ---------------------------------------------------------------- the wizard

export function Setup() {
  const [, navigate] = useLocation()
  const [saved, setSaved] = useState<Saved>(
    () => load() ?? { step: 0, reached: 0, draft: initial, indexersSeeded: false },
  )
  const [errors, setErrors] = useState<Errors>({})
  const heading = useRef<HTMLHeadingElement>(null)
  const first = useRef(true)
  const complete = useAction((c, input: SetupInput) => c.setup.complete(input))
  const { step, reached, draft } = saved
  const id = steps[step]?.id ?? 'name'

  useEffect(() => persist(saved), [saved])
  useEffect(() => {
    document.title = 'Set up highsea'
  }, [])
  // each step moves focus to its heading, so a screen reader hears where it is
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on step change
  useEffect(() => {
    if (first.current) first.current = false
    else heading.current?.focus()
  }, [step])

  const update = (patch: Partial<Draft>) =>
    setSaved((s) => ({ ...s, draft: { ...s.draft, ...patch } }))
  const go = (to: number) => {
    setErrors({})
    setSaved((s) => ({ ...s, step: to, reached: Math.max(s.reached, to) }))
  }

  const next = async (e?: FormEvent) => {
    e?.preventDefault()
    const found = validate(id, draft)
    setErrors(found)
    if (Object.keys(found).length) return
    if (id !== 'review') return go(step + 1)
    try {
      const server = await complete.run(toInput(draft))
      persist(null)
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
    setSaved({ step: 0, reached: 0, draft: initial, indexersSeeded: false })
  }

  const body: Record<string, { title: string; detail: ReactNode; content: ReactNode }> = {
    name: {
      title: 'Name your server',
      detail: 'Everyone who connects sees this name. You can change it later in Settings.',
      content: (
        <Field label="Server name" error={errors.serverName}>
          <Input
            value={draft.serverName}
            placeholder="Harbor"
            autoComplete="off"
            onChange={(e) => update({ serverName: e.target.value })}
          />
        </Field>
      ),
    },
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
          <div className="grid gap-4 medium:grid-cols-2">
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
          <p className="text-caption text-text-3">
            You can turn on two-factor sign-in and passkeys in Settings › Security.
          </p>
        </>
      ),
    },
    folders: {
      title: 'Choose your folders',
      detail:
        'Movies is where your library lives. Downloads is where torrents land before they’re imported.',
      content: <Folders draft={draft} errors={errors} update={update} />,
    },
    indexers: {
      title: 'Add indexers',
      detail:
        'Indexers are the sites highsea searches for releases. These public ones need no account. Add private ones from the catalog later.',
      content: (
        <Indexers
          selected={draft.indexers}
          seeded={saved.indexersSeeded}
          onChange={(indexers, seeded) =>
            setSaved((s) => ({ ...s, indexersSeeded: seeded, draft: { ...s.draft, indexers } }))
          }
        />
      ),
    },
    subtitles: {
      title: 'Subtitle languages',
      detail:
        'highsea finds subtitles in these languages and syncs them to each movie. The first one is preferred.',
      content: (
        <Languages
          selected={draft.subtitleLanguages}
          error={errors.languages}
          onChange={(subtitleLanguages) => update({ subtitleLanguages })}
        />
      ),
    },
    remote: {
      title: 'Watching away from home',
      detail:
        'Choose how apps reach this server from outside your network. You can change it later.',
      content: <Remote draft={draft} errors={errors} update={update} />,
    },
    cloud: {
      title: 'Link to highsea cloud',
      detail:
        'Optional. Everything works without it: the cloud only adds conveniences, and your library never leaves this server.',
      content: (
        <div className="grid gap-4">
          <Field
            inline
            label="Link this server to highsea cloud"
            hint="Off by default. You can link or unlink it any time in Settings."
          >
            <Switch
              checked={draft.cloudLink}
              onCheckedChange={(cloudLink) => update({ cloudLink })}
            />
          </Field>
          <ul className="grid gap-2 rounded-md border border-line bg-s2 p-4 text-caption text-text-2">
            <CloudPoint icon="globe">
              Apps find this server from anywhere, without a port or a proxy.
            </CloudPoint>
            <CloudPoint icon="notification">
              Push notifications on phones, without running your own relay.
            </CloudPoint>
            <CloudPoint icon="movie">Movie details without your own TMDB key.</CloudPoint>
            <CloudPoint icon="lock">
              The cloud sees your server’s address and account email, never your library or what you
              watch.
            </CloudPoint>
          </ul>
        </div>
      ),
    },
    review: {
      title: 'Check and finish',
      detail: 'Everything here can be changed later in Settings.',
      content: <Review draft={draft} onEdit={go} />,
    },
  }
  const current = body[id] ?? body.name

  return (
    <div className="flex min-h-screen flex-col bg-bg text-text">
      <header className="flex h-14 shrink-0 items-center gap-3 border-line border-b px-4 medium:px-6">
        <Lockup size={17} />
        <span className="text-caption text-text-3">Setup</span>
        <div className="flex-1" />
        {(step > 0 || reached > 0) && (
          <Button variant="ghost" size="sm" icon="replay" onClick={startOver}>
            Start over
          </Button>
        )}
      </header>
      <div className="mx-auto grid w-full max-w-240 flex-1 content-start gap-6 px-4 py-6 medium:px-6 medium:py-10 expanded:grid-cols-[13rem_minmax(0,1fr)] expanded:gap-10">
        <Stepper steps={steps} current={step} reached={reached} onSelect={go} />
        <main className="min-w-0">
          <form onSubmit={next} noValidate className="grid max-w-150 gap-6">
            <div className="grid gap-1.5">
              <h1 ref={heading} tabIndex={-1} className="text-heading outline-none">
                {current?.title}
              </h1>
              <p className="text-body text-text-2">{current?.detail}</p>
            </div>
            <div className="grid gap-4">{current?.content}</div>
            <div className="flex flex-wrap items-center gap-2 border-line border-t pt-5">
              {step > 0 && (
                <Button variant="ghost" icon="arrow-left" onClick={() => go(step - 1)}>
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
        </main>
      </div>
    </div>
  )
}

function CloudPoint({
  icon,
  children,
}: {
  icon: 'globe' | 'notification' | 'movie' | 'lock'
  children: ReactNode
}) {
  return (
    <li className="flex items-start gap-2.5">
      <Icon name={icon} size={16} className="mt-px shrink-0 text-text-3" />
      {children}
    </li>
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
        start={picking ? draft.folders[picking] : '/'}
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
            <ul className="grid p-1">
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
  seeded,
  onChange,
}: {
  selected: string[]
  seeded: boolean
  onChange: (ids: string[], seeded: boolean) => void
}) {
  const pack = useQuery('starter-pack', (c) => c.catalog.starterPack())
  // the public starters start switched on, once
  // biome-ignore lint/correctness/useExhaustiveDependencies: seeds once, when the pack arrives
  useEffect(() => {
    if (!seeded && pack.status === 'success')
      onChange(
        pack.data.filter((d) => d.privacy === 'public').map((d) => d.id),
        true,
      )
  }, [pack.status, seeded])

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
              className="rounded-md border border-line bg-s1 p-3"
            >
              <Checkbox
                checked={on}
                onCheckedChange={(v) =>
                  onChange(v ? [...selected, d.id] : selected.filter((x) => x !== d.id), true)
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
        <legend className="mb-2 font-medium text-[13px] text-text-2">Languages</legend>
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
            : `${selected.map(name).join(', then ')}, in that order.`}
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
    detail: 'highsea serves HTTPS on a port you forward. It checks the port is reachable.',
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
      <legend className="sr-only">Remote access</legend>
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
                hint="Forward this TCP port on your router to this server."
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

// ---------------------------------------------------------------- review

function Review({ draft, onEdit }: { draft: Draft; onEdit: (step: number) => void }) {
  const pack = useQuery('starter-pack', (c) => c.catalog.starterPack())
  const languages = useQuery('languages', (c) => c.subtitles.languages())
  const indexerNames = draft.indexers.map((i) => pack.data?.find((d) => d.id === i)?.name ?? i)
  const languageNames = draft.subtitleLanguages.map(
    (c) => languages.data?.find((l) => l.code === c)?.name ?? c,
  )
  const rows: { step: string; label: string; value: ReactNode }[] = [
    { step: 'name', label: 'Server name', value: draft.serverName },
    {
      step: 'owner',
      label: 'Owner',
      value: (
        <>
          {draft.owner.displayName}{' '}
          <span className="font-mono text-text-3">@{draft.owner.username}</span>
        </>
      ),
    },
    {
      step: 'folders',
      label: 'Folders',
      value: (
        <span className="grid font-mono text-mono">
          <span>{draft.folders.movies}</span>
          <span>{draft.folders.downloads}</span>
        </span>
      ),
    },
    {
      step: 'indexers',
      label: 'Indexers',
      value: indexerNames.length ? indexerNames.join(', ') : 'None yet',
    },
    { step: 'subtitles', label: 'Subtitles', value: languageNames.join(', ') },
    {
      step: 'remote',
      label: 'Remote access',
      value:
        draft.remote === 'reverse-proxy'
          ? `Reverse proxy at ${draft.proxyUrl}`
          : draft.remote === 'port-forward'
            ? `Port ${draft.port}, forwarded`
            : 'Only at home',
    },
    { step: 'cloud', label: 'highsea cloud', value: draft.cloudLink ? 'Linked' : 'Not linked' },
  ]
  return (
    <dl className="grid rounded-md border border-line bg-s1">
      {rows.map((r) => (
        <div
          key={r.step}
          className="grid grid-cols-[1fr_auto] items-start gap-x-3 gap-y-0.5 border-line border-b px-4 py-3 last:border-b-0 medium:grid-cols-[10rem_1fr_auto]"
        >
          <dt className="text-caption text-text-3 medium:pt-0.5">{r.label}</dt>
          <dd className="col-start-1 min-w-0 break-words text-text text-ui medium:col-start-2 medium:row-start-1">
            {r.value}
          </dd>
          <dd className="col-start-2 row-span-2 row-start-1 medium:col-start-3 medium:row-span-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(steps.findIndex((s) => s.id === r.step))}
              aria-label={`Change ${r.label.toLowerCase()}`}
            >
              Change
            </Button>
          </dd>
        </div>
      ))}
    </dl>
  )
}

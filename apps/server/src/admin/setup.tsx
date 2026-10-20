'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// A2 Setup wizard (docs/product/setup.md), ported from the prototype. First run, before anyone has
// signed in: name the server, create the owner, add a TMDB key (checkpoint 4; skippable), pick
// folders, choose remote access and the optional highsea cloud link, then review and finish on the
// dashboard. The indexer and subtitle steps arrive with their packages. Progress is kept in the
// browser so a reload picks up where you left off, except the password and the TMDB key, which
// never go into storage (OWASP HTML5 Security Cheat Sheet: no sensitive data in localStorage).
import type { SetupInput } from '@highsea/api-contract'
import { useT } from '@highsea/i18n/react'
import type { ApiError } from '@highsea/sdk'
import { useAction, useQuery } from '@highsea/sdk/react'
import {
  Banner,
  Button,
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
} from '@highsea/ui-web'
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { TmdbNotice } from './attribution.tsx'
import {
  errorReason,
  keyRejected,
  metadataLocale,
  TMDB_KEY_PAGE,
  tmdbBusy,
} from './metadata-locale.ts'
import { setup as messages } from './setup-messages.ts'

type StepId = 'name' | 'owner' | 'metadata' | 'folders' | 'remote' | 'cloud' | 'review'
const STEP_IDS: StepId[] = ['name', 'owner', 'metadata', 'folders', 'remote', 'cloud', 'review']
type Remote = SetupInput['remoteAccess']['kind']

type Draft = {
  serverName: string
  owner: { displayName: string; username: string; password: string; confirm: string }
  /** The TMDB key as typed. Never stored; `keyChecked` remembers that TMDB accepted one. */
  metadataKey: string
  keyChecked: boolean
  folders: { movies: string; downloads: string }
  remote: Remote
  proxyUrl: string
  port: string
  cloudLink: boolean
}

const blank: Draft = {
  serverName: '',
  owner: { displayName: '', username: '', password: '', confirm: '' },
  metadataKey: '',
  keyChecked: false,
  folders: { movies: '', downloads: '' },
  remote: 'local-only',
  proxyUrl: '',
  port: '8484',
  cloudLink: false,
}

type Saved = { step: number; reached: number; draft: Draft }
const storageKey = 'highsea:setup'

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
    if (!saved) return localStorage.removeItem(storageKey)
    const { password: _, confirm: __, ...owner } = saved.draft.owner
    const { metadataKey: ___, ...draft } = saved.draft
    localStorage.setItem(storageKey, JSON.stringify({ ...saved, draft: { ...draft, owner } }))
  } catch {
    // private mode: progress just isn't remembered
  }
}

type Errors = Partial<Record<string, string>>
type T = ReturnType<typeof useT<typeof messages>>

function validate(step: StepId, d: Draft, t: T): Errors {
  const e: Errors = {}
  if (step === 'name' && !d.serverName.trim()) e.serverName = t('name.missing')
  if (step === 'owner') {
    if (!d.owner.displayName.trim()) e.displayName = t('owner.nameMissing')
    if (!/^[a-z0-9._-]{2,32}$/.test(d.owner.username)) e.username = t('owner.usernameInvalid')
    if (d.owner.password.length < 10) e.password = t('owner.short')
    else if (d.owner.confirm !== d.owner.password) e.confirm = t('owner.mismatch')
  }
  if (step === 'metadata' && !d.metadataKey.trim()) e.metadataKey = t('metadata.missing')
  if (step === 'folders') {
    if (!d.folders.movies) e.movies = t('folders.moviesMissing')
    if (!d.folders.downloads) e.downloads = t('folders.downloadsMissing')
    if (d.folders.movies && d.folders.movies === d.folders.downloads)
      e.downloads = t('folders.same')
  }
  if (step === 'remote') {
    if (d.remote === 'reverse-proxy' && !/^https:\/\/[^\s/]+/.test(d.proxyUrl))
      e.proxyUrl = t('remote.addressInvalid')
    const port = Number(d.port)
    if (d.remote === 'port-forward' && !(Number.isInteger(port) && port >= 1024 && port <= 65535))
      e.port = t('remote.portInvalid')
  }
  return e
}

/** Where a field the server refused lives: its step and the error's key. */
const FIELDS: Record<string, [StepId, string]> = {
  serverName: ['name', 'serverName'],
  displayName: ['owner', 'displayName'],
  username: ['owner', 'username'],
  password: ['owner', 'password'],
  'metadata.key': ['metadata', 'metadataKey'],
  'folders.movies': ['folders', 'movies'],
  'folders.downloads': ['folders', 'downloads'],
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
  remoteAccess:
    d.remote === 'reverse-proxy'
      ? { kind: 'reverse-proxy', url: d.proxyUrl }
      : d.remote === 'port-forward'
        ? { kind: 'port-forward', port: Number(d.port) }
        : { kind: 'local-only' },
  cloudLink: d.cloudLink,
  // the owner's locale for the metadata language and region (decision 5), with the key if added
  metadata: {
    ...metadataLocale(typeof navigator === 'undefined' ? undefined : navigator.language),
    ...(d.metadataKey.trim() ? { key: d.metadataKey.trim() } : {}),
  },
})

// ---------------------------------------------------------------- the wizard

export function Setup() {
  const t = useT(messages)
  const defaults = useQuery('setup-defaults', (c) => c.setup.defaults())
  const [saved, setSaved] = useState<Saved>({ step: 0, reached: 0, draft: blank })
  const [restored, setRestored] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  const heading = useRef<HTMLHeadingElement>(null)
  const first = useRef(true)
  const complete = useAction((c, input: SetupInput) => c.setup.complete({ body: input }))
  const checkKey = useAction((c, key: string) => c.setup.checkMetadataKey({ body: { key } }))
  const { step, reached, draft } = saved
  const id = STEP_IDS[step] ?? 'name'
  const steps: Step[] = STEP_IDS.map((s) => ({ id: s, label: t(`step.${s}`) }))

  // what was kept, or the server's suggestions, once the browser and the server have answered
  useEffect(() => {
    if (restored || defaults.status !== 'success') return
    const kept = load()
    const d = defaults.data
    setSaved(
      kept
        ? {
            ...kept,
            draft: { ...blank, ...kept.draft, owner: { ...blank.owner, ...kept.draft.owner } },
          }
        : { step: 0, reached: 0, draft: { ...blank, serverName: '', folders: d.folders } },
    )
    setRestored(true)
  }, [defaults.status, defaults.data, restored])

  useEffect(() => {
    if (restored) persist(saved)
  }, [saved, restored])
  // each step moves focus to its heading, so a screen reader hears where it is
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on step change
  useEffect(() => {
    if (first.current) first.current = false
    else heading.current?.focus()
  }, [step])

  const update = (patch: Partial<Draft>) =>
    setSaved((s) => ({ ...s, draft: { ...s.draft, ...patch } }))
  const goTo = (to: number) => {
    setErrors({})
    setSaved((s) => ({ ...s, step: to, reached: Math.max(s.reached, to) }))
  }

  const next = async (e?: FormEvent) => {
    e?.preventDefault()
    const found = validate(id, draft, t)
    setErrors(found)
    if (Object.keys(found).length) return
    if (id === 'metadata') {
      // checked with TMDB now, so a mistyped key is caught here and not after Finish
      const key = draft.metadataKey.trim()
      try {
        await checkKey.run(key)
      } catch (err) {
        const reason = errorReason(err)
        return setErrors({
          metadataKey: keyRejected(reason)
            ? t('metadata.rejected')
            : tmdbBusy(reason)
              ? t('metadata.unavailable')
              : (err as Error).message,
        })
      }
      update({ metadataKey: key, keyChecked: true })
      return goTo(step + 1)
    }
    if (id !== 'review') return goTo(step + 1)
    // after a reload the password is gone: ask for it again
    const owner = validate('owner', draft, t)
    if (Object.keys(owner).length) {
      goTo(STEP_IDS.indexOf('owner'))
      setErrors({ ...owner, password: owner.password && t('owner.forgotten') })
      return
    }
    // a key TMDB accepted before a reload is gone too: ask for it, or let it be skipped
    if (draft.keyChecked && !draft.metadataKey.trim()) {
      goTo(STEP_IDS.indexOf('metadata'))
      setErrors({ metadataKey: t('metadata.forgotten') })
      return
    }
    try {
      const result = await complete.run(toInput(draft))
      persist(null)
      toast.success(t('ready', { name: result.server.name }), { description: t('readyBody') })
      // a fresh load: the server components see the owner's new session
      window.location.assign('/')
    } catch (err) {
      const field = ((err as ApiError).details as { field?: string } | undefined)?.field
      const at = field ? FIELDS[field] : undefined
      if (at) {
        goTo(STEP_IDS.indexOf(at[0]))
        setErrors({ [at[1]]: (err as Error).message })
      } else toast.error(t('failed'), { description: (err as Error).message })
    }
  }

  /** "Add it later in Settings": no key, and on to the next step. */
  const skipKey = () => {
    update({ metadataKey: '', keyChecked: false })
    goTo(step + 1)
  }

  const startOver = () => {
    setErrors({})
    setSaved({
      step: 0,
      reached: 0,
      draft: { ...blank, folders: defaults.data?.folders ?? blank.folders },
    })
  }

  const body: Record<StepId, { title: string; detail: ReactNode; content: ReactNode }> = {
    name: {
      title: t('name.title'),
      detail: t('name.detail'),
      content: (
        <Field label={t('name.label')} error={errors.serverName}>
          <Input
            value={draft.serverName}
            placeholder="Harbor"
            autoComplete="off"
            maxLength={60}
            onChange={(e) => update({ serverName: e.target.value })}
          />
        </Field>
      ),
    },
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
          <div className="grid gap-4 medium:grid-cols-2">
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
          <p className="text-caption text-text-3">{t('owner.later')}</p>
        </>
      ),
    },
    metadata: {
      title: t('metadata.title'),
      detail: t('metadata.detail'),
      content: (
        <MetadataKey
          value={draft.metadataKey}
          error={errors.metadataKey}
          onChange={(metadataKey) => update({ metadataKey, keyChecked: false })}
        />
      ),
    },
    folders: {
      title: t('folders.title'),
      detail: t('folders.detail'),
      content: (
        <Folders
          draft={draft}
          errors={errors}
          update={update}
          root={defaults.data?.dataDir ?? '/'}
        />
      ),
    },
    remote: {
      title: t('remote.title'),
      detail: t('remote.detail'),
      content: <RemoteAccess draft={draft} errors={errors} update={update} />,
    },
    cloud: {
      title: t('cloud.title'),
      detail: t('cloud.detail'),
      content: (
        <div className="grid gap-4">
          <Field inline label={t('cloud.label')} hint={t('cloud.hint')}>
            <Switch
              checked={draft.cloudLink}
              onCheckedChange={(cloudLink) => update({ cloudLink })}
            />
          </Field>
          <ul className="grid gap-2 rounded-md border border-line bg-s2 p-4 text-caption text-text-2">
            <CloudPoint icon="globe">{t('cloud.find')}</CloudPoint>
            <CloudPoint icon="notification">{t('cloud.push')}</CloudPoint>
            <CloudPoint icon="movie">{t('cloud.tmdb')}</CloudPoint>
            <CloudPoint icon="lock">{t('cloud.privacy')}</CloudPoint>
          </ul>
        </div>
      ),
    },
    review: {
      title: t('review.title'),
      detail: t('review.detail'),
      content: <Review draft={draft} onEdit={goTo} />,
    },
  }
  const current = body[id]

  return (
    <div className="flex min-h-screen flex-col bg-bg text-text">
      <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-line border-b px-4 py-2 medium:px-6">
        <Lockup size={17} />
        <span className="text-caption text-text-3">{t('label')}</span>
        <div className="flex-1" />
        {(step > 0 || reached > 0) && (
          <Button variant="ghost" size="sm" icon="replay" onClick={startOver}>
            {t('startOver')}
          </Button>
        )}
      </header>
      <div className="mx-auto grid w-full max-w-240 flex-1 content-start gap-6 px-4 py-6 medium:px-6 medium:py-10 expanded:grid-cols-[13rem_minmax(0,1fr)] expanded:gap-10">
        <Stepper steps={steps} current={step} reached={reached} onSelect={goTo} />
        <main className="min-w-0">
          {!restored ? (
            <div aria-busy className="grid max-w-150 gap-4">
              <Skeleton className="h-8 w-60" />
              <Skeleton className="h-10" />
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
                {step > 0 && (
                  <Button variant="ghost" icon="arrow-left" onClick={() => goTo(step - 1)}>
                    {t('back')}
                  </Button>
                )}
                <div className="flex-1" />
                {id === 'metadata' && (
                  <Button variant="ghost" onClick={skipKey} disabled={checkKey.pending}>
                    {t('metadata.skip')}
                  </Button>
                )}
                <Button
                  type="submit"
                  variant="primary"
                  iconEnd={id === 'review' ? undefined : 'arrow-right'}
                  icon={id === 'review' ? 'check' : undefined}
                  loading={complete.pending || checkKey.pending}
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

// ---------------------------------------------------------------- the TMDB key

/** The key step: the field, where TMDB shows the key, why highsea asks, and TMDB's notice. */
function MetadataKey({
  value,
  error,
  onChange,
}: {
  value: string
  error?: string
  onChange: (key: string) => void
}) {
  const t = useT(messages)
  return (
    <>
      <Field label={t('metadata.label')} hint={t('metadata.hint')} error={error}>
        <Input
          value={value}
          type="password"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className="font-mono"
          onChange={(e) => onChange(e.target.value)}
        />
      </Field>
      <a
        href={TMDB_KEY_PAGE}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1.5 justify-self-start rounded-sm text-accent-text text-ui outline-none hover:underline focus-visible:ring-focus"
      >
        {t('metadata.open')}
        <Icon name="external" size={14} />
      </a>
      <div className="grid gap-3 rounded-md border border-line bg-s2 p-4 text-caption text-text-2">
        <p>{t('metadata.why')}</p>
        <TmdbNotice />
      </div>
    </>
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
              <span key={c.to} className="flex items-center gap-1">
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
            <ul className="grid p-1">
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

// ---------------------------------------------------------------- review

function Review({ draft, onEdit }: { draft: Draft; onEdit: (step: number) => void }) {
  const t = useT(messages)
  const rows: { step: StepId; label: string; value: ReactNode }[] = [
    { step: 'name', label: t('step.name'), value: draft.serverName },
    {
      step: 'owner',
      label: t('review.owner'),
      value: (
        <>
          {draft.owner.displayName}{' '}
          <span className="font-mono text-text-3">@{draft.owner.username}</span>
        </>
      ),
    },
    {
      step: 'metadata',
      label: t('review.metadata'),
      value: draft.metadataKey.trim()
        ? t('review.keyAdded', { last4: draft.metadataKey.trim().slice(-4) })
        : t('review.keyLater'),
    },
    {
      step: 'folders',
      label: t('review.folders'),
      value: (
        <span className="grid font-mono text-mono [overflow-wrap:anywhere]">
          <span>{draft.folders.movies}</span>
          <span>{draft.folders.downloads}</span>
        </span>
      ),
    },
    {
      step: 'remote',
      label: t('step.remote'),
      value:
        draft.remote === 'reverse-proxy'
          ? t('review.remoteProxy', { url: draft.proxyUrl })
          : draft.remote === 'port-forward'
            ? t('review.remotePort', { port: draft.port })
            : t('remote.local'),
    },
    {
      step: 'cloud',
      label: t('step.cloud'),
      value: draft.cloudLink ? t('review.linked') : t('review.notLinked'),
    },
  ]
  return (
    <dl className="grid rounded-md border border-line bg-s1">
      {rows.map((r) => (
        <div
          key={r.step}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-0.5 border-line border-b px-4 py-3 last:border-b-0 medium:grid-cols-[10rem_minmax(0,1fr)_auto]"
        >
          <dt className="text-caption text-text-3 medium:pt-0.5">{r.label}</dt>
          <dd className="col-start-1 min-w-0 break-words text-text text-ui medium:col-start-2 medium:row-start-1">
            {r.value}
          </dd>
          <dd className="col-start-2 row-span-2 row-start-1 medium:col-start-3 medium:row-span-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(STEP_IDS.indexOf(r.step))}
              aria-label={t('review.changeLabel', { what: r.label.toLowerCase() })}
            >
              {t('review.change')}
            </Button>
          </dd>
        </div>
      ))}
    </dl>
  )
}

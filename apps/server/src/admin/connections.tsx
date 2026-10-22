'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Connections (settings.md; checkpoint 8b, ADR 0046), ported from the prototype's
// Connections (design/prototypes/src/admin/settings/reference.tsx). Each connection keeps the
// prototype's row (on, name and kind, its events, Test), and real data adds when it last sent or
// why it didn't, Edit and Remove, and the Server's mail switch on an email connection. The
// prototype's Add a connection grid ("Soon" in Phase 2) opens a dialog for that kind, like Import
// lists' Add a list: its fields with secrets masked, the events as checkboxes, Test and Save. Matrix
// and Browser join the prototype's kinds. This browser is a group of its own: turning on web push
// (a service worker, `public/sw.js`, and PushManager.subscribe with the server's VAPID key) and
// listing your browsers that get notifications. Changes save at once through `connections.*`.
import {
  CONNECTION_KINDS,
  CONNECTIONS_TOPICS,
  type Connection,
  type ConnectionInput,
  type ConnectionTest,
  NOTIFICATION_EVENTS,
} from '@highsea/api-contract'
import type { T as Translate } from '@highsea/i18n'
import { useT } from '@highsea/i18n/react'
import { useAction, useClient, useQuery } from '@highsea/sdk/react'
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  Dialog,
  DialogContent,
  EmptyState,
  Field,
  Input,
  Select,
  Switch,
  toast,
} from '@highsea/ui-web'
import { useEffect, useState } from 'react'
import { connections as messages } from './connections-messages.ts'
import { Loadable } from './loadable.tsx'
import { AreaPage, Group } from './settings.tsx'
import { useRelative } from './time.ts'

type T = Translate<typeof messages>
type Kind = (typeof CONNECTION_KINDS)[number]
type Event = (typeof NOTIFICATION_EVENTS)[number]
type HintKey = Extract<keyof typeof messages, `hint.${string}`>

const TOPICS = [CONNECTIONS_TOPICS.connections]

// ---------------------------------------------------------------- each kind's fields

type FieldKey =
  | 'webhookUrl'
  | 'username'
  | 'botToken'
  | 'chatId'
  | 'silent'
  | 'serverUrl'
  | 'topic'
  | 'token'
  | 'password'
  | 'priority'
  | 'appToken'
  | 'userKey'
  | 'device'
  | 'homeserverUrl'
  | 'accessToken'
  | 'roomId'
  | 'url'
  | 'method'
  | 'key'
  | 'urls'
  | 'tag'
  | 'host'
  | 'port'
  | 'security'
  | 'from'
  | 'to'

type Spec = {
  key: FieldKey
  /** A secret comes back masked; sent back masked, it keeps its value. */
  type: 'text' | 'url' | 'secret' | 'secret-url' | 'number' | 'switch' | 'select'
  required?: boolean
  options?: readonly string[]
  min?: number
  max?: number
  initial?: string | boolean
  hint?: HintKey
  half?: boolean
}

/** The settings each kind's channel checks (`@highsea/notifications/channels`). */
const FIELDS: Record<Exclude<Kind, 'browser'>, Spec[]> = {
  discord: [
    { key: 'webhookUrl', type: 'secret-url', required: true, hint: 'hint.discord.webhookUrl' },
    { key: 'username', type: 'text' },
  ],
  slack: [{ key: 'webhookUrl', type: 'secret-url', required: true, hint: 'hint.slack.webhookUrl' }],
  telegram: [
    { key: 'botToken', type: 'secret', required: true, hint: 'hint.telegram.botToken' },
    { key: 'chatId', type: 'text', required: true, hint: 'hint.telegram.chatId' },
    { key: 'silent', type: 'switch', initial: false },
  ],
  ntfy: [
    {
      key: 'serverUrl',
      type: 'url',
      required: true,
      initial: 'https://ntfy.sh',
      hint: 'hint.ntfy.serverUrl',
    },
    { key: 'topic', type: 'text', required: true },
    { key: 'token', type: 'secret' },
    { key: 'username', type: 'text', half: true },
    { key: 'password', type: 'secret', half: true },
    { key: 'priority', type: 'number', min: 1, max: 5, initial: '3', hint: 'hint.ntfy.priority' },
  ],
  gotify: [
    { key: 'serverUrl', type: 'url', required: true },
    { key: 'appToken', type: 'secret', required: true },
    {
      key: 'priority',
      type: 'number',
      min: 0,
      max: 10,
      initial: '5',
      hint: 'hint.gotify.priority',
    },
  ],
  pushover: [
    { key: 'appToken', type: 'secret', required: true },
    { key: 'userKey', type: 'secret', required: true },
    { key: 'device', type: 'text', hint: 'hint.pushover.device' },
    {
      key: 'priority',
      type: 'number',
      min: -2,
      max: 1,
      initial: '0',
      hint: 'hint.pushover.priority',
    },
  ],
  matrix: [
    { key: 'homeserverUrl', type: 'url', required: true },
    { key: 'accessToken', type: 'secret', required: true },
    { key: 'roomId', type: 'text', required: true, hint: 'hint.matrix.roomId' },
  ],
  email: [
    { key: 'host', type: 'text', required: true, half: true },
    { key: 'port', type: 'number', min: 1, max: 65535, initial: '587', half: true },
    {
      key: 'security',
      type: 'select',
      options: ['starttls', 'tls', 'none'],
      initial: 'starttls',
    },
    { key: 'username', type: 'text', half: true },
    { key: 'password', type: 'secret', half: true },
    { key: 'from', type: 'text', required: true, hint: 'hint.email.from' },
    { key: 'to', type: 'text', required: true, hint: 'hint.email.to' },
  ],
  webhook: [
    { key: 'url', type: 'secret-url', required: true, hint: 'hint.webhook.url' },
    { key: 'method', type: 'select', options: ['POST', 'PUT'], initial: 'POST' },
    { key: 'token', type: 'secret' },
    { key: 'username', type: 'text', half: true },
    { key: 'password', type: 'secret', half: true },
  ],
  apprise: [
    { key: 'serverUrl', type: 'url', required: true },
    { key: 'key', type: 'text', hint: 'hint.apprise.key' },
    { key: 'urls', type: 'secret' },
    { key: 'tag', type: 'text' },
  ],
}

/** What a new connection hears until it's changed: the things worth a message. */
const DEFAULT_EVENTS: Event[] = ['imported', 'upgraded', 'download-failed', 'health', 'update']

const isMasked = (v: unknown) => typeof v === 'string' && v.startsWith('••••')

const inputOf = (c: Connection): ConnectionInput => ({
  kind: c.kind,
  name: c.name,
  enabled: c.enabled,
  events: c.events,
  settings: c.settings,
  serverMail: c.serverMail,
})

// ---------------------------------------------------------------- the page

export function Connections() {
  const t = useT(messages)
  const list = useQuery('connections', (c) => c.connections.list(), TOPICS)
  // null: closed; a kind: Add; a connection: Edit
  const [editing, setEditing] = useState<Connection | Kind | null>(null)
  const [removing, setRemoving] = useState<Connection | null>(null)
  const remove = useAction((c, id: string) => c.connections.remove({ params: { id } }))

  return (
    <AreaPage id="connections">
      <Group title={t('title')} description={t('description')}>
        <Loadable query={list} what={t('what')}>
          {(cs) =>
            cs.length === 0 ? (
              <EmptyState icon="notification" title={t('none')}>
                {t('noneBody')}
              </EmptyState>
            ) : (
              <ul aria-label={t('title')} className="grid gap-2">
                {cs.map((c) => (
                  <Row
                    key={c.id}
                    connection={c}
                    onEdit={() => setEditing(c)}
                    onRemove={() => setRemoving(c)}
                    onChanged={list.refetch}
                  />
                ))}
              </ul>
            )
          }
        </Loadable>
      </Group>
      <Group title={t('add')} description={t('addDescription')}>
        <ul className="grid grid-cols-2 gap-2 medium:grid-cols-3 wide:grid-cols-5">
          {CONNECTION_KINDS.map((k) => (
            <li key={k}>
              <Button className="w-full" icon="add" onClick={() => setEditing(k)}>
                {t(`kind.${k}`)}
              </Button>
            </li>
          ))}
        </ul>
      </Group>
      <ThisBrowser />
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        {editing !== null && (
          <ConnectionForm
            key={typeof editing === 'string' ? editing : editing.id}
            connection={typeof editing === 'string' ? null : editing}
            kind={typeof editing === 'string' ? editing : editing.kind}
            onClose={() => setEditing(null)}
            onSaved={list.refetch}
          />
        )}
      </Dialog>
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={t('removeTitle', { name: removing?.name ?? '' })}
        description={t('removeBody')}
        confirmLabel={t('removeConfirm')}
        cancelLabel={t('keep')}
        destructive
        onConfirm={() => {
          const c = removing
          if (c)
            remove.run(c.id).then(
              () => {
                toast({ title: t('removed', { name: c.name }) })
                list.refetch()
              },
              (e: Error) => toast.error(t('actionFailed'), { description: e.message }),
            )
        }}
      />
    </AreaPage>
  )
}

function Row({
  connection: c,
  onEdit,
  onRemove,
  onChanged,
}: {
  connection: Connection
  onEdit: () => void
  onRemove: () => void
  onChanged: () => void
}) {
  const t = useT(messages)
  const { relative } = useRelative()
  const update = useAction((client, body: ConnectionInput) =>
    client.connections.update({ params: { id: c.id }, body }),
  )
  const test = useAction((client) => client.connections.testSaved({ params: { id: c.id } }))
  const change = (patch: Partial<ConnectionInput>) =>
    update
      .run({ ...inputOf(c), ...patch })
      .then(onChanged, (e: Error) => toast.error(t('saveFailed'), { description: e.message }))
  const onTest = () =>
    test.run().then(
      (out) =>
        out.ok
          ? toast.success(t('testSent', { name: c.name }))
          : toast.error(t('testFailed'), { description: out.message ?? undefined }),
      (e: Error) => toast.error(t('testFailed'), { description: e.message }),
    )
  return (
    <li className="grid gap-3 rounded-md border border-line bg-s2 p-3">
      <div className="grid gap-3 medium:grid-cols-[auto_minmax(0,1fr)_auto] medium:items-center">
        <Switch
          aria-label={t('enabled', { name: c.name })}
          checked={c.enabled}
          disabled={update.pending}
          onCheckedChange={(enabled) => change({ enabled })}
        />
        <div className="grid min-w-0 gap-1">
          <p className="text-text text-ui [overflow-wrap:anywhere]">
            {c.name} <span className="text-text-3">· {t(`kind.${c.kind}`)}</span>
          </p>
          <p className="flex flex-wrap gap-1">
            {c.events.length === 0 ? (
              <span className="text-caption text-text-3">{t('noEvents')}</span>
            ) : (
              c.events.map((e) => <Badge key={e}>{t(`event.${e}`)}</Badge>)
            )}
          </p>
        </div>
        <Button
          size="sm"
          icon="notification"
          disabled={!c.enabled}
          loading={test.pending}
          aria-label={t('testLabel', { name: c.name })}
          onClick={onTest}
        >
          {t('test')}
        </Button>
      </div>
      <div className="grid gap-1 text-caption text-text-3">
        <p>{c.lastSentAt ? t('sent', { ago: relative(c.lastSentAt) }) : t('never')}</p>
        {c.lastError && (
          <p className="flex flex-wrap items-center gap-2 [overflow-wrap:anywhere]">
            <Badge tone="warning">{t('lastError', { message: c.lastError })}</Badge>
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          icon="edit"
          aria-label={t('editLabel', { name: c.name })}
          onClick={onEdit}
        >
          {t('edit')}
        </Button>
        <Button
          size="sm"
          variant="danger"
          aria-label={t('removeLabel', { name: c.name })}
          onClick={onRemove}
        >
          {t('remove')}
        </Button>
        {c.kind === 'email' && (
          <Field inline label={t('serverMail')} className="ms-auto">
            <Switch
              aria-label={t('serverMailLabel', { name: c.name })}
              checked={c.serverMail}
              disabled={update.pending}
              onCheckedChange={(serverMail) => change({ serverMail })}
            />
          </Field>
        )}
      </div>
    </li>
  )
}

// ---------------------------------------------------------------- Add a connection, Edit

type Values = Record<string, string | boolean>

function valuesOf(kind: Kind, c: Connection | null): Values {
  const out: Values = {}
  if (kind === 'browser') return out
  for (const f of FIELDS[kind]) {
    const v = c?.settings[f.key]
    out[f.key] =
      f.type === 'switch'
        ? typeof v === 'boolean'
          ? v
          : ((f.initial as boolean | undefined) ?? false)
        : v === undefined || v === null
          ? ((f.initial as string | undefined) ?? '')
          : String(v)
  }
  return out
}

function settingsOf(kind: Kind, v: Values, people: string[]): Record<string, unknown> {
  if (kind === 'browser') return { userIds: people }
  const out: Record<string, unknown> = {}
  for (const f of FIELDS[kind]) {
    const value = v[f.key]
    if (f.type === 'switch') out[f.key] = value === true
    else if (typeof value === 'string' && value.trim() !== '')
      out[f.key] = f.type === 'number' ? Number(value) : value.trim()
  }
  return out
}

/** The field a refused save names: a setting's own name, or the connection's. */
function fieldOf(error: unknown): string | undefined {
  const details = (error as { details?: unknown } | null)?.details
  const field = (details as { field?: unknown } | undefined)?.field
  return typeof field === 'string' ? field.replace(/^settings\./, '') : undefined
}

function ConnectionForm({
  connection,
  kind,
  onClose,
  onSaved,
}: {
  connection: Connection | null
  kind: Kind
  onClose: () => void
  onSaved: () => void
}) {
  const t = useT(messages)
  const [name, setName] = useState(connection?.name ?? t(`kind.${kind}`))
  const [enabled, setEnabled] = useState(connection?.enabled ?? true)
  const [events, setEvents] = useState<Event[]>(connection?.events ?? DEFAULT_EVENTS)
  const [serverMail, setServerMail] = useState(connection?.serverMail ?? false)
  const [values, setValues] = useState(() => valuesOf(kind, connection))
  const [people, setPeople] = useState<string[]>(() => {
    const ids = connection?.settings.userIds
    return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : []
  })
  const [touched, setTouched] = useState(false)
  const [failure, setFailure] = useState<{ field?: string; message: string } | null>(null)
  const [tested, setTested] = useState<ConnectionTest | null>(null)
  const save = useAction((c, body: ConnectionInput) =>
    connection
      ? c.connections.update({ params: { id: connection.id }, body })
      : c.connections.add({ body }),
  )
  const test = useAction((c, settings: Record<string, unknown>) =>
    c.connections.test({ body: { id: connection?.id, kind, settings } }),
  )
  const specs = kind === 'browser' ? [] : FIELDS[kind]
  const missing = Object.fromEntries(
    specs.map((f) => [f.key, !!f.required && String(values[f.key] ?? '').trim() === '']),
  ) as Record<string, boolean>
  const settingsOk = !Object.values(missing).some(Boolean)

  const setValue = (key: string, v: string | boolean) => {
    setTested(null)
    setFailure(null)
    setValues((old) => ({ ...old, [key]: v }))
  }
  const err = (field: string, isMissing = false) =>
    failure?.field === field
      ? failure.message
      : touched && isMissing
        ? t('form.required')
        : undefined

  const submit = async () => {
    setTouched(true)
    setFailure(null)
    if (!name.trim() || !settingsOk) return
    try {
      const saved = await save.run({
        kind,
        name: name.trim(),
        enabled,
        events,
        settings: settingsOf(kind, values, people),
        ...(kind === 'email' ? { serverMail } : {}),
      })
      onClose()
      onSaved()
      toast.success(t(connection ? 'form.saved' : 'form.added', { name: saved.name }))
    } catch (e) {
      setFailure({ field: fieldOf(e), message: (e as Error).message })
    }
  }
  const onTest = () =>
    test
      .run(settingsOf(kind, values, people))
      .then(setTested, (e: Error) => setTested({ ok: false, message: e.message }))
  const known = new Set<string>([...specs.map((f) => f.key), 'name', 'events', 'serverMail'])
  const general = failure && (!failure.field || !known.has(failure.field)) ? failure.message : null

  return (
    <DialogContent
      size="md"
      title={
        connection
          ? t('form.editTitle', { name: connection.name })
          : t('form.addTitle', { kind: t(`kind.${kind}`) })
      }
      description={t('form.description')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('form.cancel')}
          </Button>
          <Button variant="primary" loading={save.pending} onClick={submit}>
            {t('form.save')}
          </Button>
        </>
      }
    >
      <form
        noValidate
        className="grid gap-4 medium:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Field
          label={t('form.name')}
          error={err('name', !name.trim())}
          className="medium:col-span-2"
        >
          <Input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
        </Field>
        {specs.map((f) => (
          <SettingField
            key={f.key}
            spec={f}
            value={values[f.key] ?? ''}
            error={err(f.key, missing[f.key])}
            onChange={(v) => setValue(f.key, v)}
          />
        ))}
        {kind === 'browser' && <PeopleField value={people} onChange={setPeople} />}
        <div className="flex flex-wrap items-center gap-3 medium:col-span-2">
          <Button
            size="sm"
            icon="check"
            loading={test.pending}
            disabled={!settingsOk}
            onClick={onTest}
          >
            {t('form.test')}
          </Button>
          {tested && (
            <p
              role="status"
              className={
                tested.ok
                  ? 'text-caption text-text-2'
                  : 'text-caption text-danger [overflow-wrap:anywhere]'
              }
            >
              {tested.ok ? t('form.testOk') : tested.message}
            </p>
          )}
        </div>
        <fieldset className="grid gap-2 medium:col-span-2">
          <legend className="mb-1 font-medium text-text text-ui">{t('form.events')}</legend>
          <p className="text-caption text-text-3">{t('form.eventsHint')}</p>
          <div className="grid gap-2 rounded-md border border-line bg-s2 p-3 medium:grid-cols-2">
            {NOTIFICATION_EVENTS.map((e) => (
              <Field key={e} inline label={t(`event.${e}`)}>
                <Checkbox
                  checked={events.includes(e)}
                  onCheckedChange={(on) =>
                    setEvents((old) =>
                      on === true
                        ? NOTIFICATION_EVENTS.filter((x) => x === e || old.includes(x))
                        : old.filter((x) => x !== e),
                    )
                  }
                />
              </Field>
            ))}
          </div>
        </fieldset>
        {kind === 'email' && (
          <Field
            inline
            label={t('form.serverMail')}
            hint={t('form.serverMailHint')}
            error={err('serverMail')}
            className="medium:col-span-2"
          >
            <Switch checked={serverMail} onCheckedChange={setServerMail} />
          </Field>
        )}
        <Field inline label={t('form.enabled')} className="medium:col-span-2">
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </Field>
        {general && (
          <p role="alert" className="text-caption text-danger medium:col-span-2">
            {general}
          </p>
        )}
      </form>
    </DialogContent>
  )
}

function SettingField({
  spec: f,
  value,
  error,
  onChange,
}: {
  spec: Spec
  value: string | boolean
  error: string | undefined
  onChange: (v: string | boolean) => void
}) {
  const t = useT(messages)
  const label = t(`field.${f.key}`)
  const span = f.half ? undefined : 'medium:col-span-2'
  if (f.type === 'switch')
    return (
      <Field inline label={label} className="medium:col-span-2">
        <Switch checked={value === true} onCheckedChange={onChange} />
      </Field>
    )
  const hint = isMasked(value) ? t('form.secretHint') : f.hint ? t(f.hint) : undefined
  if (f.type === 'select')
    return (
      <Field label={label} hint={hint} error={error} className={span}>
        <Select
          value={String(value)}
          onValueChange={onChange}
          options={(f.options ?? []).map((o) => ({
            value: o,
            label: f.key === 'security' ? t(`security.${o as 'starttls' | 'tls' | 'none'}`) : o,
          }))}
        />
      </Field>
    )
  const mono = f.type !== 'text' || f.key === 'chatId' || f.key === 'roomId' || f.key === 'topic'
  return (
    <Field label={label} hint={hint} error={error} className={span}>
      <Input
        type={
          f.type === 'secret'
            ? 'password'
            : f.type === 'number'
              ? 'number'
              : f.type === 'url' || f.type === 'secret-url'
                ? 'url'
                : 'text'
        }
        value={String(value)}
        min={f.min}
        max={f.max}
        spellCheck={false}
        autoCapitalize="none"
        autoComplete={f.type === 'secret' ? 'new-password' : 'off'}
        className={mono ? 'font-mono' : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  )
}

/** A Browser connection's people: whose browsers it shows notifications in. */
function PeopleField({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const t = useT(messages)
  const people = useQuery('settings:users', (c) => c.users.list(), ['users.updated'])
  return (
    <fieldset className="grid gap-2 medium:col-span-2">
      <legend className="mb-1 font-medium text-text text-ui">{t('form.people')}</legend>
      <p className="text-caption text-text-3">{t('form.peopleHint')}</p>
      <div className="grid gap-2 rounded-md border border-line bg-s2 p-3 medium:grid-cols-2">
        {(people.data ?? [])
          .filter((p) => !p.invited)
          .map((p) => (
            <Field key={p.id} inline label={p.displayName}>
              <Checkbox
                checked={value.includes(p.id)}
                onCheckedChange={(on) =>
                  onChange(on === true ? [...value, p.id] : value.filter((x) => x !== p.id))
                }
              />
            </Field>
          ))}
      </div>
    </fieldset>
  )
}

// ---------------------------------------------------------------- this browser

type Support = 'checking' | 'ok' | 'unsupported' | 'insecure'

/** The VAPID key as PushManager.subscribe takes it: base64url to bytes. */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/** "Firefox on macOS", from the user agent: what the list calls this browser. */
function browserName(t: T, ua: string) {
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : null
  const os = /iPhone|iPad/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Mac OS X/.test(ua)
        ? 'macOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : null
  if (browser && os) return t('push.label', { browser, os })
  return browser ?? os ?? t('kind.browser')
}

function ThisBrowser() {
  const t = useT(messages)
  const { relative } = useRelative()
  const client = useClient()
  const mine = useQuery('push-subscriptions', (c) => c.pushSubscriptions.list(), TOPICS)
  const remove = useAction((c, id: string) => c.pushSubscriptions.remove({ params: { id } }))
  const [support, setSupport] = useState<Support>('checking')
  const [busy, setBusy] = useState(false)
  // only the browser knows; checked after hydration so the server's render matches
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) setSupport('unsupported')
    else if (!window.isSecureContext) setSupport('insecure')
    else setSupport('ok')
  }, [])

  const turnOn = async () => {
    setBusy(true)
    try {
      if ((await Notification.requestPermission()) !== 'granted') {
        toast.error(t('push.failed'), { description: t('push.denied') })
        return
      }
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      })
      await navigator.serviceWorker.ready
      const { publicKey } = await client.connections.pushKey()
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(publicKey),
      })
      const json = subscription.toJSON()
      await client.pushSubscriptions.add({
        body: {
          endpoint: subscription.endpoint,
          keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
          label: browserName(t, navigator.userAgent),
        },
      })
      toast.success(t('push.on'))
      mine.refetch()
    } catch (e) {
      toast.error(t('push.failed'), { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Group title={t('push.title')} description={t('push.description')}>
      {support === 'unsupported' || support === 'insecure' ? (
        <p className="text-caption text-text-3">
          {support === 'insecure' ? t('push.insecure') : t('push.unsupported')}
        </p>
      ) : (
        <Button
          icon="notification"
          className="justify-self-start"
          loading={busy}
          disabled={support !== 'ok'}
          onClick={turnOn}
        >
          {t('push.turnOn')}
        </Button>
      )}
      <Loadable query={mine} what={t('push.yours')}>
        {(subs) =>
          subs.length === 0 ? (
            <p className="text-caption text-text-3">{t('push.none')}</p>
          ) : (
            <ul aria-label={t('push.yours')} className="grid gap-2">
              {subs.map((s) => (
                <li
                  key={s.id}
                  className="grid gap-2 rounded-md border border-line bg-s2 p-3 medium:grid-cols-[minmax(0,1fr)_auto] medium:items-center"
                >
                  <div className="grid min-w-0 gap-0.5">
                    <p className="text-text text-ui [overflow-wrap:anywhere]">{s.label}</p>
                    <p className="text-caption text-text-3 [overflow-wrap:anywhere]">
                      {s.service} · {t('push.added', { ago: relative(s.createdAt) })}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="danger"
                    aria-label={t('push.removeLabel', { name: s.label })}
                    onClick={() =>
                      remove.run(s.id).then(
                        () => {
                          toast({ title: t('push.removed', { name: s.label }) })
                          mine.refetch()
                        },
                        (e: Error) => toast.error(t('actionFailed'), { description: e.message }),
                      )
                    }
                  >
                    {t('remove')}
                  </Button>
                </li>
              ))}
            </ul>
          )
        }
      </Loadable>
    </Group>
  )
}

// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Connections (settings.md; ADR 0046), as apps/server built it (connections.tsx). Each
// connection keeps its row (on, name and kind, its events, Test) and adds when it last sent or why
// it didn't, Edit and Remove, and the Server’s mail switch on an email connection. Add a connection
// opens a dialog for that kind: its fields with secrets masked, the events as checkboxes, Test and
// Save. Matrix and Browser join the kinds. This browser is a group of its own; the prototype adds it
// by name from the user agent, without the real Push API. Changes save at once.
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
} from '@highsea-tv/ui-web'
import { useState } from 'react'
import { useAction, useQuery } from '../../mock/hooks.tsx'
import {
  CONNECTION_KINDS,
  type Connection,
  type ConnectionInput,
  type ConnectionTest,
  type NotificationEvent as Event,
  type NotificationKind as Kind,
  NOTIFICATION_EVENTS,
} from '../../mock/settings.ts'
import { Loadable } from '../loadable.tsx'
import { fieldOf, TagPicker, useAgo } from './parts.tsx'
import { AreaPage, Group } from './settings.tsx'

const KIND: Record<Kind, string> = {
  discord: 'Discord',
  slack: 'Slack',
  telegram: 'Telegram',
  ntfy: 'ntfy',
  gotify: 'Gotify',
  pushover: 'Pushover',
  matrix: 'Matrix',
  email: 'Email',
  webhook: 'Webhook',
  apprise: 'Apprise',
  browser: 'Browser',
}

const EVENT: Record<Event, string> = {
  grabbed: 'Grabbed',
  imported: 'Imported',
  upgraded: 'Upgraded',
  'download-failed': 'Download failed',
  'subtitle-added': 'Subtitle added',
  health: 'Health',
  update: 'Update',
  'movie-added': 'Movie added',
  'playback-started': 'Playback started',
}

// ---------------------------------------------------------------- each kind's fields

type Spec = {
  key: string
  label: string
  /** A secret comes back masked; sent back masked, it keeps its value. */
  type: 'text' | 'url' | 'secret' | 'secret-url' | 'number' | 'switch' | 'select'
  required?: boolean
  options?: readonly [string, string][]
  min?: number
  max?: number
  initial?: string | boolean
  hint?: string
  half?: boolean
}

const PRIORITY = 'Priority'

/** The settings each kind's channel checks (`@highsea-tv/notifications/channels`). */
const FIELDS: Record<Exclude<Kind, 'browser'>, Spec[]> = {
  discord: [
    {
      key: 'webhookUrl',
      label: 'Webhook address',
      type: 'secret-url',
      required: true,
      hint: 'In the channel’s settings: Integrations, Webhooks.',
    },
    { key: 'username', label: 'User name', type: 'text' },
  ],
  slack: [
    {
      key: 'webhookUrl',
      label: 'Webhook address',
      type: 'secret-url',
      required: true,
      hint: 'An incoming webhook from your Slack app.',
    },
  ],
  telegram: [
    {
      key: 'botToken',
      label: 'Bot token',
      type: 'secret',
      required: true,
      hint: 'From @BotFather.',
    },
    {
      key: 'chatId',
      label: 'Chat',
      type: 'text',
      required: true,
      hint: 'A chat id, or @channelname.',
    },
    { key: 'silent', label: 'Send silently', type: 'switch', initial: false },
  ],
  ntfy: [
    {
      key: 'serverUrl',
      label: 'Server address',
      type: 'url',
      required: true,
      initial: 'https://ntfy.sh',
      hint: 'ntfy.sh, or your own server.',
    },
    { key: 'topic', label: 'Topic', type: 'text', required: true },
    { key: 'token', label: 'Access token', type: 'secret' },
    { key: 'username', label: 'User name', type: 'text', half: true },
    { key: 'password', label: 'Password', type: 'secret', half: true },
    {
      key: 'priority',
      label: PRIORITY,
      type: 'number',
      min: 1,
      max: 5,
      initial: '3',
      hint: '1 is the lowest, 5 the highest.',
    },
  ],
  gotify: [
    { key: 'serverUrl', label: 'Server address', type: 'url', required: true },
    { key: 'appToken', label: 'Application token', type: 'secret', required: true },
    {
      key: 'priority',
      label: PRIORITY,
      type: 'number',
      min: 0,
      max: 10,
      initial: '5',
      hint: '0 to 10.',
    },
  ],
  pushover: [
    { key: 'appToken', label: 'Application token', type: 'secret', required: true },
    { key: 'userKey', label: 'User key', type: 'secret', required: true },
    { key: 'device', label: 'Device', type: 'text', hint: 'Empty for all your devices.' },
    {
      key: 'priority',
      label: PRIORITY,
      type: 'number',
      min: -2,
      max: 1,
      initial: '0',
      hint: '−2 is the quietest, 1 the most urgent.',
    },
  ],
  matrix: [
    { key: 'homeserverUrl', label: 'Homeserver', type: 'url', required: true },
    { key: 'accessToken', label: 'Access token', type: 'secret', required: true },
    {
      key: 'roomId',
      label: 'Room',
      type: 'text',
      required: true,
      hint: '!abc:example.org, or an alias.',
    },
  ],
  email: [
    { key: 'host', label: 'SMTP server', type: 'text', required: true, half: true },
    {
      key: 'port',
      label: 'Port',
      type: 'number',
      min: 1,
      max: 65535,
      initial: '587',
      half: true,
    },
    {
      key: 'security',
      label: 'Security',
      type: 'select',
      options: [
        ['starttls', 'STARTTLS'],
        ['tls', 'TLS'],
        ['none', 'None'],
      ],
      initial: 'starttls',
    },
    { key: 'username', label: 'User name', type: 'text', half: true },
    { key: 'password', label: 'Password', type: 'secret', half: true },
    {
      key: 'from',
      label: 'From',
      type: 'text',
      required: true,
      hint: 'highsea <media@example.org>',
    },
    { key: 'to', label: 'To', type: 'text', required: true, hint: 'Where notifications go.' },
  ],
  webhook: [
    {
      key: 'url',
      label: 'Address',
      type: 'secret-url',
      required: true,
      hint: 'highsea sends each event as JSON.',
    },
    {
      key: 'method',
      label: 'Method',
      type: 'select',
      options: [
        ['POST', 'POST'],
        ['PUT', 'PUT'],
      ],
      initial: 'POST',
    },
    { key: 'token', label: 'Access token', type: 'secret' },
    { key: 'username', label: 'User name', type: 'text', half: true },
    { key: 'password', label: 'Password', type: 'secret', half: true },
  ],
  apprise: [
    { key: 'serverUrl', label: 'Server address', type: 'url', required: true },
    {
      key: 'key',
      label: 'Configuration key',
      type: 'text',
      hint: 'A configuration saved on the Apprise server, or URLs below.',
    },
    { key: 'urls', label: 'Apprise URLs', type: 'secret' },
    { key: 'tag', label: 'Tag', type: 'text' },
  ],
}

/** What a new connection hears until it’s changed: the things worth a message. */
const DEFAULT_EVENTS: Event[] = ['imported', 'upgraded', 'download-failed', 'health', 'update']

const isMasked = (v: unknown) => typeof v === 'string' && v.startsWith('••••')

const inputOf = (c: Connection): ConnectionInput => ({
  kind: c.kind,
  name: c.name,
  enabled: c.enabled,
  events: c.events,
  settings: c.settings,
  serverMail: c.serverMail,
  tags: c.tags,
})

// ---------------------------------------------------------------- the page

export function Connections() {
  const list = useQuery('connections', (c) => c.connections.list(), ['settings.updated'])
  // null: closed; a kind: Add; a connection: Edit
  const [editing, setEditing] = useState<Connection | Kind | null>(null)
  const [removing, setRemoving] = useState<Connection | null>(null)
  const remove = useAction((c, id: string) => c.connections.remove(id))

  return (
    <AreaPage id="connections">
      <Group
        title="Notifications"
        description="Where highsea tells you about downloads, imports and problems."
      >
        <Loadable query={list} what="the connections">
          {(cs) =>
            cs.length === 0 ? (
              <EmptyState icon="notification" title="No connections yet">
                Add one below and choose what it hears.
              </EmptyState>
            ) : (
              <ul aria-label="Notifications" className="grid gap-2">
                {cs.map((c) => (
                  <Row
                    key={c.id}
                    connection={c}
                    onEdit={() => setEditing(c)}
                    onRemove={() => setRemoving(c)}
                  />
                ))}
              </ul>
            )
          }
        </Loadable>
      </Group>
      <Group title="Add a connection" description="Choose a service, then add it.">
        <ul className="grid grid-cols-2 gap-2 medium:grid-cols-3 wide:grid-cols-5">
          {CONNECTION_KINDS.map((k) => (
            <li key={k}>
              <Button className="w-full" icon="add" onClick={() => setEditing(k)}>
                {KIND[k]}
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
          />
        )}
      </Dialog>
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.name ?? ''}?`}
        description="It stops getting notifications, and what was sent to it is forgotten."
        confirmLabel="Remove"
        cancelLabel="Keep it"
        destructive
        onConfirm={() => {
          const c = removing
          if (c)
            remove.run(c.id).then(
              () => toast({ title: `Removed ${c.name}` }),
              (e: Error) => toast.error('That didn’t work', { description: e.message }),
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
}: {
  connection: Connection
  onEdit: () => void
  onRemove: () => void
}) {
  const ago = useAgo()
  const update = useAction((client, body: ConnectionInput) => client.connections.update(c.id, body))
  const test = useAction((client) => client.connections.testSaved(c.id))
  const change = (patch: Partial<ConnectionInput>) =>
    update
      .run({ ...inputOf(c), ...patch })
      .catch((e: Error) => toast.error('Couldn’t save that', { description: e.message }))
  const onTest = () =>
    test.run().then(
      (out) =>
        out.ok
          ? toast.success(`Sent a test to ${c.name}`)
          : toast.error('The test didn’t arrive', { description: out.message ?? undefined }),
      (e: Error) => toast.error('The test didn’t arrive', { description: e.message }),
    )
  return (
    <li className="grid gap-3 rounded-md border border-line bg-s2 p-3">
      <div className="grid gap-3 medium:grid-cols-[auto_minmax(0,1fr)_auto] medium:items-center">
        <Switch
          aria-label={`${c.name}: on`}
          checked={c.enabled}
          disabled={update.pending}
          onCheckedChange={(enabled) => change({ enabled })}
        />
        <div className="grid min-w-0 gap-1">
          <p className="text-text text-ui [overflow-wrap:anywhere]">
            {c.name} <span className="text-text-3">· {KIND[c.kind]}</span>
          </p>
          <p className="flex flex-wrap gap-1">
            {c.events.length === 0 ? (
              <span className="text-caption text-text-3">Hears nothing yet</span>
            ) : (
              c.events.map((e) => <Badge key={e}>{EVENT[e]}</Badge>)
            )}
          </p>
        </div>
        <Button
          size="sm"
          icon="notification"
          disabled={!c.enabled}
          loading={test.pending}
          aria-label={`Send a test to ${c.name}`}
          onClick={onTest}
        >
          Test
        </Button>
      </div>
      <div className="grid gap-1 text-caption text-text-3">
        <p>{c.lastSentAt ? `Last sent ${ago(c.lastSentAt)}` : 'Nothing sent yet'}</p>
        {c.lastError && (
          <p className="flex flex-wrap items-center gap-2 [overflow-wrap:anywhere]">
            <Badge tone="warning">The last message didn’t arrive: {c.lastError}</Badge>
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" icon="edit" aria-label={`Edit ${c.name}`} onClick={onEdit}>
          Edit
        </Button>
        <Button size="sm" variant="danger" aria-label={`Remove ${c.name}`} onClick={onRemove}>
          Remove
        </Button>
        {c.kind === 'email' && (
          <Field inline label="Server’s mail" className="ms-auto">
            <Switch
              aria-label={`${c.name}: sends the server’s mail`}
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

function ConnectionForm({
  connection,
  kind,
  onClose,
}: {
  connection: Connection | null
  kind: Kind
  onClose: () => void
}) {
  const [name, setName] = useState(connection?.name ?? KIND[kind])
  const [enabled, setEnabled] = useState(connection?.enabled ?? true)
  const [events, setEvents] = useState<Event[]>(connection?.events ?? DEFAULT_EVENTS)
  const [serverMail, setServerMail] = useState(connection?.serverMail ?? false)
  const [tags, setTags] = useState<string[]>(connection?.tags ?? [])
  const [values, setValues] = useState(() => valuesOf(kind, connection))
  const [people, setPeople] = useState<string[]>(() => {
    const ids = connection?.settings.userIds
    return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : []
  })
  const [touched, setTouched] = useState(false)
  const [failure, setFailure] = useState<{ field?: string; message: string } | null>(null)
  const [tested, setTested] = useState<ConnectionTest | null>(null)
  const save = useAction((c, body: ConnectionInput) =>
    connection ? c.connections.update(connection.id, body) : c.connections.add(body),
  )
  const test = useAction((c, settings: Record<string, unknown>) =>
    c.connections.test({ id: connection?.id, kind, settings }),
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
    failure?.field === field ? failure.message : touched && isMissing ? 'Needed.' : undefined

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
        tags,
        settings: settingsOf(kind, values, people),
        serverMail: kind === 'email' && serverMail,
      })
      onClose()
      toast.success(`${connection ? 'Saved' : 'Added'} ${saved.name}`)
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
      title={connection ? `Edit ${connection.name}` : `Add a ${KIND[kind]} connection`}
      description="Test sends the test message with these settings, before you save."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={save.pending} onClick={submit}>
            Save
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
        <Field label="Name" error={err('name', !name.trim())} className="medium:col-span-2">
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
            Test
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
              {tested.ok ? 'The test message arrived.' : tested.message}
            </p>
          )}
        </div>
        <fieldset className="grid gap-2 medium:col-span-2">
          <legend className="mb-1 font-medium text-text text-ui">Events</legend>
          <p className="text-caption text-text-3">What this connection hears.</p>
          <div className="grid gap-2 rounded-md border border-line bg-s2 p-3 medium:grid-cols-2">
            {NOTIFICATION_EVENTS.map((e) => (
              <Field key={e} inline label={EVENT[e]}>
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
            label="Send the server’s mail"
            hint="Invites and password resets go to each person’s address. Only one connection sends it."
            error={err('serverMail')}
            className="medium:col-span-2"
          >
            <Switch checked={serverMail} onCheckedChange={setServerMail} />
          </Field>
        )}
        <Field
          label="Tags"
          hint="A movie’s messages come here only for movies with one of these tags. With none, for every movie."
          className="medium:col-span-2"
        >
          <TagPicker value={tags} onChange={setTags} />
        </Field>
        <Field inline label="On" className="medium:col-span-2">
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </Field>
        {general && (
          <p role="alert" className="text-caption text-danger medium:col-span-2">
            {general}
          </p>
        )}
        {/* lets Enter submit */}
        <button type="submit" hidden />
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
  const span = f.half ? undefined : 'medium:col-span-2'
  if (f.type === 'switch')
    return (
      <Field inline label={f.label} className="medium:col-span-2">
        <Switch checked={value === true} onCheckedChange={onChange} />
      </Field>
    )
  const hint = isMasked(value) ? 'Saved. Type a new one to change it.' : f.hint
  if (f.type === 'select')
    return (
      <Field label={f.label} hint={hint} error={error} className={span}>
        <Select
          value={String(value)}
          onValueChange={onChange}
          options={(f.options ?? []).map(([v, label]) => ({ value: v, label }))}
        />
      </Field>
    )
  const mono = f.type !== 'text' || f.key === 'chatId' || f.key === 'roomId' || f.key === 'topic'
  return (
    <Field label={f.label} hint={hint} error={error} className={span}>
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

/** A Browser connection’s people: whose browsers it shows notifications in. */
function PeopleField({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const people = useQuery('settings:users', (c) => c.users.list(), ['users.updated'])
  return (
    <fieldset className="grid gap-2 medium:col-span-2">
      <legend className="mb-1 font-medium text-text text-ui">People</legend>
      <p className="text-caption text-text-3">
        Their browsers that get notifications. Nobody chosen means just you.
      </p>
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

/** “Firefox on macOS”, from the user agent: what the list calls this browser. */
function browserName(ua: string) {
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
  if (browser && os) return `${browser} on ${os}`
  return browser ?? os ?? 'Browser'
}

function ThisBrowser() {
  const ago = useAgo()
  const mine = useQuery('push-subscriptions', (c) => c.pushSubscriptions.list(), [
    'settings.updated',
  ])
  const add = useAction((c, label: string) => c.pushSubscriptions.add(label))
  const remove = useAction((c, id: string) => c.pushSubscriptions.remove(id))
  // the prototype asks the browser nothing: turning it on adds this browser by its name
  const label = browserName(typeof navigator === 'undefined' ? '' : navigator.userAgent)
  const on = mine.data?.some((s) => s.label === label) ?? false

  return (
    <Group
      title="This browser"
      description="A Browser connection shows its notifications in the browsers people turn on here."
    >
      {on ? (
        <p className="text-caption text-text-2">This browser gets notifications.</p>
      ) : (
        <Button
          icon="notification"
          className="justify-self-start"
          loading={add.pending}
          onClick={() =>
            add.run(label).then(
              () => toast.success('This browser gets notifications.'),
              (e: Error) =>
                toast.error('Couldn’t turn notifications on', { description: e.message }),
            )
          }
        >
          Get notifications in this browser
        </Button>
      )}
      <Loadable query={mine} what="Your browsers">
        {(subs) =>
          subs.length === 0 ? (
            <p className="text-caption text-text-3">None of your browsers get notifications yet.</p>
          ) : (
            <ul aria-label="Your browsers" className="grid gap-2">
              {subs.map((s) => (
                <li
                  key={s.id}
                  className="grid gap-2 rounded-md border border-line bg-s2 p-3 medium:grid-cols-[minmax(0,1fr)_auto] medium:items-center"
                >
                  <div className="grid min-w-0 gap-0.5">
                    <p className="text-text text-ui [overflow-wrap:anywhere]">{s.label}</p>
                    <p className="text-caption text-text-3 [overflow-wrap:anywhere]">
                      {s.service} · Added {ago(s.createdAt)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="danger"
                    aria-label={`Stop notifications in ${s.label}`}
                    onClick={() =>
                      remove.run(s.id).then(
                        () => toast({ title: `Stopped notifications in ${s.label}` }),
                        (e: Error) => toast.error('That didn’t work', { description: e.message }),
                      )
                    }
                  >
                    Remove
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

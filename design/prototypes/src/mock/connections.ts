// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Connections (ADR 0046), as packages/notifications answers it: secrets come back
// masked (`••••` and their last four) and a masked value sent back keeps the secret it stands for;
// one email connection at most sends the server's mail; and the browsers that get notifications.
// A test fails when an address or token says "wrong", or when the connection's last message didn't
// arrive and its settings haven't changed since.
import { iso } from './clock.ts'
import type {
  Connection,
  ConnectionInput,
  ConnectionTest,
  NotificationKind,
  SettingsDeps,
} from './settings.ts'
import { CONNECTION_KINDS, NOTIFICATION_EVENTS } from './settings.ts'

/** Each kind's secrets (`@highsea-tv/notifications/channels`), masked on every read. */
const SECRETS: Record<NotificationKind, string[]> = {
  discord: ['webhookUrl'],
  slack: ['webhookUrl'],
  telegram: ['botToken'],
  ntfy: ['token', 'password'],
  gotify: ['appToken'],
  pushover: ['appToken', 'userKey'],
  matrix: ['accessToken'],
  email: ['password'],
  webhook: ['url', 'token', 'password'],
  apprise: ['urls'],
  browser: [],
}

const MASK = '••••'
const mask = (secret: string) => `${MASK}${secret.slice(-4)}`

const shown = (c: Connection): Connection => {
  const settings = { ...c.settings }
  for (const key of SECRETS[c.kind])
    if (typeof settings[key] === 'string') settings[key] = mask(settings[key] as string)
  return { ...c, settings }
}

export function connectionsApi(d: SettingsDeps) {
  const s = d.settings
  let made = 0
  const announce = () => d.emit({ type: 'settings.updated' })

  const row = (id: string) => {
    const c = s.connections.find((x) => x.id === id)
    if (!c) throw d.fail(404, 'not-found', 'There’s no such connection.')
    return c
  }

  /** The settings as saved: a masked secret takes the value it stands for in `previous`. */
  const unmask = (
    kind: NotificationKind,
    settings: Record<string, unknown>,
    previous: Connection | undefined,
  ) => {
    const out = { ...settings }
    for (const key of SECRETS[kind]) {
      const v = out[key]
      if (typeof v === 'string' && v.startsWith(MASK)) out[key] = previous?.settings[key]
    }
    return out
  }

  const check = (input: ConnectionInput) => {
    const name = input.name.trim()
    if (!name) throw d.fail(400, 'invalid', 'A connection needs a name.', { field: 'name' })
    if (!CONNECTION_KINDS.includes(input.kind))
      throw d.fail(400, 'invalid', 'There’s no such kind of connection.', { field: 'kind' })
    if (input.events.some((e) => !NOTIFICATION_EVENTS.includes(e)))
      throw d.fail(400, 'invalid', 'There’s no such event.', { field: 'events' })
    if (input.serverMail && input.kind !== 'email')
      throw d.fail(400, 'invalid', 'Only an email connection can send the server’s mail.', {
        field: 'serverMail',
      })
    for (const [key, v] of Object.entries(input.settings))
      if (typeof v === 'string' && /url$/i.test(key) && v && !/^https?:\/\//.test(v))
        throw d.fail(400, 'invalid', 'Use an address that starts with https:// or http://.', {
          field: `settings.${key}`,
        })
    return name
  }

  /** Only one connection sends the server's mail. */
  const claimServerMail = (c: Connection) => {
    if (!c.serverMail) return
    for (const other of s.connections) if (other.id !== c.id) other.serverMail = false
  }

  const attempt = (
    kind: NotificationKind,
    settings: Record<string, unknown>,
    saved: Connection | undefined,
  ): ConnectionTest => {
    if (Object.values(settings).some((v) => typeof v === 'string' && /wrong/i.test(v)))
      return {
        ok: false,
        message:
          kind === 'email'
            ? 'The mail server refused the sign-in (535 Authentication failed).'
            : 'The service answered 401 Unauthorized.',
      }
    if (saved?.lastError && JSON.stringify(saved.settings) === JSON.stringify(settings))
      return { ok: false, message: saved.lastError }
    return { ok: true, message: null }
  }

  return {
    connections: {
      list: () => {
        d.requireStaff()
        return s.connections.map(shown)
      },
      add: (input: ConnectionInput) => {
        d.requireStaff()
        const name = check(input)
        const c: Connection = {
          ...input,
          name,
          serverMail: input.kind === 'email' && input.serverMail,
          settings: unmask(input.kind, input.settings, undefined),
          id: `n-new-${++made}`,
          lastSentAt: null,
          lastError: null,
        }
        s.connections.push(c)
        claimServerMail(c)
        announce()
        return shown(c)
      },
      update: (id: string, input: ConnectionInput) => {
        d.requireStaff()
        const c = row(id)
        if (input.kind !== c.kind)
          throw d.fail(400, 'invalid', 'A connection’s kind can’t change.', { field: 'kind' })
        const name = check(input)
        const settings = unmask(c.kind, input.settings, c)
        // new settings: the last failure was about the old ones
        if (JSON.stringify(settings) !== JSON.stringify(c.settings)) c.lastError = null
        Object.assign(c, input, {
          name,
          settings,
          serverMail: c.kind === 'email' && !!input.serverMail,
        })
        claimServerMail(c)
        announce()
        return shown(c)
      },
      remove: (id: string) => {
        d.requireStaff()
        row(id)
        s.connections = s.connections.filter((c) => c.id !== id)
        announce()
      },
      /** Test in the dialog: these settings, before they're saved. */
      test: (input: { id?: string; kind: NotificationKind; settings: Record<string, unknown> }) => {
        d.requireStaff()
        const saved = input.id ? row(input.id) : undefined
        return attempt(input.kind, unmask(input.kind, input.settings, saved), saved)
      },
      /** Test on a row: the saved connection, which then counts as sent or not. */
      testSaved: (id: string) => {
        d.requireStaff()
        const c = row(id)
        const out = attempt(c.kind, c.settings, c)
        if (out.ok) {
          c.lastSentAt = iso(d.now())
          c.lastError = null
        } else c.lastError = out.message
        announce()
        return out
      },
    },
    pushSubscriptions: {
      /** The signed-in person's browsers. */
      list: (userId: string) => s.pushSubscriptions.filter((p) => p.userId === userId),
      add: (userId: string, label: string) => {
        const existing = s.pushSubscriptions.find((p) => p.userId === userId && p.label === label)
        if (existing) return existing
        const sub = {
          id: `ps-new-${++made}`,
          userId,
          label,
          service: /Firefox/.test(label) ? 'Mozilla' : /Safari/.test(label) ? 'Apple' : 'Google',
          createdAt: iso(d.now()),
        }
        s.pushSubscriptions.push(sub)
        announce()
        return sub
      },
      remove: (userId: string, id: string) => {
        if (!s.pushSubscriptions.some((p) => p.id === id && p.userId === userId))
          throw d.fail(404, 'not-found', 'That browser doesn’t get notifications.')
        s.pushSubscriptions = s.pushSubscriptions.filter((p) => p.id !== id)
        announce()
      },
    },
  }
}

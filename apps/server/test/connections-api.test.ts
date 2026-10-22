// SPDX-License-Identifier: AGPL-3.0-only
// Checkpoint 8b's connections through the SDK: adding, changing and removing one with its secrets
// masked (a masked value sent back keeps the secret), Test with the dialog's settings and with a
// saved connection, the log, a member refused, each person's own browsers for web push, an invite
// emailed through the server's mail (a fake SMTP server), a person's add announced, and a poster
// whose signed address answers without signing in.
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Fetch } from '@highsea/core'
import { createReplayFetch } from '@highsea/metadata/replay'
import {
  createFakeNotifications,
  createFakeSmtp,
  createPushSubscriber,
  type FakeSmtp,
  readMail,
} from '@highsea/notifications/fake'
import { createApi } from '../src/api/app.ts'
import {
  addMember,
  bootRuntime,
  cleanup,
  clientFor,
  failure,
  meta,
  ORIGIN,
  withOwner,
} from './helpers.ts'

const smtps: FakeSmtp[] = []
afterEach(async () => {
  for (const s of smtps.splice(0)) await s.close()
  await cleanup()
})

const SINTEL = 45745
const DISCORD = 'https://discord.com/api/webhooks/123456/abcdefSECRETwxyz'
const HOOK = 'https://hooks.example.org/highsea'

async function started() {
  const channels = createFakeNotifications()
  const replay = createReplayFetch()
  const runtime = await bootRuntime({
    fetch: replay as Fetch,
    notifications: { fetch: channels.fetch },
  })
  const app = createApi(runtime)
  const { owner, token } = await withOwner(runtime)
  const member = await addMember(runtime, owner.id, 'Mara')
  return {
    runtime,
    app,
    owner,
    channels,
    api: clientFor(app, { token }),
    memberApi: clientFor(app, { token: member.token }),
  }
}

describe('connections', () => {
  test('added, changed and removed, with secrets masked', async () => {
    const { api, runtime } = await started()
    const added = await api.connections.add({
      body: {
        kind: 'discord',
        name: 'Discord',
        enabled: true,
        events: ['grabbed', 'imported'],
        settings: { webhookUrl: DISCORD, username: 'highsea' },
      },
    })
    expect(added.settings.webhookUrl).toBe('••••wxyz')
    expect(added.lastSentAt).toBeNull()
    expect(JSON.stringify(await api.connections.list())).not.toContain('SECRET')

    // sent back masked, the secret stays
    const saved = await api.connections.update({
      params: { id: added.id },
      body: {
        kind: 'discord',
        name: 'Discord, imports',
        enabled: true,
        events: ['imported'],
        settings: added.settings,
      },
    })
    expect(saved.name).toBe('Discord, imports')
    expect(runtime.notifications.get(added.id).events).toEqual(['imported'])
    const sent = await api.connections.testSaved({ params: { id: added.id } })
    expect(sent).toEqual({ ok: true, message: null })

    // an address that isn't a Discord webhook is refused
    expect(
      (
        await failure(
          api.connections.add({
            body: {
              kind: 'discord',
              name: 'Wrong',
              enabled: true,
              events: [],
              settings: { webhookUrl: 'https://example.org/' },
            },
          }),
        )
      ).code,
    ).toBe('invalid')

    await api.connections.remove({ params: { id: added.id } })
    expect(await api.connections.list()).toEqual([])
    expect((await failure(api.connections.log({ params: { id: added.id } }))).code).toBe(
      'not-found',
    )
  })

  test('Test with the dialog’s settings, saved or not, and the log', async () => {
    const { api, runtime, channels } = await started()
    const draft = await api.connections.test({
      body: { kind: 'webhook', settings: { url: HOOK } },
    })
    expect(draft).toEqual({ ok: true, message: null })
    expect(channels.to(HOOK)).toHaveLength(1)

    channels.answer(HOOK, { status: 404 })
    const refused = await api.connections.test({
      body: { kind: 'webhook', settings: { url: HOOK } },
    })
    expect(refused.ok).toBe(false)
    expect(refused.message).toBeString()
    channels.clearAnswers()

    const hook = await api.connections.add({
      body: {
        kind: 'webhook',
        name: 'Webhook',
        enabled: true,
        events: ['update'],
        settings: { url: HOOK },
      },
    })
    runtime.notifications.notify('update', { version: '9.9.9', url: null }, 'update:9.9.9')
    const log = await api.connections.log({ params: { id: hook.id } })
    expect(log.map((e) => [e.event, e.status])).toEqual([['update', 'pending']])
    expect(log[0]?.createdAt).toMatch(/^\d{4}-\d\d-\d\dT/)
  })

  test('staff only', async () => {
    const { memberApi } = await started()
    expect((await failure(memberApi.connections.list())).code).toBe('forbidden')
    expect(
      (
        await failure(
          memberApi.connections.test({ body: { kind: 'webhook', settings: { url: HOOK } } }),
        )
      ).code,
    ).toBe('forbidden')
  })

  test('a Browser connection without people is for whoever made it', async () => {
    const { api, owner } = await started()
    const added = await api.connections.add({
      body: { kind: 'browser', name: 'Browsers', enabled: true, events: ['health'], settings: {} },
    })
    expect(added.settings.userIds).toEqual([owner.id])
  })
})

describe('web push', () => {
  test('each person’s own browsers', async () => {
    const { api, memberApi } = await started()
    const { publicKey } = await memberApi.connections.pushKey()
    expect(Buffer.from(publicKey, 'base64url')).toHaveLength(65)

    const mine = createPushSubscriber()
    const added = await api.pushSubscriptions.add({
      body: { ...mine.subscription, label: 'Firefox on a Mac' },
    })
    expect(added).toMatchObject({ label: 'Firefox on a Mac', service: 'push.example.net' })
    const theirs = createPushSubscriber()
    await memberApi.pushSubscriptions.add({
      body: { ...theirs.subscription, label: 'Safari on a phone' },
    })
    expect((await api.pushSubscriptions.list()).map((s) => s.label)).toEqual(['Firefox on a Mac'])
    expect((await memberApi.pushSubscriptions.list()).map((s) => s.label)).toEqual([
      'Safari on a phone',
    ])
    // nobody removes another's
    expect(
      (await failure(memberApi.pushSubscriptions.remove({ params: { id: added.id } }))).code,
    ).toBe('not-found')
    await api.pushSubscriptions.remove({ params: { id: added.id } })
    expect(await api.pushSubscriptions.list()).toEqual([])
  })
})

describe('the server’s mail', () => {
  test('an invite is emailed when there’s a mail connection', async () => {
    const { api, channels, runtime } = await started()
    const smtp = await createFakeSmtp()
    smtps.push(smtp)
    // without one, the link is the owner's to pass on
    const before = await api.users.invite({
      body: { displayName: 'Noor', email: 'noor@example.org', role: 'user', libraries: 'all' },
    })
    expect(before.emailedTo ?? null).toBeNull()

    await api.connections.add({
      body: {
        kind: 'email',
        name: 'Mail',
        enabled: true,
        events: [],
        serverMail: true,
        settings: {
          host: smtp.host,
          port: smtp.port,
          security: 'none',
          from: 'highsea <media@example.org>',
          to: 'ines@example.org',
        },
      },
    })
    const invite = await api.users.invite({
      body: { displayName: 'Ola', email: 'ola@example.org', role: 'user', libraries: 'all' },
    })
    expect(invite.emailedTo).toBe('ola@example.org')
    expect(smtp.messages).toHaveLength(1)
    const [mail] = smtp.messages
    expect(mail?.to).toEqual(['ola@example.org'])
    // the invite template: plain text, and HTML with the logo attached by Content-ID
    const read = readMail(mail?.data ?? '')
    const text = read.parts.find((p) => p.type === 'text/plain')?.text
    const html = read.parts.find((p) => p.type === 'text/html')?.text ?? ''
    expect(text).toContain('Ines invited you to')
    expect(text).toContain('Choose a password to finish your account')
    expect(text).toContain(invite.link)
    expect(html).toContain(`href="${invite.link}"`)
    const logo = read.parts.find((p) => p.contentId)
    expect(html).toContain(`src="cid:${logo?.contentId}"`)
    expect(html).not.toMatch(/src="https?:/)
    // the server's mail isn't a notification
    expect(channels.requests).toHaveLength(0)

    await runtime.auth.links.accept(
      invite.link.split('/').pop() as string,
      { password: 'a long enough password' },
      meta,
    )
    const reset = await api.users.resetPassword({ params: { id: invite.user.id } })
    expect(reset.emailedTo).toBe('ola@example.org')
    expect(smtp.messages).toHaveLength(2)
  })
})

describe('a person’s add', () => {
  test('announced once, with a poster that answers without signing in', async () => {
    const { api, app, runtime, channels } = await started()
    const smtp = await createFakeSmtp()
    smtps.push(smtp)
    runtime.network.save({
      ...runtime.network.settings(),
      remoteAccess: 'reverse-proxy',
      externalUrl: 'https://harbor.example.net',
      tls: 'proxy',
    })
    await runtime.metadata.settings.setKey('test-tmdb-key')
    runtime.metadata.settings.update({ region: 'US' })
    const folder = join(runtime.config.dataDir, 'movies')
    mkdirSync(folder, { recursive: true })
    await api.rootFolders.add({ body: { path: folder } })
    await api.connections.add({
      body: {
        kind: 'webhook',
        name: 'Webhook',
        enabled: true,
        events: ['movie-added'],
        settings: { url: HOOK },
      },
    })
    await api.connections.add({
      body: {
        kind: 'email',
        name: 'Ines’s email',
        enabled: true,
        events: ['movie-added'],
        settings: {
          host: smtp.host,
          port: smtp.port,
          security: 'none',
          from: 'highsea <media@example.org>',
          to: 'ines@example.org',
        },
      },
    })
    await api.movies.add({
      body: {
        tmdbId: SINTEL,
        rootFolder: folder,
        monitored: true,
        minimumAvailability: 'released',
        versions: [{ label: '1080p', qualityProfileId: 'qp-hd' }],
      },
    })
    await runtime.jobs.tick()
    await runtime.jobs.idle()
    const bodies = channels.to(HOOK).map((r) => r.json() as { text: string; image: string | null })
    expect(bodies).toHaveLength(1)
    expect(bodies[0]?.text).toContain('Added by Ines.')

    const image = new URL(bodies[0]?.image ?? '')
    const signed = await app.request(`${ORIGIN}${image.pathname}${image.search}`)
    expect(signed.status).not.toBe(401)
    const unsigned = await app.request(`${ORIGIN}${image.pathname}`)
    expect(unsigned.status).toBe(401)
    const forged = await app.request(`${ORIGIN}${image.pathname}?sig=forged`)
    expect(forged.status).toBe(401)

    // the email carries the poster itself, from the image cache, and links nothing remote
    expect(smtp.messages).toHaveLength(1)
    const read = readMail(smtp.messages[0]?.data ?? '')
    const html = read.parts.find((p) => p.type === 'text/html')?.text ?? ''
    const poster = read.parts.find((p) => p.type === 'image/jpeg')
    expect(poster?.contentId).toBeTruthy()
    expect(html).toContain(`src="cid:${poster?.contentId}"`)
    expect(html).not.toMatch(/src="https?:/)
    expect(html).toContain('Open in')
    expect(read.parts.find((p) => p.type === 'text/plain')?.text).toContain(
      'You get this because Ines’s email hears Movie added.',
    )
  })
})

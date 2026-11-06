// SPDX-License-Identifier: AGPL-3.0-only
// The admin's flows outside its pages (one-client-platform-d.md › D3): first-run setup and the
// account sheet ("Your account"), answered from the mock's own api in the contract's shapes.
//
// Setup answers whenever it's asked, as the prototype has always shown it, where the server answers
// 404 once setup is done; Finish names the server and signs the owner in, as the server does. The
// account sheet keeps what it changes for this transport only: the mock's people have no email, no
// recovery codes and no passkeys of their own. Adding a passkey isn't answered (501): it needs a
// browser's WebAuthn ceremony, which the mock can't check.
import type { Server, Session, SetupDetected } from '@highsea-tv/api-contract'
import { createT, defineMessages } from '@highsea-tv/i18n'
import type { User } from '../types.ts'
import type { AdminKit, Answers, Ctx } from './kit.ts'
import { refuse } from './kit.ts'
import { indexerAnswers } from './work-indexers.ts'

export const flowsMessages = defineMessages({
  'flows.wrongPassword': 'That password isn’t right.',
  'flows.wrongCode': 'That code didn’t work. Codes change every 30 seconds.',
  'flows.twoFactorOn': 'Two-step verification is already on.',
  'flows.twoFactorOff': 'Two-step verification is off.',
  'flows.passkeyUnknown': 'That passkey isn’t here any more.',
  'flows.folderUnknown': '{path} doesn’t exist on the server.',
})
const t = createT(flowsMessages)

/** The password the mock refuses, as its sign-in does (packages/mock/src/server.ts). */
const WRONG = 'wrong'
/** The code the mock refuses, as its sign-in's second factor does. */
const ZEROS = '000000'

type Passkey = {
  id: string
  name: string
  deviceType: 'singleDevice' | 'multiDevice'
  backedUp: boolean
  createdAt: string
  lastUsed: string | null
}

/** What the account sheet changed, per person, for this transport. */
type Account = { email: string | null; recoveryLeft: number; passkeys: Passkey[] }

const codes = (seed: string) =>
  Array.from({ length: 10 }, (_, i) => {
    const n = (seed.length * 7919 + i * 104_729).toString(36).padStart(8, '0').slice(-8)
    return `${n.slice(0, 4)}-${n.slice(4)}`
  })

export function flowsAnswers(kit: AdminKit): Answers {
  const { userOf, emit } = kit
  const accounts = new Map<string, Account>()
  const indexers = indexerAnswers(kit) as unknown as {
    catalog: { indexers: (input: { query: { starter?: string } }, ctx: Ctx) => StarterLike[] }
  }
  type StarterLike = { settings: { required: boolean }[] }

  const account = (id: string): Account => {
    let a = accounts.get(id)
    if (!a) {
      a = { email: null, recoveryLeft: 10, passkeys: [] }
      accounts.set(id, a)
    }
    return a
  }
  const person = (ctx: Ctx): User => {
    const u = ctx.srv.state.users.find((x) => x.id === ctx.userId)
    if (!u) throw refuse('unauthorized', t('flows.wrongPassword'))
    return u
  }
  const you = (ctx: Ctx) => {
    const u = person(ctx)
    return { ...userOf(u), email: account(u.id).email, passkeys: account(u.id).passkeys.length }
  }
  const checkPassword = (password: string | null) => {
    if (password === WRONG)
      throw refuse('unauthorized', t('flows.wrongPassword'), { field: 'password' })
  }

  return {
    setup: {
      defaults: () => ({
        dataDir: '/data',
        folders: { movies: '/data/media/movies', downloads: '/data/downloads' },
        serverName: 'highsea',
      }),
      // the mock's own detection, in the contract's shape: its folders without shows and music,
      // and its path's name as the server's
      detect: (_, ctx): SetupDetected => {
        const found = ctx.api.setup.detect()
        return {
          serverName: found.serverName,
          folders: found.folders?.movies
            ? { movies: found.folders.movies, downloads: found.folders.downloads }
            : null,
          address: found.address,
          graphics: found.graphics && {
            name: found.graphics.name,
            path: found.graphics.path.toLowerCase() as 'vaapi',
          },
        }
      },
      listFolders: ({ query }, ctx) => {
        try {
          return ctx.api.fs.list(query.path)
        } catch {
          throw refuse('not-found', t('flows.folderUnknown', { path: query.path }))
        }
      },
      checkHardlinks: ({ query }, ctx) => ctx.api.fs.checkHardlinks(query.a, query.b),
      // the catalog's public starters that need no setting, as the server's are
      starterPack: (_, ctx) =>
        indexers.catalog
          .indexers({ query: { starter: 'true' } }, ctx)
          .filter((d) => d.settings.every((f) => !f.required)) as never,
      languages: (_, ctx) => ctx.api.subtitles.languages(),
      complete: ({ body }, ctx) => {
        ctx.api.setup.complete(body as never)
        const owner = ctx.srv.state.users.find((u) => u.role === 'owner')
        // the transport's hosts keep the names they opened with; the answer carries the new one
        const server = kit.serverOf(ctx) as Server
        return {
          server: {
            ...server,
            name: body.serverName,
            branding: { ...server.branding, name: body.serverName },
          },
          session: kit.signInAs(ctx, owner?.id ?? ctx.userId) as Session,
        }
      },
    },

    me: {
      update: ({ body }, ctx) => {
        const u = person(ctx)
        if (body.displayName !== undefined) u.displayName = body.displayName.trim()
        if (body.email !== undefined) account(u.id).email = body.email || null
        emit('users.updated')
        return you(ctx)
      },
      changePassword: ({ body }) => {
        checkPassword(body.current)
        return undefined
      },
      twoFactor: (_, ctx) => {
        const u = person(ctx)
        return {
          enabled: u.twoFactor,
          // Settings › Security asks it of no role in the mock
          required: false,
          recoveryCodesLeft: u.twoFactor ? account(u.id).recoveryLeft : 0,
        }
      },
      startTwoFactor: ({ body }, ctx) => {
        checkPassword(body.password)
        const u = person(ctx)
        if (u.twoFactor) throw refuse('conflict', t('flows.twoFactorOn'))
        // RFC 4648 base32, as an authenticator app reads it (the Key URI Format's `secret`)
        const secret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'
        const label = encodeURIComponent(`highsea:${u.username}`)
        return { secret, uri: `otpauth://totp/${label}?secret=${secret}&issuer=highsea` }
      },
      enableTwoFactor: ({ body }, ctx) => {
        if (!/^\d{6}$/.test(body.code) || body.code === ZEROS)
          throw refuse('unauthorized', t('flows.wrongCode'), { field: 'code' })
        const u = person(ctx)
        u.twoFactor = true
        account(u.id).recoveryLeft = 10
        emit('users.updated')
        return { recoveryCodes: codes(`${u.id}:on`) }
      },
      disableTwoFactor: ({ body }, ctx) => {
        checkPassword(body.password)
        const u = person(ctx)
        u.twoFactor = false
        emit('users.updated')
        return undefined
      },
      recoveryCodes: ({ body }, ctx) => {
        checkPassword(body.password)
        const u = person(ctx)
        if (!u.twoFactor) throw refuse('conflict', t('flows.twoFactorOff'))
        account(u.id).recoveryLeft = 10
        return { recoveryCodes: codes(`${u.id}:${Date.now()}`) }
      },
      passkeys: (_, ctx) => account(person(ctx).id).passkeys,
      renamePasskey: ({ params, body }, ctx) => {
        const p = account(person(ctx).id).passkeys.find((x) => x.id === params.id)
        if (!p) throw refuse('not-found', t('flows.passkeyUnknown'))
        p.name = body.name.trim()
        return p
      },
      removePasskey: ({ params }, ctx) => {
        const a = account(person(ctx).id)
        if (!a.passkeys.some((x) => x.id === params.id))
          throw refuse('not-found', t('flows.passkeyUnknown'))
        a.passkeys = a.passkeys.filter((x) => x.id !== params.id)
        emit('users.updated')
        return undefined
      },
    },
  } as Answers
}

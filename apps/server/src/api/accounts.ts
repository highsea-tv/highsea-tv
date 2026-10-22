// SPDX-License-Identifier: AGPL-3.0-only
// People and access over HTTP: thin handlers over @highsea-tv/auth (ADR 0023, 0024, 0025).
import { routes } from '@highsea-tv/api-contract'
import { CALLBACK_PATH, type Issued, SECRET_PREFIX, type SignInOutcome } from '@highsea-tv/auth'
import { AppError } from '@highsea-tv/core'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server'
import type { Context } from 'hono'
import { deleteCookie, setCookie } from 'hono/cookie'
import { actor, COOKIE, type Env, me } from './guard.ts'
import {
  apiKeyView,
  auditView,
  deviceView,
  passkeyView,
  sessionView,
  signInView,
  userView,
} from './views.ts'

/** Sets the admin's session cookie (see COOKIE for the attributes and their sources). */
export function setSession(c: Context<Env>, secret: string, expiresAt: number | null) {
  const secure = c.get('client').secure
  // a leftover cookie under the other name would shadow or outlive this one
  deleteCookie(c, secure ? COOKIE.plain : COOKIE.secure, { path: '/', secure: !secure })
  setCookie(c, secure ? COOKIE.secure : COOKIE.plain, secret, {
    httpOnly: true,
    secure,
    sameSite: 'Lax',
    path: '/',
    ...(expiresAt ? { expires: new Date(expiresAt) } : {}),
  })
}

export function clearSession(c: Context<Env>) {
  deleteCookie(c, COOKIE.secure, { path: '/', secure: true })
  deleteCookie(c, COOKIE.plain, { path: '/' })
}

/** An admin session's secret goes in the cookie; an app's token in the body. */
function finish(c: Context<Env>, out: SignInOutcome) {
  const app = out.status === 'signed-in' && out.secret.startsWith(SECRET_PREFIX.token)
  if (out.status === 'signed-in' && !app) setSession(c, out.secret, out.session.expiresAt)
  return signInView(out, app)
}

const signedIn = (issued: Issued): SignInOutcome => ({ status: 'signed-in', ...issued })

export function registerAccounts(app: OpenAPIHono<Env>) {
  const auth = (c: Context<Env>) => c.get('runtime').auth

  // ---------------------------------------------------------------- sign-in

  app.openapi(routes.auth.signIn, async (c) => {
    const input = c.req.valid('json')
    return c.json(finish(c, await auth(c).signIn.password(input, c.get('meta'))), 200)
  })

  app.openapi(routes.auth.twoFactor, (c) =>
    c.json(finish(c, auth(c).signIn.twoFactor(c.req.valid('json'), c.get('meta'))), 200),
  )

  app.openapi(routes.auth.signOut, (c) => {
    const p = me(c)
    if (p.deviceId) auth(c).devices.revoke(p.deviceId, actor(p), c.get('meta'))
    clearSession(c)
    return c.body(null, 204)
  })

  app.openapi(routes.auth.session, (c) => {
    const p = me(c)
    return c.json(
      sessionView({ user: p.user, deviceId: p.deviceId, expiresAt: p.expiresAt, method: p.method }),
      200,
    )
  })

  app.openapi(routes.auth.passkeyOptions, async (c) => {
    const { device } = c.req.valid('json')
    const out = await auth(c).passkeys.signInOptions(c.get('meta'), device)
    return c.json({ challenge: out.challenge, options: { ...out.options } }, 200)
  })

  app.openapi(routes.auth.passkeySignIn, async (c) => {
    const { challenge, response } = c.req.valid('json')
    const issued = await auth(c).passkeys.signIn(
      { challenge, response: response as unknown as AuthenticationResponseJSON },
      c.get('meta'),
    )
    return c.json(finish(c, signedIn(issued)), 200)
  })

  // a redirect, not JSON: served directly and listed in the document from the contract
  app.get(routes.auth.oidcStart.path, async (c) => {
    const invite = c.req.query('invite')
    const url = await auth(c).oidc.start({ invite })
    return c.redirect(url.href, 302)
  })
  app.openAPIRegistry.registerPath(routes.auth.oidcStart)

  app.get(CALLBACK_PATH, async (c) => {
    try {
      const issued = await auth(c).oidc.callback(new URL(c.req.url).search, c.get('meta'))
      setSession(c, issued.secret, issued.session.expiresAt)
      return c.redirect('/', 302)
    } catch (e) {
      const reason =
        e instanceof AppError ? ((e.details as { reason?: string })?.reason ?? e.code) : 'internal'
      return c.redirect(`/login?error=${encodeURIComponent(reason)}`, 302)
    }
  })
  app.openAPIRegistry.registerPath(routes.auth.oidcCallback)

  // ---------------------------------------------------------------- TV pairing

  app.openapi(routes.auth.startPairing, (c) => {
    const p = auth(c).pairing.start(c.req.valid('json').device, c.get('meta'))
    return c.json({ ...p, expiresAt: new Date(p.expiresAt).toISOString() }, 200)
  })

  app.openapi(routes.auth.pollPairing, (c) => {
    const out = auth(c).pairing.poll(c.req.valid('json').pollToken, c.get('meta'))
    return c.json(
      out.status === 'pending'
        ? out
        : { status: 'signed-in' as const, session: sessionView(out.session), token: out.secret },
      200,
    )
  })

  const pairingView = (r: {
    device: { name: string; client: string; appVersion: string }
    address: string
    expiresAt: number
  }) => ({ ...r, expiresAt: new Date(r.expiresAt).toISOString() }) as never

  app.openapi(routes.auth.pairingRequest, (c) =>
    c.json(pairingView(auth(c).pairing.describe(c.req.valid('param').code)), 200),
  )

  app.openapi(routes.auth.approvePairing, (c) => {
    const p = me(c)
    return c.json(
      pairingView(auth(c).pairing.approve(c.req.valid('param').code, actor(p), c.get('meta'))),
      200,
    )
  })

  // ---------------------------------------------------------------- invite and reset links

  app.openapi(routes.links.get, (c) => {
    const info = auth(c).links.info(c.req.valid('param').token)
    return c.json({ ...info, expiresAt: new Date(info.expiresAt).toISOString() }, 200)
  })

  app.openapi(routes.links.accept, async (c) => {
    const out = await auth(c).links.accept(
      c.req.valid('param').token,
      c.req.valid('json'),
      c.get('meta'),
    )
    return c.json(finish(c, signedIn(out)), 200)
  })

  // ---------------------------------------------------------------- your account

  app.openapi(routes.me.update, (c) =>
    c.json(userView(auth(c).me.update(me(c).user.id, c.req.valid('json'))), 200),
  )

  app.openapi(routes.me.changePassword, async (c) => {
    const p = me(c)
    await auth(c).me.changePassword(p.user.id, c.req.valid('json'), p.deviceId, c.get('meta'))
    return c.body(null, 204)
  })

  app.openapi(routes.me.twoFactor, (c) => c.json(auth(c).twoFactor.status(me(c).user.id), 200))

  app.openapi(routes.me.startTwoFactor, async (c) =>
    c.json(await auth(c).twoFactor.start(me(c).user.id, c.req.valid('json').password), 200),
  )

  app.openapi(routes.me.enableTwoFactor, (c) => {
    const codes = auth(c).twoFactor.enable(me(c).user.id, c.req.valid('json').code, c.get('meta'))
    return c.json({ recoveryCodes: codes }, 200)
  })

  app.openapi(routes.me.disableTwoFactor, async (c) => {
    await auth(c).twoFactor.disable(me(c).user.id, c.req.valid('json').password, c.get('meta'))
    return c.body(null, 204)
  })

  app.openapi(routes.me.recoveryCodes, async (c) =>
    c.json(
      {
        recoveryCodes: await auth(c).twoFactor.recoveryCodes(
          me(c).user.id,
          c.req.valid('json').password,
        ),
      },
      200,
    ),
  )

  app.openapi(routes.me.passkeys, (c) =>
    c.json(auth(c).passkeys.list(me(c).user.id).map(passkeyView), 200),
  )

  app.openapi(routes.me.passkeyOptions, async (c) => {
    const out = await auth(c).passkeys.registrationOptions(me(c).user.id, c.get('meta'))
    return c.json({ challenge: out.challenge, options: { ...out.options } }, 200)
  })

  app.openapi(routes.me.addPasskey, async (c) => {
    const { challenge, response, name } = c.req.valid('json')
    const passkey = await auth(c).passkeys.register(
      me(c).user.id,
      { challenge, response: response as unknown as RegistrationResponseJSON, name },
      c.get('meta'),
    )
    return c.json(passkeyView(passkey), 200)
  })

  app.openapi(routes.me.renamePasskey, (c) =>
    c.json(
      passkeyView(
        auth(c).passkeys.rename(me(c).user.id, c.req.valid('param').id, c.req.valid('json').name),
      ),
      200,
    ),
  )

  app.openapi(routes.me.removePasskey, (c) => {
    auth(c).passkeys.remove(me(c).user.id, c.req.valid('param').id, c.get('meta'))
    return c.body(null, 204)
  })

  app.openapi(routes.me.devices, (c) =>
    c.json(auth(c).devices.list(me(c).user.id).map(deviceView), 200),
  )

  // ---------------------------------------------------------------- people

  app.openapi(routes.users.list, (c) => c.json(auth(c).users.list().map(userView), 200))

  app.openapi(routes.users.invite, async (c) => {
    const p = me(c)
    const invite = auth(c).users.invite(c.req.valid('json'), actor(p), c.get('meta'))
    // with the server's mail set, the link is emailed too; the link still comes back (A13)
    const emailed = await c.get('runtime').notifications.mailLink({
      kind: 'invite',
      userId: invite.user.id,
      link: invite.link,
      expiresAt: invite.expiresAt,
      inviter: p.user.displayName,
    })
    return c.json(
      {
        user: userView(invite.user),
        link: invite.link,
        expiresAt: new Date(invite.expiresAt).toISOString(),
        emailedTo: emailed ? invite.user.email : null,
      },
      200,
    )
  })

  app.openapi(routes.users.update, (c) =>
    c.json(
      userView(
        auth(c).users.update(
          c.req.valid('param').id,
          c.req.valid('json'),
          actor(me(c)),
          c.get('meta'),
        ),
      ),
      200,
    ),
  )

  app.openapi(routes.users.remove, (c) => {
    auth(c).users.remove(c.req.valid('param').id, actor(me(c)), c.get('meta'))
    return c.body(null, 204)
  })

  app.openapi(routes.users.resetPassword, async (c) => {
    const { id } = c.req.valid('param')
    const out = auth(c).users.resetLink(id, actor(me(c)), c.get('meta'))
    const emailed = await c.get('runtime').notifications.mailLink({
      kind: 'reset',
      userId: id,
      link: out.link,
      expiresAt: out.expiresAt,
    })
    return c.json(
      {
        link: out.link,
        expiresAt: new Date(out.expiresAt).toISOString(),
        emailedTo: emailed ? (auth(c).users.get(id).email ?? null) : null,
      },
      200,
    )
  })

  app.openapi(routes.users.resetTwoFactor, (c) => {
    auth(c).users.resetTwoFactor(c.req.valid('param').id, actor(me(c)), c.get('meta'))
    return c.body(null, 204)
  })

  app.openapi(routes.users.inviteLink, (c) => {
    const out = auth(c).users.inviteLink(c.req.valid('param').id, actor(me(c)))
    return c.json({ link: out.link, expiresAt: new Date(out.expiresAt).toISOString() }, 200)
  })

  // ---------------------------------------------------------------- devices and keys

  app.openapi(routes.devices.list, (c) =>
    c.json(auth(c).devices.list(c.req.valid('query').userId).map(deviceView), 200),
  )

  app.openapi(routes.devices.revoke, (c) => {
    const p = me(c)
    const { id } = c.req.valid('param')
    const device = auth(c).devices.find(id)
    if (!device) throw new AppError('not-found', 'That device isn’t signed in.')
    if (id === p.deviceId)
      throw new AppError('forbidden', 'That’s the browser you’re using. Sign out instead.', {
        reason: 'self',
      })
    // signing out someone else's device is managing people: the owner's alone (ADR 0032)
    if (device.userId !== p.user.id && p.user.role !== 'owner')
      throw new AppError('forbidden', 'You don’t have access to that.')
    auth(c).devices.revoke(id, actor(p), c.get('meta'))
    return c.body(null, 204)
  })

  app.openapi(routes.apiKeys.list, (c) =>
    c.json(
      auth(c)
        .apiKeys.list(actor(me(c)))
        .map(apiKeyView),
      200,
    ),
  )

  app.openapi(routes.apiKeys.create, (c) => {
    const p = me(c)
    // a key can't make keys: it would outlive its own revocation
    if (p.via === 'key') throw new AppError('forbidden', 'API keys can’t make other keys.')
    const key = auth(c).apiKeys.create(c.req.valid('json'), actor(p), c.get('meta'))
    return c.json({ ...apiKeyView(key), secret: key.secret }, 200)
  })

  app.openapi(routes.apiKeys.revoke, (c) => {
    auth(c).apiKeys.revoke(c.req.valid('param').id, actor(me(c)), c.get('meta'))
    return c.body(null, 204)
  })

  app.openapi(routes.audit.list, (c) => {
    const page = auth(c).audit(c.req.valid('query'))
    return c.json({ items: page.items.map(auditView), next: page.next }, 200)
  })

  // ---------------------------------------------------------------- security settings

  app.openapi(routes.settings.security, (c) => c.json(auth(c).security.get(), 200))

  app.openapi(routes.settings.saveSecurity, (c) => {
    const p = me(c)
    if (p.via === 'key')
      throw new AppError('forbidden', 'Security settings can’t be changed with an API key.')
    return c.json(auth(c).security.save(c.req.valid('json'), actor(p), c.get('meta')), 200)
  })
}

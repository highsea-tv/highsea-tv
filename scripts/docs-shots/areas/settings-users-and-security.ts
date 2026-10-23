// SPDX-License-Identifier: AGPL-3.0-only
// The Users and security guide's screenshots (apps/docs/content/settings/users-and-security/):
// Settings › Users and devices with its tabs and dialogs, Your account, and Settings › Security.
import type { Page } from 'playwright-core'
import type { Area } from '../shot.ts'

// a tab clicked keeps its focus ring in the shot, so focus moves off it
const tab = (name: string) => async (p: Page) => {
  await p.getByRole('tab', { name }).click()
  await p.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
}
const account = (p: Page) => p.getByRole('button', { name: 'Your account' }).first().click()
const section = (name: string) => (p: Page) => p.getByRole('dialog').getByRole('region', { name })
const main = (p: Page) => p.locator('main')
const dialog = (p: Page) => p.getByRole('dialog')

export default {
  // the seed turns off two-step for the owner and admins so the sweep can sign in with passwords;
  // the runner has signed in by now, so Security shows the server's default again
  prepare: async (c) => {
    const security = await c.api<Record<string, unknown>>('GET', '/settings/security')
    await c.api('PUT', '/settings/security', { ...security, twoFactor: true })
  },
  shots: [
    { name: 'people', path: '/settings/users', crop: main },
    {
      name: 'invite',
      path: '/settings/users',
      act: (p) => p.getByRole('button', { name: 'Invite someone' }).click(),
      crop: dialog,
    },
    {
      name: 'edit',
      path: '/settings/users',
      act: (p) => p.getByRole('button', { name: 'Edit Theo' }).click(),
      crop: dialog,
      height: 600,
    },
    {
      name: 'person-menu',
      path: '/settings/users',
      act: (p) => p.getByRole('button', { name: 'More for Theo' }).click(),
      height: 600,
    },
    {
      name: 'invite-menu',
      path: '/settings/users',
      act: (p) => p.getByRole('button', { name: 'More for Mara' }).click(),
      height: 600,
    },
    {
      name: 'devices',
      path: '/settings/users',
      act: tab('Devices'),
      width: 1440,
      height: 660,
    },
    { name: 'api-keys', path: '/settings/users', act: tab('API keys'), height: 420 },
    {
      name: 'new-api-key',
      path: '/settings/users',
      act: async (p) => {
        await tab('API keys')(p)
        await p.getByRole('button', { name: 'New API key' }).click()
      },
      crop: dialog,
    },
    { name: 'account', path: '/', act: account, crop: dialog },
    {
      name: 'account-two-step',
      path: '/',
      act: async (p) => {
        await account(p)
        await section('Two-step verification')(p).scrollIntoViewIfNeeded()
      },
      crop: section('Two-step verification'),
    },
    {
      name: 'two-step-setup',
      path: '/',
      act: async (p) => {
        await account(p)
        const s = section('Two-step verification')(p)
        await s.getByRole('button', { name: 'Set up' }).click()
        await s.getByLabel('Password', { exact: true }).fill('harbor harbor harbor')
        await s.getByRole('button', { name: 'Continue' }).click()
        await p.getByRole('img', { name: 'QR code for your authenticator app' }).waitFor()
        await s.scrollIntoViewIfNeeded()
      },
      crop: section('Two-step verification'),
      height: 1000,
    },
    {
      name: 'account-passkeys',
      path: '/',
      act: async (p) => {
        await account(p)
        await section('Passkeys')(p).scrollIntoViewIfNeeded()
      },
      crop: section('Passkeys'),
    },
    { name: 'security', path: '/settings/security', crop: main, height: 820 },
    {
      // switched on and not saved, for its fields
      name: 'single-sign-on',
      path: '/settings/security',
      act: (p) => p.getByRole('switch', { name: 'Offer single sign-on' }).click(),
      crop: (p) =>
        p
          .locator('section')
          .filter({ has: p.getByRole('heading', { name: 'Single sign-on (OIDC)' }) })
          .last(),
      height: 1200,
    },
  ],
} satisfies Area

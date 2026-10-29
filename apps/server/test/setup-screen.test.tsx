// SPDX-License-Identifier: AGPL-3.0-only
// A2 Setup as install-simplicity B shrank it (4.3c), rendered against a fake of the API: with
// everything found, the owner and then Review; with no folders found, Folders as a step; Review's
// editors in place; the owner's own TMDB key, optional and never stored; the server refusing a
// field; and progress across a reload.
import './dom.ts'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import type { SetupDetected } from '@highsea-tv/api-contract'

const { act, cleanup, render, within } = await import('@testing-library/react')
const { default: userEvent } = await import('@testing-library/user-event')
const { createClient } = await import('@highsea-tv/sdk')
const { ClientProvider } = await import('@highsea-tv/sdk/react')
const { TooltipProvider } = await import('@highsea-tv/ui-web')
const { Setup } = await import('../src/admin/setup.tsx')
const { metadataLocale } = await import('../src/admin/metadata-locale.ts')

// ---------------------------------------------------------------- the fake API

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const failure = (code: string, message: string, status: number, details?: unknown) =>
  json({ error: { code, message, details } }, status)

const FOUND: SetupDetected = {
  serverName: 'Harbor',
  folders: { movies: '/data/media/movies', downloads: '/data/downloads' },
  address: '192.168.1.20:3000',
  graphics: { name: 'Intel UHD Graphics 770', path: 'vaapi' },
}

let state: {
  detected: SetupDetected
  detectFails: boolean
  /** What POST /setup answers, when not the server's name. */
  complete: Response | null
  requests: { method: string; path: string; body: unknown }[]
}

async function api(url: string, init: RequestInit = {}): Promise<Response> {
  const u = new URL(url, 'http://localhost')
  const method = init.method ?? 'GET'
  const path = u.pathname
  if (path === '/api/v1/events')
    return new Response(new ReadableStream(), { headers: { 'content-type': 'text/event-stream' } })
  const body = init.body ? JSON.parse(String(init.body)) : undefined
  state.requests.push({ method, path, body })
  switch (`${method} ${path}`) {
    case 'GET /api/v1/setup/detect':
      return state.detectFails
        ? failure('unavailable', 'The server didn’t answer.', 503)
        : json(state.detected)
    case 'GET /api/v1/setup/defaults':
      return json({
        dataDir: '/data',
        folders: { movies: '/data/media/movies', downloads: '/data/downloads' },
        serverName: 'highsea',
      })
    case 'GET /api/v1/setup/indexers':
      return json([
        {
          id: 'internet-archive',
          name: 'Internet Archive',
          description: 'Public-domain feature films, shared over BitTorrent.',
          privacy: 'public',
          starter: true,
          settings: [],
        },
      ])
    case 'GET /api/v1/setup/languages':
      return json([
        { code: 'zh', name: 'Chinese' },
        { code: 'en', name: 'English' },
        { code: 'fr', name: 'French' },
        { code: 'is', name: 'Icelandic' },
        { code: 'pt', name: 'Portuguese' },
        { code: 'es', name: 'Spanish' },
      ])
    case 'GET /api/v1/setup/fs':
      return json(
        u.searchParams.get('path') === '/data'
          ? [
              { name: 'films', path: '/data/films' },
              { name: 'torrents', path: '/data/torrents' },
            ]
          : [],
      )
    case 'GET /api/v1/setup/fs/hardlinks':
      return json(
        u.searchParams.get('b') === '/data/films'
          ? { ok: true, sameDevice: false, message: 'The folders are on different disks.' }
          : { ok: true, sameDevice: true, message: 'Both folders are on the same disk.' },
      )
    case 'POST /api/v1/setup':
      return state.complete ?? json({ server: { id: 'srv_1', name: body.serverName } })
  }
  return failure('not-found', `Nothing at ${path}.`, 404)
}

beforeEach(() => {
  localStorage.clear()
  state = { detected: FOUND, detectFails: false, complete: null, requests: [] }
})
afterEach(() => cleanup())

const settle = () =>
  act(async () => {
    for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0))
  })

async function open() {
  const client = createClient({ fetch: api as never })
  await act(async () => {
    render(
      <ClientProvider client={client}>
        <TooltipProvider>
          <Setup />
        </TooltipProvider>
      </ClientProvider>,
    )
  })
  await settle()
  return { user: userEvent.setup(), page: within(document.body) }
}

type User = ReturnType<typeof userEvent.setup>
type Page = ReturnType<typeof within>

const heading = (page: Page, name: string) => page.getByRole('heading', { level: 1, name })
const sent = () =>
  state.requests.filter((r) => r.method === 'POST' && r.path === '/api/v1/setup').at(-1)?.body as
    | Record<string, unknown>
    | undefined

async function owner(user: User, page: Page) {
  await user.type(page.getByLabelText('Your name'), 'Ana Lima')
  await user.type(page.getByLabelText('Username'), 'ana')
  await user.type(page.getByLabelText('Password'), 'correct horse battery')
  await user.type(page.getByLabelText('Confirm password'), 'correct horse battery')
}

async function toReview() {
  const opened = await open()
  await owner(opened.user, opened.page)
  await opened.user.click(opened.page.getByRole('button', { name: 'Continue' }))
  await settle()
  expect(heading(opened.page, 'Check and finish')).toBeTruthy()
  return opened
}

// ---------------------------------------------------------------- with everything found

describe('setup with everything found', () => {
  test('two steps: the owner, with the host’s name filled in, then Review', async () => {
    const { user, page } = await open()
    expect(page.getByText('Step 1 of 2')).toBeTruthy()
    expect(heading(page, 'Create the owner account')).toBeTruthy()
    expect((page.getByLabelText('Server name') as HTMLInputElement).value).toBe('Harbor')
    expect(page.getByText('From this computer’s name. Everyone who connects sees it.')).toBeTruthy()

    // the owner's checks say so in place
    await user.click(page.getByRole('button', { name: 'Continue' }))
    expect(page.getByText('Enter your name.')).toBeTruthy()
    expect(page.getByText('Use at least 10 characters.')).toBeTruthy()
    await owner(user, page)
    await user.type(page.getByLabelText('Confirm password'), 'x')
    await user.click(page.getByRole('button', { name: 'Continue' }))
    expect(page.getByText('The passwords don’t match.')).toBeTruthy()
  })

  test('Review lists what highsea decided, from what it found', async () => {
    const { page } = await toReview()
    await settle()
    expect(page.getByText('Harbor')).toBeTruthy()
    expect(page.getByText('/data/media/movies')).toBeTruthy()
    expect(page.getByText('Same disk, so imports are hardlinked.')).toBeTruthy()
    expect(page.getByText('From TMDB, with highsea’s key')).toBeTruthy()
    expect(page.getByText('Internet Archive')).toBeTruthy()
    expect(page.getByText('From this browser’s languages.')).toBeTruthy()
    expect(page.getByText('192.168.1.20:3000')).toBeTruthy()
    expect(page.getByText('This server’s address. Apps on your network find it here.')).toBeTruthy()
    expect(page.getByText('Only at home')).toBeTruthy()
    expect(page.getByText('Intel UHD Graphics 770, through VAAPI')).toBeTruthy()
    expect(page.getByText('Not linked')).toBeTruthy()
    // folders were found, so they open in place rather than as a step
    expect(page.getByRole('button', { name: 'Change folders' }).getAttribute('aria-expanded')).toBe(
      'false',
    )
  })

  test('Finish sends what was found, the browser’s zone and locale, and no key', async () => {
    const { user, page } = await toReview()
    await user.click(page.getByRole('button', { name: 'Finish setup' }))
    await settle()
    expect(sent()).toEqual({
      serverName: 'Harbor',
      owner: { displayName: 'Ana Lima', username: 'ana', password: 'correct horse battery' },
      folders: FOUND.folders,
      indexers: ['internet-archive'],
      subtitleLanguages: ['en'],
      remoteAccess: { kind: 'local-only' },
      cloudLink: false,
      metadata: metadataLocale(navigator.language),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      address: '192.168.1.20:3000',
    })
    expect(localStorage.getItem('highsea:setup')).toBeNull()
  })
})

// ---------------------------------------------------------------- Review's editors

describe('setup’s Review editors', () => {
  test('a line opens in place, checks on Done, and loses its note once changed', async () => {
    const { user, page } = await toReview()
    await user.click(page.getByRole('button', { name: 'Change subtitles' }))
    await settle()
    await user.click(page.getByRole('button', { name: 'Spanish' }))
    expect(
      page.getByText('English, then Spanish, in that order. The first is preferred.'),
    ).toBeTruthy()
    await user.click(page.getByRole('button', { name: 'Done with subtitles' }))
    expect(page.getByText('English, then Spanish')).toBeTruthy()
    expect(page.queryByText('From this browser’s languages.')).toBeNull()

    // none picked can't be Done
    await user.click(page.getByRole('button', { name: 'Change subtitles' }))
    await user.click(page.getByRole('button', { name: 'English' }))
    await user.click(page.getByRole('button', { name: 'Spanish' }))
    await user.click(page.getByRole('button', { name: 'Done with subtitles' }))
    expect(
      page.getByText('Pick at least one language, or turn subtitles off later in Settings.'),
    ).toBeTruthy()
  })

  test('remote access is opened only by choosing it, and its address is checked', async () => {
    const { user, page } = await toReview()
    await user.click(page.getByRole('button', { name: 'Change away from home' }))
    await user.click(page.getByRole('radio', { name: /reverse proxy/ }))
    await user.type(page.getByLabelText('Public address'), 'movies.example.com')
    await user.click(page.getByRole('button', { name: 'Done with away from home' }))
    expect(page.getByText('Enter the full address, starting with https://')).toBeTruthy()
    await user.clear(page.getByLabelText('Public address'))
    await user.type(page.getByLabelText('Public address'), 'https://movies.example.com')
    await user.click(page.getByRole('button', { name: 'Done with away from home' }))
    expect(page.getByText('Reverse proxy at https://movies.example.com')).toBeTruthy()

    await user.click(page.getByRole('button', { name: 'Change away from home' }))
    await user.click(page.getByRole('radio', { name: /Forward a port/ }))
    await user.click(page.getByRole('button', { name: 'Done with away from home' }))
    expect(page.getByText('Port 8484, forwarded by your router')).toBeTruthy()
    await user.click(page.getByRole('button', { name: 'Finish setup' }))
    await settle()
    expect(sent()?.remoteAccess).toEqual({ kind: 'port-forward', port: 8484 })
  })

  test('an editor left wrong opens again on Finish, which sends nothing', async () => {
    const { user, page } = await toReview()
    await user.click(page.getByRole('button', { name: 'Change address on your network' }))
    await user.clear(page.getByLabelText('Address on your network'))
    await user.type(page.getByLabelText('Address on your network'), 'not an address')
    await user.click(page.getByRole('button', { name: 'Done with address on your network' }))
    expect(page.getByText('Enter the address apps use, such as 192.168.1.20:3000.')).toBeTruthy()
    // Finish with it still wrong
    await user.click(page.getByRole('button', { name: 'Finish setup' }))
    expect(page.getByText('Enter the address apps use, such as 192.168.1.20:3000.')).toBeTruthy()
    expect(sent()).toBeUndefined()
  })

  test('the owner’s own key is optional, shows by its last four, and is never stored', async () => {
    const { user, page } = await toReview()
    await user.click(page.getByRole('button', { name: 'Change movie details' }))
    await user.type(page.getByLabelText('Your own TMDB key'), 'eyJhbGciOiJIUzI1NiJ9.good-3f9a')
    await user.click(page.getByRole('button', { name: 'Done with movie details' }))
    expect(page.getByText('From TMDB, with your key ending in 3f9a')).toBeTruthy()
    expect(localStorage.getItem('highsea:setup')).not.toContain('3f9a')
    await user.click(page.getByRole('button', { name: 'Finish setup' }))
    await settle()
    expect(sent()?.metadata).toEqual({
      ...metadataLocale(navigator.language),
      key: 'eyJhbGciOiJIUzI1NiJ9.good-3f9a',
    })
  })

  test('a key TMDB refuses opens its line with the reason', async () => {
    const { user, page } = await toReview()
    state.complete = failure('invalid', 'Invalid API key.', 400, { reason: 'tmdb-key-rejected' })
    await user.click(page.getByRole('button', { name: 'Change movie details' }))
    await user.type(page.getByLabelText('Your own TMDB key'), 'wrong')
    await user.click(page.getByRole('button', { name: 'Done with movie details' }))
    await user.click(page.getByRole('button', { name: 'Finish setup' }))
    await settle()
    expect(
      page.getByText('TMDB didn’t accept that key. Copy it again from your TMDB account.'),
    ).toBeTruthy()
    expect(page.getByLabelText('Your own TMDB key')).toBeTruthy()
  })

  test('a field the server refuses goes back to where it’s asked', async () => {
    const { user, page } = await toReview()
    state.complete = failure('invalid', 'That name is taken by the system.', 400, {
      field: 'serverName',
    })
    await user.click(page.getByRole('button', { name: 'Finish setup' }))
    await settle()
    expect(heading(page, 'Create the owner account')).toBeTruthy()
    expect(page.getByText('That name is taken by the system.')).toBeTruthy()
  })

  test('a line that was asked goes back to its step', async () => {
    const { user, page } = await toReview()
    await user.click(page.getByRole('button', { name: 'Change server name' }))
    expect(heading(page, 'Create the owner account')).toBeTruthy()
  })
})

// ---------------------------------------------------------------- with nothing found

describe('setup with nothing found', () => {
  beforeEach(() => {
    state.detected = { serverName: null, folders: null, address: null, graphics: null }
  })

  test('Folders becomes a step, picked in the folder browser', async () => {
    const { user, page } = await open()
    expect(page.getByText('Step 1 of 3')).toBeTruthy()
    expect((page.getByLabelText('Server name') as HTMLInputElement).value).toBe('')
    expect(page.getByText('Everyone who connects sees this name.')).toBeTruthy()
    await owner(user, page)
    await user.click(page.getByRole('button', { name: 'Continue' }))
    expect(page.getByText('Give the server a name.')).toBeTruthy()
    await user.type(page.getByLabelText('Server name'), 'Lighthouse')
    await user.click(page.getByRole('button', { name: 'Continue' }))
    await settle()

    expect(heading(page, 'Choose your folders')).toBeTruthy()
    await user.click(page.getByRole('button', { name: 'Continue' }))
    expect(page.getByText('Pick a folder for movies.')).toBeTruthy()
    await user.click(page.getAllByRole('button', { name: 'Browse' })[0] as HTMLElement)
    await settle()
    const picker = page.getByRole('dialog', { name: 'Choose the movies folder' })
    await user.click(within(picker).getByRole('button', { name: 'films' }))
    await settle()
    expect(
      within(picker).getByText('No folders inside. Use this one, or go up a level.'),
    ).toBeTruthy()
    await user.click(within(picker).getByRole('button', { name: 'Use this folder' }))
    await user.type(page.getByLabelText('Downloads folder'), '/data/torrents')
    await settle()
    expect(page.getByText('Imports will be copied')).toBeTruthy()
    await user.click(page.getByRole('button', { name: 'Continue' }))
    await settle()

    expect(heading(page, 'Check and finish')).toBeTruthy()
    expect(page.getByText('This computer’s processor')).toBeTruthy()
    // a bridge network hides the host's address: the one this browser used stands in
    expect(page.getByText(/The address you opened setup at/)).toBeTruthy()
    expect(page.getByText(location.host)).toBeTruthy()
    // the folders were asked, so their line goes back to the step
    await user.click(page.getByRole('button', { name: 'Change folders' }))
    expect(heading(page, 'Choose your folders')).toBeTruthy()
  })
})

// ---------------------------------------------------------------- states and storage

describe('setup’s states', () => {
  test('a server that doesn’t answer says so, with Try again', async () => {
    state.detectFails = true
    const { user, page } = await open()
    expect(page.getByText('Can’t reach the server')).toBeTruthy()
    state.detectFails = false
    await user.click(page.getByRole('button', { name: 'Try again' }))
    await settle()
    expect(heading(page, 'Create the owner account')).toBeTruthy()
  })

  test('progress survives a reload without the password; Start over clears it', async () => {
    await toReview()
    const kept = localStorage.getItem('highsea:setup') ?? ''
    expect(kept).not.toContain('correct horse battery')
    cleanup()

    const { user, page } = await open()
    expect(heading(page, 'Check and finish')).toBeTruthy()
    expect(page.getByText('Ana Lima')).toBeTruthy()
    // Finish asks for the password again
    await user.click(page.getByRole('button', { name: 'Finish setup' }))
    expect(heading(page, 'Create the owner account')).toBeTruthy()
    expect(page.getByText(/the password isn’t kept when the page reloads/)).toBeTruthy()
    expect(sent()).toBeUndefined()

    await user.click(page.getByRole('button', { name: 'Start over' }))
    await settle()
    expect(heading(page, 'Create the owner account')).toBeTruthy()
    expect((page.getByLabelText('Your name') as HTMLInputElement).value).toBe('')
    expect((page.getByLabelText('Server name') as HTMLInputElement).value).toBe('Harbor')
  })

  test('a draft from the nine-step setup starts again', async () => {
    localStorage.setItem(
      'highsea:setup',
      JSON.stringify({ step: 4, reached: 4, draft: { serverName: 'Old' } }),
    )
    const { page } = await open()
    expect(heading(page, 'Create the owner account')).toBeTruthy()
    expect((page.getByLabelText('Server name') as HTMLInputElement).value).toBe('Harbor')
  })
})

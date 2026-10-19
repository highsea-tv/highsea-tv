// SPDX-License-Identifier: AGPL-3.0-only
// Checkpoint 3 flows, walked as a user would: connect to a server and sign in; acknowledge the
// owner's announcement and use the home; browse the library; open a title and play it, with the
// player's tracks and subtitle nudge; and the connectivity states. The TV's D-pad moves need real
// layout, so they're walked in a browser before each checkpoint; here the TV screens are checked
// for their content and their actions.
import './dom.ts'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { act, cleanup, render, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { memoryLocation } from 'wouter/memory-location'
import { DISCOVERY_MS } from '../src/client/connect.ts'
import { createMock } from '../src/mock/client.ts'
import { type Connection, defaultState } from '../src/proto/state.ts'
import { ScreenApp } from '../src/screen/screen.tsx'
import { classes, collect, unknownClasses, violations } from './check.ts'

beforeEach(() => localStorage.clear())
afterEach(() => cleanup())

const page = () => within(document.body)

const settle = () =>
  act(async () => {
    for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0))
  })

const wait = (ms: number) => act(() => new Promise((r) => setTimeout(r, ms)))

async function open(path: string, connection: Connection = 'local') {
  const mock = createMock()
  const location = memoryLocation({ path, record: true })
  const state = { ...defaultState, data: 'populated' as const, time: 'pause' as const, connection }
  await act(async () => {
    render(<ScreenApp mock={mock} state={state} hook={location.hook} latency={0} />)
  })
  await settle()
  return { mock, location, user: userEvent.setup() }
}

async function clean(modal?: Element) {
  collect()
  expect(await violations(modal)).toEqual([])
}

/** The owner's acknowledge-required announcement comes first on every client home. */
async function acknowledge(user: ReturnType<typeof userEvent.setup>) {
  const dialog = page().getByRole('dialog', { name: 'Harbor has a new remote address' })
  await clean(dialog)
  await user.click(within(dialog).getByRole('button', { name: 'Got it' }))
  await settle()
}

describe('C1 connect', () => {
  test('servers answer discovery over time; an address that answers leads to sign-in and 2FA', async () => {
    const { location, user } = await open('/web/connect')
    expect(page().getByText('Looking…')).toBeTruthy()
    expect(page().queryByRole('button', { name: /^Den/ })).toBeNull()
    await wait(DISCOVERY_MS + 100)
    expect(page().getByRole('button', { name: /^Den/ })).toBeTruthy()
    await clean()

    await user.type(page().getByLabelText('Add a server by address'), 'nowhere.example')
    await user.click(page().getByRole('button', { name: 'Connect' }))
    await settle()
    expect(page().getByText(/Nothing answered at nowhere\.example/)).toBeTruthy()

    await user.clear(page().getByLabelText('Add a server by address'))
    await user.type(page().getByLabelText('Add a server by address'), 'harbor.example.net')
    await user.click(page().getByRole('button', { name: 'Connect' }))
    await settle()
    expect(page().getByRole('heading', { name: 'Sign in to Harbor' })).toBeTruthy()
    expect(page().getByText(/Remotely, through/)).toBeTruthy()
    await clean()

    await user.type(page().getByLabelText('Username'), 'ines')
    await user.type(page().getByLabelText('Password'), 'correct horse')
    await user.click(page().getByRole('button', { name: 'Sign in' }))
    await settle()
    await user.type(page().getByLabelText('Code'), '123456')
    await user.click(page().getByRole('button', { name: 'Verify' }))
    await settle()
    expect(location.history?.at(-1)).toBe('/web/')
  })

  test('the TV signs in by code, and shows the code and where to enter it', async () => {
    await open('/tv/connect')
    expect(page().getByRole('heading', { name: 'Sign in with your phone' })).toBeTruthy()
    expect(page().getByText('KQ7-4PM')).toBeTruthy()
    expect(page().getByRole('img', { name: 'QR code for the sign-in link' })).toBeTruthy()
    await clean()
  })

  test('unreachable: every client says so and offers a way out', async () => {
    await open('/web', 'offline')
    expect(page().getByText('Can’t reach Harbor')).toBeTruthy()
    expect(page().getByRole('button', { name: 'Switch server' })).toBeTruthy()
    await clean()
    cleanup()
    await open('/mobile', 'offline')
    expect(page().getByRole('link', { name: 'Watch downloads' })).toBeTruthy()
    cleanup()
    await open('/tv', 'offline')
    expect(page().getByRole('heading', { name: 'Can’t reach Harbor' })).toBeTruthy()
  })

  test('remote: the server switcher says how it’s connected', async () => {
    const { user } = await open('/web', 'remote')
    await acknowledge(user)
    expect(page().getByText('Connected remotely')).toBeTruthy()
  })
})

describe('C2 home', () => {
  test('web: acknowledge, pick a featured title, dismiss the banner', async () => {
    const { mock, user } = await open('/web')
    await acknowledge(user)
    expect(mock.servers.populated.state.seen['u-ines']).toContain('an-new-address')
    expect(page().getByRole('heading', { name: 'Sintel' })).toBeTruthy()
    expect(page().getByRole('heading', { name: 'Continue watching' })).toBeTruthy()
    await clean()
    await user.click(page().getByRole('button', { name: 'Show Spring' }))
    expect(page().getByRole('heading', { name: 'Spring' })).toBeTruthy()
    const banners = page().getByRole('region', { name: 'Announcements' })
    await user.click(within(banners).getByRole('button', { name: 'Dismiss' }))
    await settle()
    expect(page().queryByText('Movie night is Friday')).toBeNull()
  })

  test('mobile: the card, the featured carousel and the tabs', async () => {
    const { user } = await open('/mobile')
    await acknowledge(user)
    expect(page().getByText('Movie night is Friday')).toBeTruthy()
    expect(page().getByRole('list', { name: 'Featured on Harbor' })).toBeTruthy()
    const tabs = page().getByRole('navigation', { name: 'Main' })
    expect(
      within(tabs)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Home', 'Search', 'Library', 'Offline', 'You'])
    await clean()
  })

  test('TV: acknowledge, then the hero with Play and the global navigation', async () => {
    const { user } = await open('/tv')
    await user.click(page().getByRole('button', { name: 'Got it' }))
    await settle()
    expect(page().getByRole('heading', { level: 1, name: 'Sintel' })).toBeTruthy()
    expect(page().getByRole('link', { name: /Play/ }).getAttribute('href')).toBe('#/tv/play/1')
    expect(page().getByRole('navigation', { name: 'Main' }).dataset.isolate).toBe('')
    await clean()
  })

  test('TV: only the featured row binds the hero', async () => {
    const { user } = await open('/tv')
    await user.click(page().getByRole('button', { name: 'Got it' }))
    await settle()
    const row = (name: string) => within(page().getByRole('region', { name }))
    act(() => row('Recently added').getByRole('link', { name: 'Agent 327, 2017' }).focus())
    await act(() => new Promise((r) => setTimeout(r, 300)))
    expect(page().getByRole('heading', { level: 1, name: 'Sintel' })).toBeTruthy()
    act(() => row('Featured on Harbor').getByRole('link', { name: 'Spring, 2019' }).focus())
    await act(() => new Promise((r) => setTimeout(r, 300)))
    expect(page().getByRole('heading', { level: 1, name: 'Spring' })).toBeTruthy()
    await clean()
  })
})

describe('C3 library', () => {
  test('web: filter by genre', async () => {
    const { user } = await open('/web/library')
    await acknowledge(user)
    const grid = () => within(page().getByRole('list', { name: 'Movies' }))
    const all = grid().getAllByRole('listitem').length
    expect(page().getByText(`${all} movies`)).toBeTruthy()
    await user.click(page().getByRole('combobox', { name: 'Genre' }))
    await user.click(page().getByRole('option', { name: 'Horror' }))
    expect(grid().getAllByRole('listitem').length).toBeLessThan(all)
    await clean()
  })

  test('TV: the alphabet rail has only letters with titles', async () => {
    await open('/tv/library')
    const rail = page().getByRole('navigation', { name: 'Jump to a letter' })
    expect((within(rail).getByRole('button', { name: 'C' }) as HTMLButtonElement).disabled).toBe(
      false,
    )
    expect((within(rail).getByRole('button', { name: 'Q' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    // every poster carries its title and year
    expect(page().getByRole('link', { name: 'Charade, 1963' })).toBeTruthy()
    await clean()
  })
})

describe('C4 item detail', () => {
  test('web: Resume where you left off, or start over', async () => {
    const { user } = await open('/web/movies/4')
    await acknowledge(user)
    expect(page().getByRole('heading', { level: 1, name: 'Tears of Steel' })).toBeTruthy()
    expect(page().getByRole('link', { name: 'Resume' }).getAttribute('href')).toBe('#/web/play/4')
    expect(page().getByRole('link', { name: 'Play from the start' }).getAttribute('href')).toBe(
      '#/web/play/4/start',
    )
    expect(page().getByText('Derek de Lint')).toBeTruthy()
    await clean()
  })

  test('a title that isn’t on the server says so', async () => {
    const { user } = await open('/web/movies/107')
    await acknowledge(user)
    expect(page().getByText('That title isn’t on this server.')).toBeTruthy()
  })
})

describe('C5 player', () => {
  test('web: resumes, pauses, and the subtitle nudge saves for the title', async () => {
    const { mock, user } = await open('/web/play/4')
    // Tears of Steel was 35% through: 4:12 of 12:00
    expect(page().getByRole('slider', { name: 'Position' }).getAttribute('aria-valuetext')).toBe(
      '4:12 of 12:00',
    )
    await user.click(page().getByRole('button', { name: 'Pause' }))
    expect(page().getByRole('button', { name: 'Play' })).toBeTruthy()
    await user.click(page().getByRole('button', { name: 'Audio and subtitles' }))
    const panel = page().getByRole('complementary', { name: 'Audio and subtitles' })
    await user.click(within(panel).getByRole('radio', { name: 'English' }))
    await user.click(within(panel).getByRole('button', { name: 'Show subtitles 50 ms later' }))
    await user.click(within(panel).getByRole('button', { name: 'Show subtitles 50 ms later' }))
    expect(within(panel).getByText('+100 ms')).toBeTruthy()
    expect(page().getByText('I didn’t think anyone would find this place.')).toBeTruthy()
    await settle()
    expect(mock.servers.populated.state.prefs['u-ines:4']).toMatchObject({ subtitleOffsetMs: 100 })
    await clean()
  })

  test('TV: the scrubber, the mapping legend and the tracks', async () => {
    await open('/tv/play/4')
    expect(page().getByRole('slider', { name: 'Position' })).toBeTruthy()
    expect(page().getByText('◀ ▶ Seek 10 s')).toBeTruthy()
    await clean()
  })
})

describe('stylesheet', () => {
  test('every class the client flows render is a real utility', async () => {
    expect(classes.size).toBeGreaterThan(50)
    expect(await unknownClasses()).toEqual([])
  })
})

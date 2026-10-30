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
import { resetPeople, setAskOnLaunch } from '../src/tv/people.ts'
import { skipLaunch } from '../src/tv/tv-app.tsx'
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
    skipLaunch()
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
  test('web: acknowledge, the featured card, a film row, dismiss the banner', async () => {
    const { mock, user } = await open('/web')
    await acknowledge(user)
    expect(mock.servers.populated.state.seen['u-ines']).toContain('an-new-address')
    const [featured] = page().getAllByRole('link', { name: /^Sintel, / })
    if (!featured) throw new Error('no featured card')
    expect(featured.getAttribute('href')).toBe('#/web/movies/1')
    expect(within(featured).getByRole('heading', { level: 2, name: 'Sintel' })).toBeTruthy()
    expect(page().getByRole('heading', { name: 'Continue watching' })).toBeTruthy()
    await clean()
    // a film row's card changes film with Right while it has focus
    const [row] = page()
      .getAllByRole('region')
      .filter((r) => r.querySelector('[aria-describedby]'))
    if (!row) throw new Error('no film row')
    const card = row.querySelector<HTMLAnchorElement>('a[aria-describedby]')
    const before = card?.getAttribute('href')
    card?.focus()
    await user.keyboard('{ArrowRight}')
    expect(card?.getAttribute('href')).not.toBe(before)
    const banners = page().getByRole('region', { name: 'Announcement' })
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

  test('TV: acknowledge, then the featured cards and the global navigation', async () => {
    skipLaunch()
    const { user } = await open('/tv')
    await user.click(page().getByRole('button', { name: 'Got it' }))
    await settle()
    const featured = within(page().getByRole('region', { name: 'Featured on Harbor' }))
    const [first] = featured.getAllByRole('link')
    if (!first) throw new Error('no featured card')
    expect(first.getAttribute('href')).toBe('#/tv/movies/1')
    expect(within(first).getByRole('heading', { level: 2, name: 'Sintel' })).toBeTruthy()
    expect(page().getByRole('navigation', { name: 'Main' }).dataset.isolate).toBe('')
    await clean()
  })

  test('TV: the featured titles are cards of their own, not a row as well', async () => {
    skipLaunch()
    const { user } = await open('/tv')
    await user.click(page().getByRole('button', { name: 'Got it' }))
    await settle()
    expect(page().getAllByRole('region', { name: 'Featured on Harbor' })).toHaveLength(1)
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
    await open('/tv/movies')
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

  test('TV: the nav has a destination per kind of media, Shows and Music still to come', async () => {
    await open('/tv/shows')
    const nav = page().getByRole('navigation', { name: 'Main' })
    expect(
      within(nav)
        .getAllByRole('link')
        .map((a) => a.getAttribute('aria-label') ?? a.textContent),
    ).toEqual([
      'Search',
      'Home',
      'Collections',
      'Movies',
      'Shows',
      'Music',
      'Ines: profile and settings',
    ])
    // Settings is reached through the profile, the avatar, not as a destination
    expect(
      within(nav).getByRole('link', { name: 'Ines: profile and settings' }).getAttribute('href'),
    ).toBe('#/tv/profile')
    expect(page().getByRole('heading', { level: 1, name: 'Shows' })).toBeTruthy()
    expect(page().getByText(/Shows come to highsea in a later version/)).toBeTruthy()
    const go = page().getAllByRole('link', { name: 'Movies' }).at(-1)
    expect(go?.hasAttribute('data-initial')).toBe(true)
    expect(go?.getAttribute('href')).toBe('#/tv/movies')
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

describe('TV: the account’s profiles', () => {
  afterEach(() => act(() => resetPeople()))

  test("who's watching: every profile, Add a profile, and a PIN asked for first", async () => {
    const { location, user } = await open('/tv/who')
    expect(page().getByRole('heading', { level: 1, name: 'Who’s watching?' })).toBeTruthy()
    const people = within(page().getByRole('list', { name: 'Profiles' }))
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label'))
    expect(people).toEqual(['Ines', 'Theo, has a PIN', 'Ruth', 'Kids', 'Add a profile'])
    await clean()
    await user.click(page().getByRole('button', { name: 'Theo, has a PIN' }))
    await settle()
    expect(page().getByRole('heading', { name: 'Enter Theo’s PIN' })).toBeTruthy()
    await clean()
    for (const d of '1111') await user.click(page().getByRole('button', { name: d }))
    await settle()
    expect(page().getByRole('alert').textContent).toBe('That isn’t Theo’s PIN. Try again.')
    await wait(400)
    for (const d of '2580') await user.click(page().getByRole('button', { name: d }))
    await settle()
    // Home, as Theo (Home opens on the announcement to acknowledge, without the head)
    expect(location.history.at(-1)).toBe('/tv/')
  })

  test('the TV opens on who’s watching, or as the last profile when it doesn’t ask', async () => {
    const { location, user } = await open('/tv/start')
    const people = within(page().getByRole('list', { name: 'Profiles' }))
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label'))
    expect(people).toEqual(['Ines, last here', 'Theo, has a PIN', 'Ruth', 'Kids', 'Add a profile'])
    await clean()
    // a PIN is asked for at launch, and Back from it returns to the profiles
    await user.click(page().getByRole('button', { name: 'Theo, has a PIN' }))
    await settle()
    expect(page().getByRole('heading', { name: 'Enter Theo’s PIN' })).toBeTruthy()
    for (const d of '2580') await user.click(page().getByRole('button', { name: d }))
    await settle()
    expect(location.history.at(-1)).toBe('/tv/')
    // not asking, it opens as Theo, who has a PIN
    act(() => setAskOnLaunch(false))
    await open('/tv/start')
    expect(page().getByRole('heading', { name: 'Enter Theo’s PIN' })).toBeTruthy()
  })

  test('the profile: the profiles first, then a PIN set twice', async () => {
    const { user } = await open('/tv/profile')
    const row = within(page().getByRole('banner'))
    expect(row.getByRole('button', { name: 'Ines, watching now' })).toBeTruthy()
    await user.click(page().getByRole('button', { name: 'PIN' }))
    page().getByRole('button', { name: 'PIN' }).focus()
    await settle()
    await user.click(page().getByRole('button', { name: 'Set a PIN' }))
    await settle()
    for (const d of '1234') await user.click(page().getByRole('button', { name: d }))
    await settle()
    expect(page().getByRole('dialog', { name: 'Enter it again' })).toBeTruthy()
    for (const d of '1234') await user.click(page().getByRole('button', { name: d }))
    await settle()
    expect(page().getByText('On. Every device asks for it before watching as Ines.')).toBeTruthy()
    expect(row.getByRole('button', { name: 'Ines, has a PIN, watching now' })).toBeTruthy()
  })

  test('adding a profile watches as it, and deleting one asks first', async () => {
    const { location, user } = await open('/tv/who/new')
    const add = () => page().getByRole('button', { name: 'Add profile' }) as HTMLButtonElement
    expect(add().disabled).toBe(true)
    const key = (k: string) => user.click(page().getByRole('button', { name: k }))
    // Shift is on at the start; twice in a row is caps lock, and a third press turns it off
    await key('S')
    await key('a')
    await key('Shift')
    await key('Shift')
    expect(page().getByRole('button', { name: 'Caps lock' }).getAttribute('aria-pressed')).toBe(
      'true',
    )
    await key('M')
    await key('Caps lock')
    expect(page().getByRole('button', { name: 'Shift' }).getAttribute('aria-pressed')).toBe('false')
    await key('i')
    await key('Space')
    await key('J')
    expect(page().getByText('SaMi J', { selector: '[aria-live]' })).toBeTruthy()
    await user.click(page().getByRole('radio', { name: 'Red' }))
    await settle()
    expect(add().disabled).toBe(false)
    await user.click(add())
    await settle()
    expect(location.history.at(-1)).toBe('/tv/')
    await clean()
    await open('/tv/profile')
    expect(page().getByRole('button', { name: 'SaMi J, watching now' })).toBeTruthy()
    await user.click(page().getByRole('button', { name: 'Profiles' }))
    await settle()
    await user.click(page().getByRole('button', { name: 'Delete Ruth’s profile' }))
    await settle()
    expect(page().getByRole('dialog', { name: 'Delete Ruth’s profile?' })).toBeTruthy()
    await user.click(page().getByRole('button', { name: 'Delete profile' }))
    await settle()
    expect(page().queryByRole('button', { name: 'Ruth' })).toBeNull()
    expect(page().queryByRole('button', { name: 'Delete Ines’s profile' })).toBeNull()
  })
})

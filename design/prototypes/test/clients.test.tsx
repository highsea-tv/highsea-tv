// SPDX-License-Identifier: AGPL-3.0-only
// Checkpoint 3 flows, walked as a user would (connecting and signing in are apps/client's):
// acknowledge the owner's announcement and use the home; browse the library; open a title and
// play it, with the player's tracks and subtitle nudge; and the connectivity states. The TV's D-pad moves need real
// layout, so they're walked in a browser before each checkpoint; here the TV screens are checked
// for their content and their actions.
import './dom.ts'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createMock } from '@highsea-tv/mock/client'
import { act, cleanup, render, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { memoryLocation } from 'wouter/memory-location'
import { resetPeople, setAskOnLaunch } from '../src/client/profiles.ts'
import { type Connection, defaultState } from '../src/proto/state.ts'
import { ScreenApp } from '../src/screen/screen.tsx'
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

// Choose a server, signing in and the TV's code are apps/client's (apps/client/test).
describe('C1 connect', () => {
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

describe('C3 library', () => {
  test('TV: the nav has a destination per kind of media, Shows among them', async () => {
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
      expect.stringMatching(/^Alerts/),
      'Ines: profile and settings',
    ])
    // Settings is reached through the profile, the avatar, not as a destination: apps/client's
    expect(
      within(nav).getByRole('link', { name: 'Ines: profile and settings' }).getAttribute('href'),
    ).toBe('#/tv/settings')
    expect(page().getByRole('heading', { level: 1, name: 'Shows' })).toBeTruthy()
    // Shows is a library of its own since stage 2 of the prototypes' gaps
    const show = page()
      .getAllByRole('link')
      .find((a) => a.getAttribute('href')?.startsWith('#/tv/shows/'))
    expect(show).toBeTruthy()
    await clean()
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

  test('adding a profile watches as it', async () => {
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
  })
})

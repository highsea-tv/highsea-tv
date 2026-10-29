// SPDX-License-Identifier: AGPL-3.0-only
// Checkpoint 1 flows, walked as a user would: customize the dashboard by keyboard, sign in with
// two-factor, and run first-time setup to the end. Each step that changes the screen is checked
// with axe, and the classes it renders join the stylesheet check.
import './dom.ts'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { act, cleanup, render, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { memoryLocation } from 'wouter/memory-location'
import { createClient, createMock, type Mock } from '../src/mock/client.ts'
import { defaultState, type Role } from '../src/proto/state.ts'
import { ScreenApp } from '../src/screen/screen.tsx'
import { classes, collect, unknownClasses, violations } from './check.ts'

beforeEach(() => localStorage.clear())
afterEach(() => cleanup())

// testing-library's `screen` binds to `document` when it loads, before ./dom.ts registers one
const page = () => within(document.body)

const settle = () =>
  act(async () => {
    for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0))
  })

async function open(path: string, role: Role = 'owner', data: 'populated' | 'empty' = 'populated') {
  const mock = createMock()
  const location = memoryLocation({ path, record: true })
  const state = { ...defaultState, data, role, time: 'pause' as const }
  await act(async () => {
    render(<ScreenApp mock={mock} state={state} hook={location.hook} latency={0} />)
  })
  await settle()
  return { mock, location, user: userEvent.setup() }
}

const client = (mock: Mock, role: Role = 'owner') =>
  createClient(mock, { data: 'populated', role, latency: 0 })

const order = () =>
  [...document.querySelectorAll<HTMLElement>('[data-widget-id]')].map((el) => el.dataset.widgetId)

async function clean(modal?: Element) {
  collect()
  expect(await violations(modal)).toEqual([])
}

describe('A3 dashboard', () => {
  test('customize by keyboard: move, resize, remove, save', async () => {
    const { mock, user } = await open('/admin')
    // Now playing leads (the owner's word at 4.3a's review)
    expect(order()[0]).toBe('w-now-playing')
    expect(order().slice(1, 3)).toEqual(['w-network', 'w-storage'])
    await user.click(page().getByRole('button', { name: 'Customize' }))
    await clean()

    const handle = page().getByRole('button', { name: 'Move Network' })
    handle.focus()
    await user.keyboard(' ')
    expect(page().getByText(/Network picked up, position 2 of 8/)).toBeTruthy()
    await user.keyboard('{ArrowRight}')
    expect(order().slice(1, 3)).toEqual(['w-storage', 'w-network'])
    // focus stays on the handle after the move, so the next key keeps working
    expect(document.activeElement).toBe(page().getByRole('button', { name: 'Move Network' }))
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}')
    expect(page().getByText('Network is already as wide as it goes.')).toBeTruthy()
    await user.keyboard('{Shift>}{ArrowLeft}{/Shift}')
    expect(page().getByText('Network is now 1 column wide and 2 rows tall.')).toBeTruthy()
    await user.keyboard('{Shift>}{ArrowDown}{/Shift}')
    expect(page().getByText('Network is now 1 column wide and 3 rows tall.')).toBeTruthy()
    expect(document.activeElement).toBe(page().getByRole('button', { name: 'Move Network' }))
    await user.keyboard(' ')
    expect(page().getByText('Network dropped at position 3 of 8.')).toBeTruthy()

    await user.click(page().getByRole('button', { name: 'Remove Subtitles' }))
    expect(order()).not.toContain('w-subtitles')
    await user.click(page().getByRole('button', { name: 'Done' }))
    await settle()

    const saved = await client(mock).dashboard.layout()
    expect(saved.inherited).toBe(false)
    expect(saved.widgets.slice(1, 3)).toEqual([
      { id: 'w-storage', kind: 'storage', span: 1, rows: 2, settings: {} },
      { id: 'w-network', kind: 'network', span: 1, rows: 3, settings: { minutes: 10 } },
    ])
    expect(saved.widgets.map((w) => w.kind)).not.toContain('subtitles')
    expect(page().queryByRole('button', { name: 'Move Network' })).toBeNull()
  })

  test('Escape puts a picked-up widget back; Cancel drops the draft', async () => {
    const { mock, user } = await open('/admin')
    await user.click(page().getByRole('button', { name: 'Customize' }))
    page().getByRole('button', { name: 'Move Storage' }).focus()
    await user.keyboard(' {ArrowLeft}')
    expect(order()[1]).toBe('w-storage')
    await user.keyboard('{Escape}')
    expect(order().slice(1, 3)).toEqual(['w-network', 'w-storage'])

    await user.click(page().getByRole('button', { name: 'Remove Indexers' }))
    await user.click(page().getByRole('button', { name: 'Cancel' }))
    expect(order()).toContain('w-indexers')
    expect((await client(mock).dashboard.layout()).inherited).toBe(true)
  })

  test('add a widget from the sheet', async () => {
    const { user } = await open('/admin')
    await user.click(page().getByRole('button', { name: 'Customize' }))
    await user.click(page().getByRole('button', { name: 'Add widget' }))
    const sheet = page().getByRole('dialog', { name: 'Add a widget' })
    await clean(sheet)
    await user.click(within(sheet).getByRole('button', { name: /^Calendar/ }))
    expect(order().at(-1)).toBe('w-calendar')
  })

  test('the owner makes a layout the admins’ default', async () => {
    const { mock, user } = await open('/admin')
    const mine = order()
    await user.click(page().getByRole('button', { name: 'Customize' }))
    await user.click(page().getByRole('button', { name: 'More layout options' }))
    expect(page().queryByRole('menuitem', { name: /default for members/ })).toBeNull()
    await user.click(page().getByRole('menuitem', { name: 'Make this the default for admins' }))
    await settle()
    const admin = await client(mock, 'admin').dashboard.layout()
    expect(admin.widgets.map((w) => w.id)).toEqual(mine as string[])
  })

  test('admins customize with every widget on offer, but set no defaults', async () => {
    const { user } = await open('/admin', 'admin')
    await user.click(page().getByRole('button', { name: 'Customize' }))
    await user.click(page().getByRole('button', { name: 'More layout options' }))
    expect(page().queryByRole('menuitem', { name: /default for/ })).toBeNull()
  })

  test('a user is sent to the web client instead of the dashboard', async () => {
    const { location } = await open('/admin', 'user')
    expect(location.history.at(-1)).toBe('/web')
    expect(page().queryByRole('button', { name: 'Customize' })).toBeNull()
  })
})

describe('A18 login', () => {
  test('wrong password, rate limit, then two-factor to the dashboard', async () => {
    const { location, user } = await open('/admin/login')
    await clean()
    const password = page().getByLabelText('Password')
    await user.type(password, 'wrong')
    await user.click(page().getByRole('button', { name: 'Sign in' }))
    await settle()
    expect(page().getByText('That username and password don’t match.')).toBeTruthy()
    expect(password.getAttribute('aria-invalid')).toBe('true')
    await clean()

    await user.clear(password)
    await user.type(password, 'locked')
    await user.click(page().getByRole('button', { name: 'Sign in' }))
    await settle()
    expect(page().getByRole('alert').textContent).toContain('Too many attempts')

    await user.clear(password)
    await user.type(password, 'correct horse')
    await user.click(page().getByRole('button', { name: 'Sign in' }))
    await settle()
    expect(page().getByRole('heading', { name: 'Enter your code' })).toBeTruthy()
    await clean()

    await user.type(page().getByLabelText('Code'), '000000')
    await settle()
    expect(page().getByText(/That code didn’t work/)).toBeTruthy()
    await user.type(page().getByLabelText('Code'), '482913')
    await settle()
    expect(location.history.at(-1)).toBe('/admin/')
  })
})

describe('A2 setup', () => {
  const proceed = (user: ReturnType<typeof userEvent.setup>) =>
    user.click(page().getByRole('button', { name: 'Continue' }))
  const heading = (name: string) => page().getByRole('heading', { level: 1, name })

  // user.clear leaves React's value tracker behind on a value React rendered: select and delete
  async function wipe(user: ReturnType<typeof userEvent.setup>, label: string) {
    await user.tripleClick(page().getByLabelText(label))
    await user.keyboard('{Backspace}')
  }

  async function owner(user: ReturnType<typeof userEvent.setup>) {
    await user.type(page().getByLabelText('Your name'), 'Ines')
    await user.type(page().getByLabelText('Username'), 'ines')
    await user.type(page().getByLabelText('Password'), 'long enough pass')
    await user.type(page().getByLabelText('Confirm password'), 'long enough')
    await proceed(user)
    expect(page().getByText('The passwords don’t match.')).toBeTruthy()
    await user.type(page().getByLabelText('Confirm password'), ' pass')
  }

  test('with everything found: the owner, then Review, finishing on the dashboard', async () => {
    const { mock, location, user } = await open('/admin/setup')
    expect(page().getByText('Step 1 of 2')).toBeTruthy()
    expect(heading('Create the owner account')).toBeTruthy()
    // the host's name, filled in
    expect((page().getByLabelText('Server name') as HTMLInputElement).value).toBe('Harbor')
    await wipe(user, 'Server name')
    await owner(user)
    expect(page().getByText('Give the server a name.')).toBeTruthy()
    await user.type(page().getByLabelText('Server name'), 'Lighthouse')
    await clean()
    await proceed(user)

    expect(heading('Check and finish')).toBeTruthy()
    await settle()
    expect(page().getByText('Lighthouse')).toBeTruthy()
    expect(page().getByText('From TMDB, with highsea’s key')).toBeTruthy()
    expect(page().getByText('192.168.1.20:3000')).toBeTruthy()
    expect(page().getByText('Intel UHD Graphics 770, through VAAPI')).toBeTruthy()
    expect(page().getByText('Same disk, so imports are hardlinked.')).toBeTruthy()
    expect(page().getByText('From this browser’s languages.')).toBeTruthy()
    await clean()

    // a line highsea decided opens its editor in place, and loses its note once changed
    await user.click(page().getByRole('button', { name: 'Change subtitles' }))
    await settle()
    await user.click(page().getByRole('button', { name: 'Spanish' }))
    await clean()
    await user.click(page().getByRole('button', { name: 'Done with subtitles' }))
    expect(page().getByText('English, then Spanish')).toBeTruthy()
    expect(page().queryByText('From this browser’s languages.')).toBeNull()

    // remote access is opened only by choosing it
    await user.click(page().getByRole('button', { name: 'Change away from home' }))
    await user.click(page().getByRole('radio', { name: /reverse proxy/ }))
    await user.type(page().getByLabelText('Public address'), 'movies.example.com')
    await user.click(page().getByRole('button', { name: 'Done with away from home' }))
    expect(page().getByText(/starting with https/)).toBeTruthy()
    await user.clear(page().getByLabelText('Public address'))
    await user.type(page().getByLabelText('Public address'), 'https://movies.example.com')
    await clean()
    await user.click(page().getByRole('button', { name: 'Done with away from home' }))
    expect(page().getByText('Reverse proxy at https://movies.example.com')).toBeTruthy()

    // an editor left wrong opens again on Finish
    await user.click(page().getByRole('button', { name: 'Change address on your network' }))
    await wipe(user, 'Address on your network')
    await user.click(page().getByRole('button', { name: 'Finish setup' }))
    expect(page().getByText(/Enter the address apps use/)).toBeTruthy()
    await user.type(page().getByLabelText('Address on your network'), '192.168.1.20:3000')

    // a line that was asked goes back to its step
    await user.click(page().getByRole('button', { name: 'Change server name' }))
    expect(heading('Create the owner account')).toBeTruthy()
    await user.type(page().getByLabelText('Password'), 'long enough pass')
    await user.type(page().getByLabelText('Confirm password'), 'long enough pass')
    await proceed(user)

    await user.click(page().getByRole('button', { name: 'Finish setup' }))
    await settle()
    expect(location.history.at(-1)).toBe('/admin/')
    expect((await client(mock).system.server()).name).toBe('Lighthouse')
  })

  test('with no folders found: Folders becomes a step', async () => {
    const { user } = await open('/admin/setup', 'owner', 'empty')
    expect(page().getByText('Step 1 of 3')).toBeTruthy()
    expect((page().getByLabelText('Server name') as HTMLInputElement).value).toBe('')
    await user.type(page().getByLabelText('Server name'), 'Lighthouse')
    await owner(user)
    await proceed(user)

    expect(heading('Choose your folders')).toBeTruthy()
    await proceed(user)
    expect(page().getByText('Pick a folder for movies.')).toBeTruthy()
    await user.click(page().getAllByRole('button', { name: 'Browse' })[0] as HTMLElement)
    await settle()
    const picker = page().getByRole('dialog', { name: 'Choose the movies folder' })
    await clean(picker)
    await user.click(within(picker).getByRole('button', { name: '/' }))
    await settle()
    for (const name of ['mnt', 'nas', 'movies']) {
      await user.click(within(picker).getByRole('button', { name }))
      await settle()
    }
    await user.click(within(picker).getByRole('button', { name: 'Use this folder' }))
    await user.type(page().getByLabelText('Downloads folder'), '/data/downloads')
    await settle()
    expect(page().getByText('Imports will be copied')).toBeTruthy()
    await clean()
    await proceed(user)

    expect(heading('Check and finish')).toBeTruthy()
    await settle()
    expect(page().getByText('From TMDB, with highsea’s key')).toBeTruthy()
    expect(page().getByText('This computer’s processor')).toBeTruthy()
    expect(page().getByText(/The address you opened setup at/)).toBeTruthy()
    await clean()
  })

  test('progress survives a reload; Start over clears it', async () => {
    const first = await open('/admin/setup')
    await wipe(first.user, 'Server name')
    await first.user.type(page().getByLabelText('Server name'), 'Lighthouse')
    await owner(first.user)
    await proceed(first.user)
    expect(heading('Check and finish')).toBeTruthy()
    cleanup()

    const again = await open('/admin/setup')
    expect(heading('Check and finish')).toBeTruthy()
    expect(page().getByText('Lighthouse')).toBeTruthy()
    await again.user.click(page().getByRole('button', { name: 'Start over' }))
    await settle()
    expect(heading('Create the owner account')).toBeTruthy()
    expect((page().getByLabelText('Server name') as HTMLInputElement).value).toBe('Harbor')
  })
})

describe('stylesheet', () => {
  test('every class the flows render is a real utility', async () => {
    expect(classes.size).toBeGreaterThan(50)
    expect(await unknownClasses()).toEqual([])
  })
})

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

async function open(path: string, role: Role = 'owner') {
  const mock = createMock()
  const location = memoryLocation({ path, record: true })
  const state = { ...defaultState, data: 'populated' as const, role, time: 'pause' as const }
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
    expect(order().slice(0, 2)).toEqual(['w-network', 'w-storage'])
    await user.click(page().getByRole('button', { name: 'Customize' }))
    await clean()

    const handle = page().getByRole('button', { name: 'Move Network' })
    handle.focus()
    await user.keyboard(' ')
    expect(page().getByText(/Network picked up, position 1 of 7/)).toBeTruthy()
    await user.keyboard('{ArrowRight}')
    expect(order().slice(0, 2)).toEqual(['w-storage', 'w-network'])
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
    expect(page().getByText('Network dropped at position 2 of 7.')).toBeTruthy()

    await user.click(page().getByRole('button', { name: 'Remove Subtitles' }))
    expect(order()).not.toContain('w-subtitles')
    await user.click(page().getByRole('button', { name: 'Done' }))
    await settle()

    const saved = await client(mock).dashboard.layout()
    expect(saved.inherited).toBe(false)
    expect(saved.widgets.slice(0, 2)).toEqual([
      { id: 'w-storage', kind: 'storage', span: 1, rows: 2 },
      { id: 'w-network', kind: 'network', span: 1, rows: 3 },
    ])
    expect(saved.widgets.map((w) => w.kind)).not.toContain('subtitles')
    expect(page().queryByRole('button', { name: 'Move Network' })).toBeNull()
  })

  test('Escape puts a picked-up widget back; Cancel drops the draft', async () => {
    const { mock, user } = await open('/admin')
    await user.click(page().getByRole('button', { name: 'Customize' }))
    page().getByRole('button', { name: 'Move Storage' }).focus()
    await user.keyboard(' {ArrowLeft}')
    expect(order()[0]).toBe('w-storage')
    await user.keyboard('{Escape}')
    expect(order().slice(0, 2)).toEqual(['w-network', 'w-storage'])

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

  test('owners make a layout the members’ default; staff-only widgets drop out', async () => {
    const { mock, user } = await open('/admin')
    await user.click(page().getByRole('button', { name: 'Customize' }))
    await user.click(page().getByRole('button', { name: 'More layout options' }))
    await user.click(page().getByRole('menuitem', { name: 'Make this the default for members' }))
    await settle()
    const member = await client(mock, 'member').dashboard.layout()
    expect(member.widgets.map((w) => w.kind)).toEqual(['upcoming', 'announcement', 'activity'])
  })

  test('members customize without staff widgets on offer', async () => {
    const { user } = await open('/admin', 'member')
    expect(order()).toEqual(['w-recently-added', 'w-upcoming', 'w-activity'])
    await user.click(page().getByRole('button', { name: 'Customize' }))
    await user.click(page().getByRole('button', { name: 'Add widget' }))
    const sheet = page().getByRole('dialog', { name: 'Add a widget' })
    expect(within(sheet).queryByRole('button', { name: /^Network/ })).toBeNull()
    expect(within(sheet).getByRole('button', { name: /^Calendar/ })).toBeTruthy()
    await user.keyboard('{Escape}')
    await user.click(page().getByRole('button', { name: 'More layout options' }))
    expect(page().queryByRole('menuitem', { name: /default for members/ })).toBeNull()
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
  test('walks every step and finishes on the dashboard', async () => {
    const { mock, location, user } = await open('/admin/setup')
    const proceed = () => user.click(page().getByRole('button', { name: 'Continue' }))
    const heading = (name: string) => page().getByRole('heading', { level: 1, name })

    await proceed()
    expect(page().getByText('Give the server a name.')).toBeTruthy()
    await user.type(page().getByLabelText('Server name'), 'Lighthouse')
    await proceed()

    expect(heading('Create the owner account')).toBeTruthy()
    await user.type(page().getByLabelText('Your name'), 'Ines')
    await user.type(page().getByLabelText('Username'), 'ines')
    await user.type(page().getByLabelText('Password'), 'long enough pass')
    await user.type(page().getByLabelText('Confirm password'), 'long enough')
    await proceed()
    expect(page().getByText('The passwords don’t match.')).toBeTruthy()
    await user.type(page().getByLabelText('Confirm password'), ' pass')
    await proceed()

    expect(heading('Choose your folders')).toBeTruthy()
    await settle()
    expect(page().getByText('Hardlinks will work')).toBeTruthy()
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
    await settle()
    expect((page().getByLabelText('Movies folder') as HTMLInputElement).value).toBe(
      '/mnt/nas/movies',
    )
    expect(page().getByText('Imports will be copied')).toBeTruthy()
    await clean()
    await proceed()

    expect(heading('Add indexers')).toBeTruthy()
    await settle()
    const checked = page()
      .getAllByRole('checkbox')
      .filter((c) => c.dataset.state === 'checked')
    expect(checked.length).toBeGreaterThan(0)
    await clean()
    await proceed()

    expect(heading('Subtitle languages')).toBeTruthy()
    await settle()
    await user.click(page().getByRole('button', { name: 'Spanish' }))
    expect(page().getByText('English, then Spanish, in that order.')).toBeTruthy()
    await clean()
    await proceed()

    expect(heading('Watching away from home')).toBeTruthy()
    await user.click(page().getByRole('radio', { name: /reverse proxy/ }))
    await user.type(page().getByLabelText('Public address'), 'movies.example.com')
    await proceed()
    expect(page().getByText(/starting with https/)).toBeTruthy()
    await user.clear(page().getByLabelText('Public address'))
    await user.type(page().getByLabelText('Public address'), 'https://movies.example.com')
    await clean()
    await proceed()

    expect(heading('Link to highsea cloud')).toBeTruthy()
    expect(page().getByRole('switch').getAttribute('aria-checked')).toBe('false')
    await proceed()

    expect(heading('Check and finish')).toBeTruthy()
    expect(page().getByText('Lighthouse')).toBeTruthy()
    expect(page().getByText('Reverse proxy at https://movies.example.com')).toBeTruthy()
    await clean()
    await user.click(page().getByRole('button', { name: 'Finish setup' }))
    await settle()
    expect(location.history.at(-1)).toBe('/admin/')
    expect((await client(mock).system.server()).name).toBe('Lighthouse')
  })

  test('progress survives a reload; Start over clears it', async () => {
    const first = await open('/admin/setup')
    await first.user.type(page().getByLabelText('Server name'), 'Lighthouse')
    await first.user.click(page().getByRole('button', { name: 'Continue' }))
    cleanup()

    const again = await open('/admin/setup')
    expect(page().getByRole('heading', { level: 1, name: 'Create the owner account' })).toBeTruthy()
    await again.user.click(page().getByRole('button', { name: 'Start over' }))
    expect((page().getByLabelText('Server name') as HTMLInputElement).value).toBe('')
  })
})

describe('stylesheet', () => {
  test('every class the flows render is a real utility', async () => {
    expect(classes.size).toBeGreaterThan(50)
    expect(await unknownClasses()).toEqual([])
  })
})

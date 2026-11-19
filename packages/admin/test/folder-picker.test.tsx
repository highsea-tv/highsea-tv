// SPDX-License-Identifier: AGPL-3.0-only
// The folder picker (HT-91) against a fake of `GET /api/v1/fs/folders`: it opens at the field's
// folder, or where browsing starts when that's gone; picks and cancels; says when a folder can't
// be read or highsea can only read it; and filters a folder with hundreds inside.
import './dom.ts'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

const { act, cleanup, render, within } = await import('@testing-library/react')
const { default: userEvent } = await import('@testing-library/user-event')
const { createClient } = await import('@highsea-tv/sdk')
const { ClientProvider } = await import('@highsea-tv/sdk/react')
const { ThemeProvider } = await import('@highsea-tv/ui/native')
const { Browse, FolderPicker, SHOWN } = await import('../src/folder-picker.tsx')
const { shown } = await import('./modal.ts')

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** The data folder: media with movies (hundreds of films), music, a locked folder and a shelf. */
const FILMS = Array.from({ length: 300 }, (_, i) => `Film ${String(i + 1).padStart(3, '0')}`)
const tree: Record<string, string[]> = {
  '/data': ['locked', 'media', 'shelf'],
  '/data/media': ['movies', 'music'],
  '/data/media/movies': FILMS,
  '/data/media/music': [],
  '/data/shelf': [],
}
for (const f of FILMS) tree[`/data/media/movies/${f}`] = []
let asked: string[] = []

async function api(url: string): Promise<Response> {
  const u = new URL(url, 'http://localhost')
  if (u.pathname === '/api/v1/events')
    return new Response(new ReadableStream(), { headers: { 'content-type': 'text/event-stream' } })
  if (u.pathname !== '/api/v1/fs/folders')
    return json({ error: { code: 'not-found', message: u.pathname } }, 404)
  const at = u.searchParams.get('path') || '/data'
  asked.push(at)
  if (at === '/data/locked')
    return json(
      { error: { code: 'forbidden', message: 'no', details: { reason: 'unreadable' } } },
      403,
    )
  if (at === '/etc')
    return json(
      { error: { code: 'forbidden', message: 'no', details: { reason: 'outside' } } },
      403,
    )
  const names = tree[at]
  if (!names)
    return json(
      { error: { code: 'not-found', message: 'gone', details: { reason: 'missing' } } },
      404,
    )
  return json({
    path: at,
    root: '/data',
    parent: at === '/data' ? null : at.slice(0, at.lastIndexOf('/')),
    folders: names.map((name) => ({ name, path: `${at}/${name}` })),
    more: 0,
    writable: at !== '/data/shelf',
  })
}

beforeEach(() => {
  asked = []
})
afterEach(() => cleanup())

const settle = () =>
  act(async () => {
    for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0))
  })

async function open(start: string, opts: { needsWrite?: boolean } = {}) {
  const picked: string[] = []
  let closed = 0
  const client = createClient({ fetch: api as never })
  await act(async () => {
    render(
      <ClientProvider client={client}>
        <ThemeProvider>
          <FolderPicker
            open
            title="Choose a folder"
            start={start}
            needsWrite={opts.needsWrite}
            onPick={(p) => picked.push(p)}
            onClose={() => closed++}
          />
        </ThemeProvider>
      </ClientProvider>,
    )
  })
  await settle()
  shown()
  const picker = within(document.body).getByRole('dialog', { name: 'Choose a folder' })
  return { user: userEvent.setup(), picker: within(picker), picked, closed: () => closed }
}

describe('the folder picker', () => {
  test('opens at the field’s folder, goes in and up, and picks', async () => {
    const { user, picker, picked } = await open('/data/media')
    expect(asked).toEqual(['/data/media'])
    const crumbs = picker.getByRole('navigation', { name: 'Folder path' })
    expect(crumbs.textContent).toBe('/data/media')
    await user.click(picker.getByRole('button', { name: 'music' }))
    await settle()
    expect(picker.getByText('No folders inside. Use this one, or go up a level.')).toBeTruthy()
    await user.click(picker.getByRole('button', { name: 'Up one level' }))
    await settle()
    await user.click(picker.getByRole('button', { name: 'Use this folder' }))
    expect(picked).toEqual(['/data/media'])
  })

  test('Cancel picks nothing', async () => {
    const { user, picker, picked, closed } = await open('/data/media')
    await user.click(picker.getByRole('button', { name: 'Cancel' }))
    expect(picked).toEqual([])
    expect(closed()).toBe(1)
  })

  test('an empty field opens where browsing starts', async () => {
    const { picker } = await open('')
    expect(asked).toEqual(['/data'])
    expect(picker.getByRole('button', { name: 'media' })).toBeTruthy()
    // the data folder is the top: no Up
    expect(picker.queryByRole('button', { name: 'Up one level' })).toBeNull()
  })

  test('a folder that’s gone opens where browsing starts, and says so', async () => {
    const { picker } = await open('/data/media/old')
    expect(asked).toEqual(['/data/media/old', '/data'])
    expect(
      picker.getByText('/data/media/old isn’t there, so the picker opened where browsing starts.'),
    ).toBeTruthy()
    expect(picker.getByRole('button', { name: 'media' })).toBeTruthy()
  })

  test('a folder highsea can’t read says so, with Up, and can’t be used', async () => {
    const { user, picker, picked } = await open('/data')
    await user.click(picker.getByRole('button', { name: 'locked' }))
    await settle()
    expect(picker.getByText('highsea can’t read this folder')).toBeTruthy()
    // nothing to use: the button is off
    const use = picker.getByRole('button', { name: 'Use this folder' })
    expect(use.getAttribute('aria-disabled') === 'true' || use.hasAttribute('disabled')).toBe(true)
    expect(picked).toEqual([])
    await user.click(picker.getByRole('button', { name: 'Up one level' }))
    await settle()
    expect(picker.getByRole('button', { name: 'locked' })).toBeTruthy()
  })

  test('a folder highsea can only read is flagged where the field saves into it', async () => {
    const { user, picker } = await open('/data', { needsWrite: true })
    expect(picker.queryByText('highsea can only read this folder')).toBeNull()
    await user.click(picker.getByRole('button', { name: 'shelf' }))
    await settle()
    expect(picker.getByText('highsea can only read this folder')).toBeTruthy()
  })

  test('hundreds of folders: the first few hundred drawn, and a filter for the rest', async () => {
    const { user, picker } = await open('/data/media/movies')
    expect(
      picker.getByRole('button', { name: `Film ${String(SHOWN).padStart(3, '0')}` }),
    ).toBeTruthy()
    expect(picker.queryByRole('button', { name: 'Film 300' })).toBeNull()
    expect(picker.getByText(`Showing ${SHOWN} of 300. Filter to find the rest.`)).toBeTruthy()
    await user.type(picker.getByLabelText('Filter folders'), 'film 30')
    await settle()
    expect(picker.getByRole('button', { name: 'Film 300' })).toBeTruthy()
    expect(picker.queryByRole('button', { name: 'Film 001' })).toBeNull()
    await user.clear(picker.getByLabelText('Filter folders'))
    await user.type(picker.getByLabelText('Filter folders'), 'nothing like it')
    await settle()
    expect(picker.getByText('No folder here matches.')).toBeTruthy()
  })
})

describe('Browse', () => {
  test('opens the picker at the field’s folder and fills it', async () => {
    let value = '/data/media/movies'
    const client = createClient({ fetch: api as never })
    await act(async () => {
      render(
        <ClientProvider client={client}>
          <ThemeProvider>
            <Browse value={value} title="Choose a folder" onPick={(p) => (value = p)} />
          </ThemeProvider>
        </ClientProvider>,
      )
    })
    // closed, it asks nothing
    expect(asked).toEqual([])
    const user = userEvent.setup()
    await user.click(within(document.body).getByRole('button', { name: 'Browse' }))
    await settle()
    shown()
    expect(asked).toEqual(['/data/media/movies'])
    const picker = within(within(document.body).getByRole('dialog', { name: 'Choose a folder' }))
    await user.click(picker.getByRole('button', { name: 'Up one level' }))
    await settle()
    await user.click(picker.getByRole('button', { name: 'Use this folder' }))
    expect(value).toBe('/data/media')
  })
})

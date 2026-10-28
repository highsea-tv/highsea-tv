// SPDX-License-Identifier: AGPL-3.0-only
// The hooks against a fake of the API: the library read a page at a time, search settling before
// it asks, and the home layout's order kept while it saves.
import './dom.ts'
import { afterEach, describe, expect, test } from 'bun:test'
import type { ReactNode } from 'react'

const { act, cleanup, renderHook } = await import('@testing-library/react')
const { createClient } = await import('@highsea-tv/sdk')
const { ClientProvider } = await import('@highsea-tv/sdk/react')
const { readLibrary, useHomeLayout, useSearch, SEARCH_SETTLE_MS } = await import(
  '../src/data/index.ts'
)

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

type Call = { method: string; path: string; query: URLSearchParams; body: unknown }

function fake(answer: (call: Call) => Response | undefined) {
  const calls: Call[] = []
  const fetch = async (url: string, init: RequestInit = {}) => {
    const u = new URL(url, 'http://localhost')
    if (u.pathname === '/api/v1/events') return new Response(new ReadableStream())
    const call = {
      method: init.method ?? 'GET',
      path: u.pathname,
      query: u.searchParams,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    }
    calls.push(call)
    return answer(call) ?? json({ error: { code: 'not-found', message: 'Not here.' } }, 404)
  }
  const client = createClient({ fetch: fetch as never })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ClientProvider client={client}>{children}</ClientProvider>
  )
  return { client, calls, wrapper }
}

const settle = () =>
  act(async () => {
    for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0))
  })

afterEach(() => cleanup())

describe('readLibrary', () => {
  test('follows the cursor to the last page, asking for playable titles only', async () => {
    const item = (id: number) => ({ id, title: `Film ${id}` })
    const { client, calls } = fake(({ query }) =>
      query.get('cursor') === 'p2'
        ? json({ items: [item(3)], next: null })
        : json({ items: [item(1), item(2)], next: 'p2' }),
    )
    const items = await readLibrary(client)
    expect(items.map((i) => i.id)).toEqual([1, 2, 3])
    expect(calls.map((c) => c.query.get('playable'))).toEqual(['true', 'true'])
  })
})

describe('useSearch', () => {
  test('asks once the typing settles, and not for an empty query', async () => {
    const { calls, wrapper } = fake(({ path }) =>
      path === '/api/v1/search' ? json({ sections: [] }) : undefined,
    )
    const { result, rerender } = renderHook(({ q }) => useSearch(q), {
      wrapper,
      initialProps: { q: '' },
    })
    await settle()
    expect(calls).toEqual([])
    rerender({ q: 'sin' })
    rerender({ q: 'sintel' })
    expect(result.current.typing).toBe(true)
    await act(() => new Promise((r) => setTimeout(r, SEARCH_SETTLE_MS + 20)))
    await settle()
    expect(result.current.typing).toBe(false)
    expect(calls.map((c) => c.query.get('query'))).toEqual(['sintel'])
  })
})

describe('useHomeLayout', () => {
  test('a reorder shows at once and saves the whole order; hiding keeps it', async () => {
    let saved = { order: ['continue', 'recent', 'picks'], hidden: [] as string[] }
    const { calls, wrapper } = fake(({ method, path, body }) => {
      if (path !== '/api/v1/me/home') return
      if (method === 'PUT') saved = body as typeof saved
      const rows = saved.order.map((id) => ({ id, title: id === 'picks' ? 'Picks' : null }))
      return json({ ...saved, rows })
    })
    const { result } = renderHook(() => useHomeLayout(), { wrapper })
    await settle()
    expect(result.current.rows.map((r) => r.id)).toEqual(['continue', 'recent', 'picks'])

    let done: Promise<unknown> = Promise.resolve()
    act(() => {
      done = result.current.reorder(['picks', 'continue', 'recent'])
    })
    expect(result.current.rows.map((r) => r.id)).toEqual(['picks', 'continue', 'recent'])
    await act(() => done)
    await settle()
    expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({
      order: ['picks', 'continue', 'recent'],
      hidden: [],
    })

    await act(() => result.current.toggle('recent', false) as Promise<unknown>)
    await settle()
    expect(saved).toEqual({ order: ['picks', 'continue', 'recent'], hidden: ['recent'] })
  })
})

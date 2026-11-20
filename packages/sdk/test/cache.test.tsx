// SPDX-License-Identifier: AGPL-3.0-only
// The shared query cache (HT-116): a screen opened again draws at once and asks again quietly, an
// event makes what it names stale, a person's own change shows at once, and a new client (another
// sign-in) starts with nothing.
import { GlobalRegistrator } from '@happy-dom/global-registrator'

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register({ url: 'http://localhost/' })
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { describe, expect, test } = await import('bun:test')
const { act, render } = await import('@testing-library/react')
const { createClient } = await import('../src/index.ts')
const { cacheFor, QueryCache } = await import('../src/cache.ts')
const { ClientProvider, useQuery, useQueryCache } = await import('../src/react.tsx')

/** A server whose public info names `name`, counting requests, with an event stream to push on. */
function server() {
  const s = {
    name: 'Harbor',
    calls: 0,
    delay: 0,
    push: null as ((topic: string) => void) | null,
  }
  let id = 0
  const client = createClient({
    fetch: async (url) => {
      if (String(url).endsWith('/events'))
        return new Response(
          new ReadableStream({
            start(c) {
              s.push = (topic) =>
                c.enqueue(
                  new TextEncoder().encode(
                    `data: ${JSON.stringify({ id: ++id, topic, at: 0 })}\n\n`,
                  ),
                )
            },
          }),
        )
      s.calls++
      const name = s.name
      if (s.delay) await Bun.sleep(s.delay)
      return new Response(
        JSON.stringify({ id: 'srv_1', name, version: '0', localAddresses: [], publicUrl: null }),
      )
    },
  })
  return { s, client }
}

describe('the shared cache', () => {
  test('a screen opened again draws at once from the cache, then asks again quietly', async () => {
    const { s, client } = server()
    const seen: string[] = []
    function Name() {
      const q = useQuery('info', (c) => c.system.publicInfo(), ['server.updated'])
      seen.push(q.status === 'success' ? q.data.name : q.status)
      return <p>{q.status === 'success' ? q.data.name : '…'}</p>
    }
    // fresh for no time, so the second visit asks again
    cacheFor(client, { staleMs: 0 })
    const first = render(
      <ClientProvider client={client} cache>
        <Name />
      </ClientProvider>,
    )
    await act(() => Bun.sleep(10))
    expect(first.container.textContent).toBe('Harbor')
    first.unmount()
    s.name = 'Harbor at home'
    seen.length = 0
    const again = render(
      <ClientProvider client={client} cache>
        <Name />
      </ClientProvider>,
    )
    // the first draw is the answer already had, never loading
    expect(seen[0]).toBe('Harbor')
    await act(() => Bun.sleep(10))
    expect(again.container.textContent).toBe('Harbor at home')
    expect(seen).not.toContain('loading')
    expect(s.calls).toBe(2)
    again.unmount()
  })

  test('a fresh answer is not asked for again, and two screens at once send one request', async () => {
    const { s, client } = server()
    s.delay = 5
    function Name() {
      const q = useQuery('info', (c) => c.system.publicInfo(), ['server.updated'])
      return <p>{q.status === 'success' ? q.data.name : '…'}</p>
    }
    const view = render(
      <ClientProvider client={client} cache>
        <Name />
        <Name />
      </ClientProvider>,
    )
    await act(() => Bun.sleep(20))
    expect(view.container.textContent).toBe('HarborHarbor')
    expect(s.calls).toBe(1)
    // another screen opening on the same answer while it's fresh (one is still on view, listening)
    view.rerender(
      <ClientProvider client={client} cache>
        <Name />
        <Name />
        <Name />
      </ClientProvider>,
    )
    await act(() => Bun.sleep(10))
    expect(view.container.textContent).toBe('HarborHarborHarbor')
    expect(s.calls).toBe(1)
    view.unmount()
  })

  test("an event makes what it names stale: shown, it's fetched again; hidden, when next shown", async () => {
    const { s, client } = server()
    const cache = cacheFor(client)
    function Name({ k }: { k: string }) {
      const q = useQuery(k, (c) => c.system.publicInfo(), ['server.updated'])
      return <p>{q.status === 'success' ? q.data.name : '…'}</p>
    }
    // 'other' is read, then hidden
    const other = render(
      <ClientProvider client={client} cache>
        <Name k="other" />
      </ClientProvider>,
    )
    await act(() => Bun.sleep(10))
    other.unmount()
    const view = render(
      <ClientProvider client={client} cache>
        <Name k="info" />
      </ClientProvider>,
    )
    await act(() => Bun.sleep(10))
    const before = s.calls
    s.name = 'Harbor at home'
    await act(async () => {
      s.push?.('movies.updated')
      await Bun.sleep(10)
    })
    expect(s.calls).toBe(before)
    await act(async () => {
      s.push?.('server.updated')
      await Bun.sleep(10)
    })
    expect(view.container.textContent).toBe('Harbor at home')
    // the shown one only; the hidden one waits, stale
    expect(s.calls).toBe(before + 1)
    expect(cache.data<{ name: string }>('other')?.name).toBe('Harbor')
    view.unmount()
    const back = render(
      <ClientProvider client={client} cache>
        <Name k="other" />
      </ClientProvider>,
    )
    await act(() => Bun.sleep(10))
    expect(back.container.textContent).toBe('Harbor at home')
    back.unmount()
  })

  test("a person's own change shows at once, before the server's answer", async () => {
    const { client } = server()
    let cache: InstanceType<typeof QueryCache> | null = null
    function Name() {
      cache = useQueryCache()
      const q = useQuery('info', (c) => c.system.publicInfo())
      return <p>{q.status === 'success' ? q.data.name : '…'}</p>
    }
    const view = render(
      <ClientProvider client={client} cache>
        <Name />
      </ClientProvider>,
    )
    await act(() => Bun.sleep(10))
    act(() => cache?.update<{ name: string }>('info', (d) => ({ ...d, name: 'Renamed' })))
    expect(view.container.textContent).toBe('Renamed')
    view.unmount()
  })

  test('clearing forgets all but what it keeps; shown screens load again, never the old answer', async () => {
    const { s, client } = server()
    const cache = cacheFor(client)
    const seen: string[] = []
    function Name() {
      const q = useQuery('mine', (c) => c.system.publicInfo())
      seen.push(q.status === 'success' ? q.data.name : q.status)
      return <p>{q.status === 'success' ? q.data.name : '…'}</p>
    }
    const view = render(
      <ClientProvider client={client} cache>
        <Name />
      </ClientProvider>,
    )
    await act(() => Bun.sleep(10))
    await cache.fetch('kept', (c) => c.system.publicInfo(), { silent: true })
    await cache.fetch('gone', (c) => c.system.publicInfo(), { silent: true })
    s.name = 'Another profile'
    seen.length = 0
    await act(async () => {
      cache.clear((k) => k === 'kept')
      await Bun.sleep(10)
    })
    expect(seen[0]).toBe('loading')
    expect(seen).not.toContain('Harbor')
    expect(view.container.textContent).toBe('Another profile')
    expect(cache.data('gone')).toBeUndefined()
    expect(cache.data<{ name: string }>('kept')?.name).toBe('Harbor')
    view.unmount()
  })

  test('an answer no event keeps fresh is drawn at once and always asked again', async () => {
    const { s, client } = server()
    const seen: string[] = []
    function Name() {
      const q = useQuery('untracked', (c) => c.system.publicInfo())
      seen.push(q.status === 'success' ? q.data.name : q.status)
      return <p>{q.status === 'success' ? q.data.name : '…'}</p>
    }
    const first = render(
      <ClientProvider client={client} cache>
        <Name />
      </ClientProvider>,
    )
    await act(() => Bun.sleep(10))
    first.unmount()
    s.name = 'Harbor at home'
    seen.length = 0
    const again = render(
      <ClientProvider client={client} cache>
        <Name />
      </ClientProvider>,
    )
    expect(seen[0]).toBe('Harbor')
    await act(() => Bun.sleep(10))
    expect(again.container.textContent).toBe('Harbor at home')
    expect(s.calls).toBe(2)
    again.unmount()
  })

  test('forgetting an answer: hidden, it is gone; shown, it loads again', async () => {
    const { client } = server()
    const cache = cacheFor(client)
    await cache.fetch('used', (c) => c.system.publicInfo(), { silent: true })
    cache.forget('used')
    expect(cache.data('used')).toBeUndefined()
    expect(cache.read('used').status).toBe('loading')
  })

  test('a new client (another sign-in) starts with an empty cache', async () => {
    const a = server()
    const b = server()
    await cacheFor(a.client).fetch('info', (c) => c.system.publicInfo(), { silent: true })
    expect(cacheFor(a.client).data('info')).toBeDefined()
    expect(cacheFor(b.client)).not.toBe(cacheFor(a.client))
    expect(cacheFor(b.client).data('info')).toBeUndefined()
  })

  test('prefetches run two at a time, the newest first, and drop the oldest past four', async () => {
    const { client } = server()
    const cache = new QueryCache(client)
    const started: string[] = []
    const waits: (() => void)[] = []
    const slow = (k: string) => () => {
      started.push(k)
      return new Promise<string>((done) => waits.push(() => done(k)))
    }
    for (const k of ['a', 'b', 'c', 'd', 'e', 'f', 'g'])
      cache.prefetch(k, slow(k), ['movies.updated'])
    // a and b went at once; c..g queued, four kept: d, e, f, g
    expect(started).toEqual(['a', 'b'])
    waits.shift()?.()
    await Bun.sleep(1)
    expect(started).toEqual(['a', 'b', 'g'])
    for (let i = 0; i < 6; i++) {
      waits.shift()?.()
      await Bun.sleep(1)
    }
    expect(started).toEqual(['a', 'b', 'g', 'f', 'e', 'd'])
    // a fresh answer isn't fetched ahead again
    cache.prefetch('a', slow('a'), ['movies.updated'])
    expect(started.filter((k) => k === 'a')).toHaveLength(1)
  })
})

// SPDX-License-Identifier: AGPL-3.0-only
import { GlobalRegistrator } from '@happy-dom/global-registrator'

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register({ url: 'http://localhost/' })
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { describe, expect, test } = await import('bun:test')
const { act, render } = await import('@testing-library/react')
const { createClient } = await import('../src/index.ts')
const { ClientProvider, useQuery } = await import('../src/react.tsx')

describe('useQuery', () => {
  test('loads, then refetches in place when an event names its topic', async () => {
    let name = 'Harbor'
    let push: ((topic: string) => void) | null = null
    let id = 0
    const client = createClient({
      fetch: async (url) => {
        if (String(url).endsWith('/events'))
          return new Response(
            new ReadableStream({
              start(c) {
                push = (topic) =>
                  c.enqueue(
                    new TextEncoder().encode(
                      `data: ${JSON.stringify({ id: ++id, topic, at: 0 })}\n\n`,
                    ),
                  )
              },
            }),
          )
        return new Response(
          JSON.stringify({ id: 'srv_1', name, version: '0', localAddresses: [], publicUrl: null }),
        )
      },
    })
    const renders: string[] = []
    function Name() {
      const q = useQuery('info', (c) => c.system.publicInfo(), ['server.updated'])
      renders.push(q.status === 'success' ? q.data.name : q.status)
      return <p>{q.status === 'success' ? q.data.name : '…'}</p>
    }
    const view = render(
      <ClientProvider client={client}>
        <Name />
      </ClientProvider>,
    )
    await act(() => Bun.sleep(10))
    expect(view.container.textContent).toBe('Harbor')
    name = 'Harbor at home'
    await act(async () => {
      push?.('movies.updated')
      await Bun.sleep(10)
    })
    expect(view.container.textContent).toBe('Harbor')
    await act(async () => {
      push?.('server.updated')
      await Bun.sleep(10)
    })
    expect(view.container.textContent).toBe('Harbor at home')
    // the refetch was silent: nothing went back to loading after the first result
    expect(renders.slice(renders.indexOf('Harbor'))).not.toContain('loading')
    view.unmount()
  })
})

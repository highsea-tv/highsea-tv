// SPDX-License-Identifier: AGPL-3.0-only
// The app's one cache of answers (HT-116, @highsea-tv/sdk's cache.ts) through the client's own
// hooks: a screen opened again draws at once and asks again behind it, a server event makes what
// it names stale, Mark as watched shows everywhere at once, and another profile or another sign-in
// never sees the last one's answers. A client of the test's own: no network.
import type { ClientItem, ServerEvent } from '@highsea-tv/api-contract'
import { useItem, useLibrary, useMarkWatched } from '@highsea-tv/client/data'
import type { HighseaClient } from '@highsea-tv/sdk'
import { ClientProvider } from '@highsea-tv/sdk/react'
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { useEffect } from 'react'
import { Pressable, Text } from 'react-native'
import { ProfilesProvider, useProfilesState } from '../src/profiles/state.tsx'

const film = (id: number, title: string, watched = false) =>
  ({
    id,
    type: 'movie',
    title,
    year: 2001,
    watched,
    progress: null,
    position: 0,
    art: { poster: null, backdrop: null, logo: null },
  }) as unknown as ClientItem

/**
 * A server with two profiles, each with its own library, counting the library's reads; `push`
 * sends an event as the server's stream would.
 */
function server() {
  const s = {
    current: 'p1',
    reads: 0,
    /** Reads wait unanswered: what's drawn then is only the cache's. */
    hold: false,
    libraries: {
      p1: [film(1, 'Harbor'), film(2, 'Lantern')],
      p2: [film(3, 'Tide')],
    } as Record<string, ClientItem[]>,
    listeners: new Set<(e: ServerEvent) => void>(),
    push: (topic: string) => {
      for (const l of s.listeners) l({ id: 1, topic, at: 0 } as ServerEvent)
    },
  }
  const client = {
    system: { publicInfo: async () => ({ sources: ['profiles'] }) },
    profiles: {
      list: async () => ({
        profiles: [
          { id: 'p1', name: 'Ines', tone: 'blue', main: true, hasPin: false },
          { id: 'p2', name: 'Ruth', tone: 'green', main: false, hasPin: false },
        ],
        current: s.current,
        max: 5,
      }),
      choose: async ({ params }: { params: { id: string } }) => {
        s.current = params.id
        return { ok: true }
      },
    },
    library: {
      list: async () => {
        s.reads++
        if (s.hold) await new Promise(() => {})
        return { items: s.libraries[s.current], next: null }
      },
      item: async ({ params }: { params: { id: number } }) => {
        if (s.hold) await new Promise(() => {})
        return { item: s.libraries[s.current]?.find((i) => i.id === params.id) }
      },
    },
    playback: {
      played: async () => {
        s.hold = true
        return { ok: true }
      },
    },
    events: {
      subscribe: (l: (e: ServerEvent) => void) => {
        s.listeners.add(l)
        return () => s.listeners.delete(l)
      },
    },
  } as unknown as HighseaClient
  return { s, client }
}

/** The library's titles, each with "watched" after it when it is; every state it drew. */
const drawn: string[] = []
function Library() {
  const q = useLibrary()
  const line =
    q.status === 'success'
      ? q.data.map((i) => `${i.title}${i.watched ? ' watched' : ''}`).join(', ')
      : q.status
  drawn.push(line)
  return <Text>{line}</Text>
}

function Film({ id }: { id: number }) {
  const q = useItem(id)
  const mark = useMarkWatched(id)
  return (
    <>
      <Text>
        {q.status === 'success'
          ? `page: ${q.data.item.title}${q.data.item.watched ? ' watched' : ''}`
          : `page: ${q.status}`}
      </Text>
      <Pressable accessibilityRole="button" onPress={() => void mark.run(true)}>
        <Text>Mark as watched</Text>
      </Pressable>
    </>
  )
}

const tick = () => act(() => new Promise((r) => setTimeout(r, 0)))

beforeEach(() => {
  drawn.length = 0
})

test('a screen opened again draws at once from the cache, then asks again behind it', async () => {
  const { s, client } = server()
  const first = await render(
    <ClientProvider client={client} cache>
      <Library />
    </ClientProvider>,
  )
  expect(await screen.findByText('Harbor, Lantern')).toBeTruthy()
  await first.unmount()
  drawn.length = 0
  // the server has another film by now
  s.libraries.p1 = [film(1, 'Harbor'), film(2, 'Lantern'), film(4, 'Quay')]
  await render(
    <ClientProvider client={client} cache>
      <Library />
    </ClientProvider>,
  )
  // the first draw is the answer already had: no loading state
  expect(drawn[0]).toBe('Harbor, Lantern')
  // and it's asked again behind it (nothing was on view to hear the server's events meanwhile)
  expect(await screen.findByText('Harbor, Lantern, Quay')).toBeTruthy()
  expect(s.reads).toBe(2)
  expect(drawn).not.toContain('loading')
})

test('an event naming the library makes it stale and it is read again quietly', async () => {
  const { s, client } = server()
  await render(
    <ClientProvider client={client} cache>
      <Library />
    </ClientProvider>,
  )
  expect(await screen.findByText('Harbor, Lantern')).toBeTruthy()
  s.libraries.p1 = [...s.libraries.p1, film(4, 'Quay')]
  await act(async () => s.push('movies.updated'))
  expect(await screen.findByText('Harbor, Lantern, Quay')).toBeTruthy()
  expect(s.reads).toBe(2)
  expect(drawn.slice(drawn.indexOf('Harbor, Lantern'))).not.toContain('loading')
})

test('Mark as watched shows at once on the page and in the library, before any event', async () => {
  const { client } = server()
  await render(
    <ClientProvider client={client} cache>
      <Library />
      <Film id={1} />
    </ClientProvider>,
  )
  expect(await screen.findByText('Harbor, Lantern')).toBeTruthy()
  expect(await screen.findByText('page: Harbor')).toBeTruthy()
  await fireEvent.press(screen.getByRole('button', { name: 'Mark as watched' }))
  // the server's answers are held, so only the cache's own change can draw these
  expect(screen.getByText('Harbor watched, Lantern')).toBeTruthy()
  expect(screen.getByText('page: Harbor watched')).toBeTruthy()
})

test("another profile never sees the last one's answers", async () => {
  const { client } = server()
  let state: ReturnType<typeof useProfilesState> = null
  function Probe() {
    state = useProfilesState()
    useEffect(() => {})
    return null
  }
  await render(
    <ClientProvider client={client} cache>
      <ProfilesProvider>
        <Probe />
        <Library />
      </ProfilesProvider>
    </ClientProvider>,
  )
  expect(await screen.findByText('Harbor, Lantern')).toBeTruthy()
  drawn.length = 0
  await act(async () => {
    await state?.switchTo('p2')
  })
  expect(await screen.findByText('Tide')).toBeTruthy()
  // from the switch on: loading, then the new profile's; never the last one's
  expect(drawn).not.toContain('Harbor, Lantern')
  expect(drawn[0]).toBe('loading')
})

test('another sign-in (a new client) starts with an empty cache', async () => {
  const a = server()
  const view = await render(
    <ClientProvider client={a.client} cache>
      <Library />
    </ClientProvider>,
  )
  expect(await screen.findByText('Harbor, Lantern')).toBeTruthy()
  await view.unmount()
  // signing out and in again makes a new client (packages/native's servers.tsx)
  const b = server()
  b.s.libraries.p1 = [film(5, 'Signal')]
  drawn.length = 0
  await render(
    <ClientProvider client={b.client} cache>
      <Library />
    </ClientProvider>,
  )
  expect(drawn[0]).toBe('loading')
  expect(await screen.findByText('Signal')).toBeTruthy()
  expect(drawn).not.toContain('Harbor, Lantern')
  await tick()
})

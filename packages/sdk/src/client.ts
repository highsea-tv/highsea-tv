// SPDX-License-Identifier: AGPL-3.0-only
import { ErrorBody, routes } from '@highsea/api-contract'
import type { z } from 'zod'
import { ApiError } from './errors.ts'
import { createEventStream, type EventStream } from './events.ts'

type Schema = z.ZodType

/** Just the call: platforms' `fetch` types add extras (Bun's `preconnect`) a test double lacks. */
export type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

/** The parts of a contract route the client reads. */
type Route = {
  method: string
  path: string
  request?: {
    params?: Schema
    query?: Schema
    headers?: Schema
    body?: { content: { 'application/json': { schema: Schema } } }
  }
  responses: Record<number, { content?: Record<string, { schema: Schema }> }>
}

type JsonOf<R> = R extends { content: { 'application/json': { schema: infer S extends Schema } } }
  ? z.output<S>
  : undefined

/** The success body: the 200 or 201 response's JSON, or nothing for 204. */
export type Output<R extends Route> = 200 extends keyof R['responses']
  ? JsonOf<R['responses'][200]>
  : 201 extends keyof R['responses']
    ? JsonOf<R['responses'][201]>
    : undefined

type Part<R extends Route, K extends 'params' | 'query'> = R['request'] extends {
  [P in K]: infer S extends Schema
}
  ? { [P in K]: z.input<S> }
  : { [P in K]?: never }

type Body<R extends Route> = R['request'] extends {
  body: { content: { 'application/json': { schema: infer S extends Schema } } }
}
  ? { body: z.input<S> }
  : { body?: never }

export type Input<R extends Route> = Part<R, 'params'> & Part<R, 'query'> & Body<R>

type Group<G extends Record<string, Route>> = {
  [K in keyof G]: (input?: Input<G[K]>) => Promise<Output<G[K]>>
}

export type ClientOptions = {
  /** The server's origin (`http://192.168.1.20:3000`); empty for the same origin (the admin). */
  baseUrl?: string
  /** A device token or API key. The admin uses its session cookie instead. */
  token?: string | (() => string | null)
  fetch?: Fetch
}

export type HighseaClient = {
  call<R extends Route>(route: R, input?: Input<R>): Promise<Output<R>>
  events: EventStream
  baseUrl: string
} & { [G in keyof typeof routes]: Group<(typeof routes)[G]> }

/** Fills `{name}` path segments from `params`. */
export function fillPath(path: string, params: Record<string, unknown> = {}) {
  return path.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = params[name]
    if (value === undefined) throw new ApiError('invalid', `The ${name} for ${path} is missing.`)
    return encodeURIComponent(String(value))
  })
}

export function createClient(options: ClientOptions = {}): HighseaClient {
  const baseUrl = (options.baseUrl ?? '').replace(/\/$/, '')
  const doFetch = options.fetch ?? ((...args: Parameters<Fetch>) => fetch(...args))
  const token = () =>
    typeof options.token === 'function' ? options.token() : (options.token ?? null)

  const headers = (extra: Record<string, string> = {}) => {
    const h: Record<string, string> = { accept: 'application/json', ...extra }
    const t = token()
    if (t) h.authorization = `Bearer ${t}`
    return h
  }

  async function call<R extends Route>(route: R, input?: Input<R>): Promise<Output<R>> {
    const i = (input ?? {}) as {
      params?: Record<string, unknown>
      query?: Record<string, unknown>
      body?: unknown
    }
    let url = baseUrl + fillPath(route.path, i.params)
    if (i.query) {
      const q = new URLSearchParams()
      for (const [k, v] of Object.entries(i.query))
        if (v !== undefined && v !== null) q.set(k, String(v))
      const s = q.toString()
      if (s) url += `?${s}`
    }
    let res: Response
    try {
      res = await doFetch(url, {
        method: route.method.toUpperCase(),
        headers: headers(i.body === undefined ? {} : { 'content-type': 'application/json' }),
        body: i.body === undefined ? undefined : JSON.stringify(i.body),
        credentials: 'include',
      })
    } catch {
      throw new ApiError('unavailable', 'Can’t reach the server.')
    }
    if (res.status === 204) return undefined as Output<R>
    const text = await res.text()
    const data: unknown = text ? safeJson(text) : undefined
    if (!res.ok) {
      const parsed = ErrorBody.safeParse(data)
      if (parsed.success)
        throw new ApiError(
          parsed.data.error.code,
          parsed.data.error.message,
          res.status,
          parsed.data.error.details,
        )
      throw new ApiError(
        res.status >= 500 ? 'internal' : 'invalid',
        `The server answered ${res.status}.`,
        res.status,
      )
    }
    return data as Output<R>
  }

  const client = {
    call,
    baseUrl,
    events: createEventStream({
      baseUrl,
      fetch: doFetch,
      headers: () => headers({ accept: 'text/event-stream' }),
    }),
  } as HighseaClient
  for (const [group, rs] of Object.entries(routes)) {
    const methods: Record<string, (input?: unknown) => Promise<unknown>> = {}
    for (const [name, route] of Object.entries(rs))
      methods[name] = (input) => call(route as Route, input as never)
    ;(client as unknown as Record<string, unknown>)[group] = methods
  }
  return client
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

// SPDX-License-Identifier: AGPL-3.0-only
import { z } from '@hono/zod-openapi'

export const API_PREFIX = '/api/v1'

export const ERROR_CODES = [
  'invalid',
  'unauthorized',
  'forbidden',
  'not-found',
  'conflict',
  'rate-limited',
  'internal',
  'unavailable',
] as const

/** Every error, everywhere: a code from the list, a message for people, and optional details. */
export const ErrorBody = z
  .object({
    error: z.object({
      code: z.enum(ERROR_CODES),
      message: z.string(),
      details: z.unknown().optional(),
    }),
  })
  .openapi('Error')

export type ErrorBody = z.infer<typeof ErrorBody>

const STATUS = {
  invalid: 400,
  unauthorized: 401,
  forbidden: 403,
  'not-found': 404,
  conflict: 409,
  'rate-limited': 429,
  internal: 500,
  unavailable: 503,
} as const

/** The error responses a route can give, for its `responses`. */
export function errors<const C extends (typeof ERROR_CODES)[number]>(...codes: C[]) {
  return Object.fromEntries(
    codes.map((c) => [
      STATUS[c],
      { description: c, content: { 'application/json': { schema: ErrorBody } } },
    ]),
  ) as unknown as {
    [K in C as (typeof STATUS)[K]]: {
      description: string
      content: { 'application/json': { schema: typeof ErrorBody } }
    }
  }
}

/** A JSON response body, for a route's `responses`. */
export const json = <S extends z.ZodType>(schema: S, description: string) => ({
  description,
  content: { 'application/json': { schema } },
})

/**
 * Who may call a route, declared on the route as the `x-highsea-access` OpenAPI extension and
 * enforced by the server from the contract (ADR 0023):
 * - `public`: anyone, signed in or not;
 * - `user`: anyone signed in;
 * - `people`: staff, or anyone given "Manage people";
 * - `library`: staff, or anyone given "Manage the library" (adding, editing and removing titles);
 * - `staff`: the owner and admins;
 * - `owner`: the owner alone.
 * Read-only API keys may call GET routes only.
 */
export const ACCESS = ['public', 'user', 'people', 'library', 'staff', 'owner'] as const
export type Access = (typeof ACCESS)[number]

export const ACCESS_KEY = 'x-highsea-access'

/** A route's access, with the security requirements the document shows for it. */
export const access = <const A extends Access>(level: A) =>
  ({
    [ACCESS_KEY]: level,
    ...(level === 'public' ? {} : { security: [{ session: [] }, { bearer: [] }] }),
  }) as { 'x-highsea-access': A; security?: { [k: string]: string[] }[] }

/** The access a route declares. */
export const accessOf = (route: object): Access | undefined =>
  (route as Record<string, unknown>)[ACCESS_KEY] as Access | undefined

/** ISO 8601 date-times, as the prototype's draft types have them. */
export const IsoDate = z.iso.datetime().openapi({ example: '2026-10-17T20:15:00.000Z' })

/** A title, person or collection's id at TMDB, as a path parameter (ADR 0014, amended 2026-10-20). */
export const TmdbIdParam = z.object({
  id: z.coerce
    .number<number>()
    .int()
    .positive()
    .openapi({ param: { name: 'id', in: 'path' }, example: 603 }),
})

/** Calendar dates as TMDB gives them (`YYYY-MM-DD`): a release has a day, not a time. */
export const IsoDay = z.iso.date().openapi({ example: '1999-03-30' })

/** A `{ id }` path parameter. */
export const IdParam = z.object({ id: z.string().openapi({ param: { name: 'id', in: 'path' } }) })

/** A JSON request body, for a route's `request`. */
export const body = <S extends z.ZodType>(schema: S) => ({
  body: { content: { 'application/json': { schema } }, required: true },
})

/** No content. */
export const noContent = { 204: { description: 'Done' } } as const

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

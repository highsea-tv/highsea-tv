// SPDX-License-Identifier: AGPL-3.0-only
// One error shape for the whole server: a code from a short list, a message written for people,
// and optional details. The API turns it into `{ error: { code, message, details } }`.

export const ERROR_CODES = {
  invalid: 400,
  unauthorized: 401,
  forbidden: 403,
  'not-found': 404,
  conflict: 409,
  'rate-limited': 429,
  internal: 500,
  unavailable: 503,
} as const

export type ErrorCode = keyof typeof ERROR_CODES

export class AppError extends Error {
  readonly code: ErrorCode
  readonly details: unknown
  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.details = details
  }
  get status(): number {
    return ERROR_CODES[this.code]
  }
}

export const isAppError = (e: unknown): e is AppError => e instanceof AppError

// SPDX-License-Identifier: AGPL-3.0-only
import type { ErrorBody } from '@highsea/api-contract'

export type ErrorCode = ErrorBody['error']['code']

/** What a failed call throws: the server's code and message, or `unavailable` when it's unreachable. */
export class ApiError extends Error {
  readonly code: ErrorCode
  readonly status: number
  readonly details: unknown
  constructor(code: ErrorCode, message: string, status = 0, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.details = details
  }
}

// SPDX-License-Identifier: AGPL-3.0-only
// The definition format as JSON Schema, for editors and for people writing definitions in
// `/config/definitions` (zod 4's `z.toJSONSchema`, zod.dev/json-schema). The input side, so
// defaults are optional, as an author writes them.
import { z } from 'zod'
import { definitionSchema } from './definition.ts'

export function definitionJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(definitionSchema, { io: 'input', unrepresentable: 'any' }) as Record<
    string,
    unknown
  >
}

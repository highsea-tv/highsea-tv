// SPDX-License-Identifier: AGPL-3.0-only
// An indexer's settings, as its definition's form describes them. Secret ones (passwords, keys,
// cookies) are sealed at rest like the TMDB key, never returned by the API (a read says whether
// each is set), and opened only to make a request.
import { AppError, type Sealer } from '@highsea-tv/core'
import { type Definition, isSecret, type SettingField } from '@highsea-tv/schemas/indexers'
import type { SettingValue } from './engine.ts'

/** By key; secret values are sealed strings. */
export type StoredSettings = Record<string, SettingValue>

const invalid = (field: SettingField, message: string) =>
  new AppError('invalid', message, { field: `settings.${field.key}` })

function coerce(field: SettingField, value: unknown): SettingValue {
  switch (field.type) {
    case 'checkbox':
      if (typeof value === 'boolean') return value
      if (value === 'true' || value === 'false') return value === 'true'
      throw invalid(field, `${field.label} is on or off.`)
    case 'number': {
      const n =
        typeof value === 'number'
          ? value
          : typeof value === 'string' && value.trim() !== ''
            ? Number(value)
            : Number.NaN
      if (!Number.isFinite(n)) throw invalid(field, `${field.label} is a number.`)
      return n
    }
    case 'select': {
      const v = String(value)
      if (!field.options?.some((o) => o.value === v))
        throw invalid(field, `Pick one of the choices for ${field.label}.`)
      return v
    }
    case 'url': {
      const v = String(value).trim()
      if (!/^https?:\/\/[^\s/]+/.test(v))
        throw invalid(field, `${field.label} starts with http:// or https://.`)
      return v
    }
    default: {
      if (typeof value !== 'string' && typeof value !== 'number')
        throw invalid(field, `${field.label} is text.`)
      const v = String(value).trim()
      if (v.length > 2000) throw invalid(field, `${field.label} is too long.`)
      return v
    }
  }
}

const isEmpty = (v: unknown) => v === undefined || v === null || v === ''

/**
 * Checks input against the definition's fields and seals the secrets. A secret left empty keeps
 * the one already saved, so the form never has to show it.
 */
export function prepareSettings(
  definition: Definition,
  input: Readonly<Record<string, unknown>>,
  existing: StoredSettings | null,
  sealer: Sealer,
): StoredSettings {
  const fields = new Map(definition.settings.map((f) => [f.key, f]))
  for (const key of Object.keys(input))
    if (!fields.has(key))
      throw new AppError('invalid', `${definition.name} has no setting called ${key}.`, {
        field: `settings.${key}`,
      })
  const out: StoredSettings = {}
  for (const field of definition.settings) {
    const value = input[field.key]
    const before = existing?.[field.key]
    if (isSecret(field)) {
      if (!isEmpty(value)) out[field.key] = sealer.seal(String(coerce(field, value)))
      else if (before !== undefined && before !== '') out[field.key] = before
    } else if (!isEmpty(value)) out[field.key] = coerce(field, value)
    else if (value === undefined && before !== undefined) out[field.key] = before
    else if (field.default !== undefined) out[field.key] = field.default
    if (field.required && isEmpty(out[field.key]) && field.type !== 'checkbox')
      throw invalid(field, `${field.label} is required.`)
  }
  return out
}

/** The settings with secrets opened, to make requests. */
export function openSettings(
  definition: Definition,
  stored: StoredSettings,
  sealer: Sealer,
): Record<string, SettingValue> {
  const out: Record<string, SettingValue> = {}
  for (const field of definition.settings) {
    const v = stored[field.key]
    if (v === undefined) continue
    out[field.key] = isSecret(field) && typeof v === 'string' && v !== '' ? sealer.open(v) : v
  }
  return out
}

/** Every secret's value, for redacting errors and logs. */
export function secretsOf(
  definition: Definition,
  opened: Readonly<Record<string, SettingValue>>,
): string[] {
  return definition.settings
    .filter((f) => isSecret(f))
    .map((f) => opened[f.key])
    .filter((v): v is string => typeof v === 'string' && v !== '')
}

export type SettingsView = {
  /** Plain settings' values. */
  values: Record<string, SettingValue>
  /** Each secret setting, and whether it's set. */
  secrets: Record<string, boolean>
}

export function viewSettings(definition: Definition | null, stored: StoredSettings): SettingsView {
  const values: Record<string, SettingValue> = {}
  const secrets: Record<string, boolean> = {}
  if (!definition) return { values, secrets }
  for (const field of definition.settings) {
    const v = stored[field.key]
    if (isSecret(field)) secrets[field.key] = v !== undefined && v !== ''
    else if (v !== undefined) values[field.key] = v
  }
  return { values, secrets }
}

/**
 * Carries settings to a new definition version: a setting it drops goes, a new one takes its
 * default, and a new required one without a default needs the owner's attention.
 */
export function migrateSettings(
  definition: Definition,
  stored: StoredSettings,
  sealer: Sealer,
): { settings: StoredSettings; needsAttention: boolean } {
  const settings: StoredSettings = {}
  let needsAttention = false
  for (const field of definition.settings) {
    let v = stored[field.key] ?? field.default
    // a setting that became secret is sealed now, one that stopped being secret is opened
    const sealed = typeof v === 'string' && v.startsWith('v1.')
    if (typeof v === 'string' && v !== '' && isSecret(field) && !sealed) v = sealer.seal(v)
    else if (typeof v === 'string' && !isSecret(field) && sealed) {
      try {
        v = sealer.open(v)
      } catch {
        // plain text that only looks sealed
      }
    }
    if (v !== undefined) settings[field.key] = v
    if (field.required && field.type !== 'checkbox' && isEmpty(settings[field.key]))
      needsAttention = true
  }
  return { settings, needsAttention }
}

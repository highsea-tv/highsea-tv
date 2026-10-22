// SPDX-License-Identifier: AGPL-3.0-only
// What curation decides without the database (curation.md › Decisions): an item's status from its
// schedule, whether a person on an app is in an audience, and the rule sources' values, checked
// before they're saved.
import type {
  Audience,
  ClientType,
  CurationStatus,
  FeaturedRule,
  FeaturedSource,
} from '@highsea/api-contract'

/** A draft stays a draft; otherwise the schedule decides. */
export function statusOf(
  s: { startAt: number; endAt: number | null; draft?: boolean },
  now: number,
): CurationStatus {
  if (s.draft) return 'draft'
  if (s.startAt > now) return 'scheduled'
  if (s.endAt !== null && s.endAt <= now) return 'ended'
  return 'live'
}

export type Viewer = { id: string; role: 'owner' | 'admin' | 'user' }

/** Whether a person on one kind of app is in the audience. */
export function reaches(audience: Audience, viewer: Viewer, client: ClientType): boolean {
  switch (audience.kind) {
    case 'everyone':
      return true
    case 'roles':
      return audience.roles.includes(viewer.role)
    case 'users':
      return audience.userIds.includes(viewer.id)
    case 'clients':
      return audience.clients.includes(client)
  }
}

/** Whether the audience can include the person at all, on some app: who reach counts. */
export function mayReach(audience: Audience, viewer: Viewer): boolean {
  return audience.kind === 'clients'
    ? audience.clients.length > 0
    : reaches(audience, viewer, 'web')
}

/** Every kind of app, as `ClientType` lists them. */
export const CLIENTS: ClientType[] = [
  'admin',
  'web',
  'desktop',
  'ios',
  'android',
  'tvos',
  'androidtv',
  'webos',
  'tizen',
]

// ---------------------------------------------------------------- rules

/** Recently added's windows, in days. */
export const RECENT_WINDOWS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 }

/** 8c's free-text filter, kept to turn saved ones into collections (8d). */
export type FilterTerm = {
  field: 'year' | 'rating'
  op: '<' | '<=' | '>' | '>=' | '='
  value: number
}

const TERM = /^(year|rating)\s*(<=|>=|<|>|=)\s*(\d+(?:\.\d+)?)$/i

/**
 * A saved filter, as the library's filter bar writes one: `year < 1930`, `rating >= 4` (out of 5),
 * joined by `and`. Null when it isn't one.
 */
export function parseFilter(value: string): FilterTerm[] | null {
  const parts = value.trim().split(/\s+and\s+/i)
  const terms: FilterTerm[] = []
  for (const part of parts) {
    const m = TERM.exec(part.trim())
    if (!m) return null
    terms.push({
      field: (m[1] as string).toLowerCase() as FilterTerm['field'],
      op: m[2] as FilterTerm['op'],
      value: Number(m[3]),
    })
  }
  return terms.length ? terms : null
}

/** What a rule source asks the library for, checked. */
export type LibraryPick =
  | { rule: 'recently-added'; days: number }
  | { rule: 'genre'; genre: string }
  | { rule: 'collection'; collectionId: number }

/** A library pick, or one of the server's own collections (8d), which collections answer. */
export type RulePick = LibraryPick | { rule: 'smart'; collectionId: string }

/** A rule source's value as the library takes it; null when it doesn't make sense. */
export function rulePick(source: Extract<FeaturedSource, { kind: 'rule' }>): RulePick | null {
  const value = source.value.trim()
  switch (source.rule) {
    case 'recently-added': {
      const days = RECENT_WINDOWS[value]
      return days ? { rule: 'recently-added', days } : null
    }
    case 'genre':
      return value ? { rule: 'genre', genre: value } : null
    case 'collection': {
      if (value.startsWith('sc-')) return { rule: 'smart', collectionId: value }
      const id = Number(value)
      return Number.isInteger(id) && id > 0 ? { rule: 'collection', collectionId: id } : null
    }
  }
}

/** Why a rule's value was refused, for the composer's field. */
export const RULE_ERRORS: Record<FeaturedRule, string> = {
  'recently-added': 'Choose 7, 30 or 90 days.',
  genre: 'Choose a genre.',
  collection: 'Choose a collection.',
}

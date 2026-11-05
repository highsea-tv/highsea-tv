// SPDX-License-Identifier: AGPL-3.0-only
// Profiles (the owner, 2026-10-30; prototype-gaps.md › 3.6): one account, the person the server's
// owner invited, holds profiles for the people who watch with it, each with its own name, colour,
// watch history and Home, and an optional four-digit PIN. They're the account's, kept by the
// server, so any app can add or switch them without signing in again, and every app asks for a
// profile's PIN, which the server checks: an app never sees one. The account's own profile is the
// first, and can't be deleted. Drafted with B3 of the one client platform (one-client-platform-b.md,
// the owner's answer 1): the prototypes' mock answers these, and the real server answers 501
// until it has profiles (`draft()` in common.ts). Whether a TV asks who's watching when it opens
// is the TV's own setting, kept on the device, not here.
import { createRoute, z } from '@hono/zod-openapi'
import {
  API_PREFIX,
  access,
  body,
  draft,
  errors,
  IdParam,
  json,
  noContent,
  notServed,
} from './common.ts'

/** A profile's colour, from the tokens' soft pairs. */
export const PROFILE_TONES = ['accent', 'info', 'success', 'warning', 'danger'] as const

/** How many profiles an account may have. */
export const MAX_PROFILES = 6

/** Four digits. */
export const Pin = z
  .string()
  .regex(/^\d{4}$/)
  .openapi({ example: '2580' })

export const Profile = z
  .object({
    id: z.string(),
    name: z.string(),
    tone: z.enum(PROFILE_TONES),
    /** Whether choosing it asks for its PIN. The PIN itself never leaves the server. */
    hasPin: z.boolean(),
    /** The account's own profile: always first, never deleted. */
    main: z.boolean(),
  })
  .openapi('Profile')

/** The account's profiles, the one watching now, and how many it may have. */
export const Profiles = z
  .object({
    profiles: z.array(Profile),
    /** The profile watching now. */
    current: z.string(),
    max: z.number().int(),
  })
  .openapi('Profiles')

const ProfileName = z.string().trim().min(1).max(40)

export const NewProfile = z
  .object({ name: ProfileName, tone: z.enum(PROFILE_TONES) })
  .openapi('NewProfile')

/** A profile's changes; `pin` null turns its PIN off. */
export const ProfilePatch = z
  .object({
    name: ProfileName.optional(),
    tone: z.enum(PROFILE_TONES).optional(),
    pin: Pin.nullable().optional(),
  })
  .openapi('ProfilePatch')

const PROFILES = `${API_PREFIX}/me/profiles`
const DRAFTED = 'Drafted: the server answers 501 until it has profiles.'
const mine = { ...access('user'), ...draft() }

export const profiles = {
  list: createRoute({
    method: 'get',
    path: PROFILES,
    tags: ['Profiles'],
    summary: 'Your account’s profiles, and the one watching now (draft)',
    description: DRAFTED,
    ...mine,
    responses: { 200: json(Profiles, 'The profiles'), ...errors('unauthorized'), ...notServed },
  }),
  create: createRoute({
    method: 'post',
    path: PROFILES,
    tags: ['Profiles'],
    summary: 'Add a profile (draft)',
    description: `409 once the account has its most. ${DRAFTED}`,
    ...mine,
    request: body(NewProfile),
    responses: {
      200: json(Profile, 'The new profile'),
      ...errors('invalid', 'unauthorized', 'conflict'),
      ...notServed,
    },
  }),
  update: createRoute({
    method: 'patch',
    path: `${PROFILES}/{id}`,
    tags: ['Profiles'],
    summary: 'Rename a profile, change its colour, or set or turn off its PIN (draft)',
    description: DRAFTED,
    ...mine,
    request: { params: IdParam, ...body(ProfilePatch) },
    responses: {
      200: json(Profile, 'The profile'),
      ...errors('invalid', 'unauthorized', 'not-found'),
      ...notServed,
    },
  }),
  delete: createRoute({
    method: 'delete',
    path: `${PROFILES}/{id}`,
    tags: ['Profiles'],
    summary: 'Delete a profile and its watch history (draft)',
    description: `409 for the account’s own profile. ${DRAFTED}`,
    ...mine,
    request: { params: IdParam },
    responses: {
      ...noContent,
      ...errors('unauthorized', 'not-found', 'conflict'),
      ...notServed,
    },
  }),
  choose: createRoute({
    method: 'post',
    path: `${PROFILES}/{id}/choose`,
    tags: ['Profiles'],
    summary: 'Watch as a profile, with its PIN when it has one (draft)',
    description: `A wrong PIN is 403 with \`{ field: 'pin', reason: 'wrong-pin' }\` (not 401, which would say the app isn't signed in: RFC 9110 § 15.5.2); after five wrong in a row, 429 with \`{ reason: 'rate-limited', retryAfter: 60 }\` for a minute. The profile watching now needs no PIN. ${DRAFTED}`,
    ...mine,
    request: {
      params: IdParam,
      ...body(z.object({ pin: Pin.optional() }).openapi('ChooseProfile')),
    },
    responses: {
      200: json(Profiles, 'The profiles, with this one watching'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'not-found', 'rate-limited'),
      ...notServed,
    },
  }),
} as const

export type ProfileTone = (typeof PROFILE_TONES)[number]
export type Profile = z.infer<typeof Profile>
export type Profiles = z.infer<typeof Profiles>
export type NewProfile = z.infer<typeof NewProfile>
export type ProfilePatch = z.infer<typeof ProfilePatch>

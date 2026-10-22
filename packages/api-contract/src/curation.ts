// SPDX-License-Identifier: AGPL-3.0-only
// Curation (curation.md, client-home.md; checkpoint 8c, ADR 0048): the owner's announcements and the
// featured sections every home screen is made of, and the two reads the apps make from them, each
// resolved on the server for the person asking and the kind of app they're on. Status comes from
// the schedule; only a draft is stored. A title is addressed by its TMDB id, as everywhere else.
import { createRoute, z } from '@hono/zod-openapi'
import { ClientType, Role } from './accounts.ts'
import { API_PREFIX, access, body, errors, IdParam, IsoDate, json, noContent } from './common.ts'
import { ClientItem } from './library.ts'

// ---------------------------------------------------------------- shapes

export const Audience = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('everyone') }),
    z.object({ kind: z.literal('roles'), roles: z.array(Role).max(3) }),
    z.object({ kind: z.literal('users'), userIds: z.array(z.string().max(64)).max(500) }),
    z.object({ kind: z.literal('clients'), clients: z.array(ClientType).max(9) }),
  ])
  .openapi('Audience', {
    description:
      'Who sees it: everyone, some roles, some people, or the people on some apps. An empty choice is refused when publishing, and kept in a draft',
  })

export const Placement = z.enum(['banner', 'modal', 'toast', 'card']).openapi('Placement')
export const Severity = z.enum(['info', 'notice', 'warning', 'critical']).openapi('Severity')
export const CurationStatus = z
  .enum(['draft', 'scheduled', 'live', 'ended'])
  .openapi('CurationStatus', { description: 'A draft is stored; the rest come from the schedule' })

export const Schedule = z
  .object({ start: IsoDate, end: IsoDate.nullable() })
  .openapi('Schedule', { description: 'No end runs until it’s ended by hand' })

/** A button: a label and a full https link. Checked when publishing; a draft keeps it as typed. */
export const Cta = z.object({ label: z.string().max(40), url: z.string().max(2000) }).openapi('Cta')

const AnnouncementFields = {
  title: z.string().trim().min(1).max(80),
  /** Markdown: `**bold**`, `_italic_` and `[links](https://…)`. */
  body: z.string().max(4000),
  /** A backdrop from the library (its image address here), or none. */
  image: z.string().max(2000).nullable(),
  cta: Cta.nullable(),
  severity: Severity,
  placements: z.array(Placement).max(4),
  audience: Audience,
  schedule: Schedule,
  /** `require` makes it a dialog only Got it closes, and a screen of its own on TV. */
  acknowledgement: z.enum(['dismiss', 'require']),
}

export const Announcement = z
  .object({ id: z.string(), ...AnnouncementFields, status: CurationStatus })
  .openapi('Announcement')

export const AnnouncementInput = z
  .object({
    ...AnnouncementFields,
    /** Saved but off every screen until it's published. Only a title is needed for one. */
    draft: z.boolean(),
  })
  .openapi('AnnouncementInput')

/** An announcement in the admin's list: how many of its audience have seen it. */
export const AnnouncementSummary = Announcement.extend({
  /** People, not devices; invites don't count until they join. Acknowledged, when it's required. */
  seenBy: z.number().int(),
  audienceSize: z.number().int(),
}).openapi('AnnouncementSummary')

/** An announcement as an app shows it: live, for this person on this app. */
export const ClientAnnouncement = Announcement.omit({ status: true })
  .extend({
    /** This person dismissed or acknowledged it. */
    seen: z.boolean(),
  })
  .openapi('ClientAnnouncement')

export const FEATURED_RULES = ['recently-added', 'genre', 'collection', 'filter'] as const
export const FeaturedRule = z.enum(FEATURED_RULES).openapi('FeaturedRule')

export const FeaturedSource = z
  .discriminatedUnion('kind', [
    z.object({
      kind: z.literal('manual'),
      /** TMDB ids, in the section's order. */
      itemIds: z.array(z.number().int().positive()).max(100),
    }),
    z.object({
      kind: z.literal('rule'),
      rule: FeaturedRule,
      /**
       * `recently-added`: `7d`, `30d` or `90d`; `genre`: its name; `collection`: its TMDB id; `filter`:
       * `year < 1930`, `rating >= 4`, joined by `and`.
       */
      value: z.string().trim().min(1).max(200),
    }),
  ])
  .openapi('FeaturedSource')

export const FeaturedOverride = z
  .object({
    itemId: z.number().int().positive(),
    /** An image address in place of the title's backdrop on the hero. */
    artwork: z.string().max(2000).nullable(),
    /** A line in place of the synopsis on the hero. */
    tagline: z.string().max(120).nullable(),
  })
  .openapi('FeaturedOverride')

export const FeaturedLayout = z.enum(['hero', 'row', 'spotlight']).openapi('FeaturedLayout')

const SectionFields = {
  title: z.string().trim().min(1).max(60),
  /** The lighter suffix after the title: "by Ines". */
  tagline: z.string().trim().max(60).nullable(),
  layout: FeaturedLayout,
  source: FeaturedSource,
  overrides: z.array(FeaturedOverride).max(100),
  audience: Audience,
  schedule: Schedule,
}

export const FeaturedSection = z
  .object({
    id: z.string(),
    ...SectionFields,
    /** Home's order, from the top. */
    order: z.number().int(),
  })
  .openapi('FeaturedSection')

export const FeaturedSectionInput = z.object(SectionFields).openapi('FeaturedSectionInput')

/** A featured section in the admin's list: what its source picks right now. */
export const SectionSummary = FeaturedSection.extend({
  status: CurationStatus.exclude(['draft']),
  itemCount: z.number().int(),
  /** The first few titles, for the list's art strip. */
  sample: z.array(
    z.object({ id: z.number().int(), title: z.string(), poster: z.string().nullable() }),
  ),
}).openapi('SectionSummary')

/** A title in a home section: the client's title, with the section's tagline and artwork. */
export const HomeItem = ClientItem.extend({
  /** The section's line for it, in place of the synopsis on a hero. */
  tagline: z.string().nullable(),
}).openapi('HomeItem')

/**
 * A row of the home screen. Featured sections carry the owner's title; built-in rows (`continue`,
 * `recent`) have none, and each app names them from its own catalog; a genre row (`genre:{id}`)
 * carries TMDB's genre name.
 */
export const HomeSection = z
  .object({
    id: z.string(),
    title: z.string().nullable(),
    /** A curated-by suffix ("by Ines"). */
    suffix: z.string().nullable(),
    layout: z.enum(['hero', 'row', 'spotlight', 'continue']),
    items: z.array(HomeItem),
  })
  .openapi('HomeSection')

export const RuleOptions = z
  .object({
    /** The library's genres, in the metadata language. */
    genres: z.array(z.string()),
    /** Collections with a title here. */
    collections: z.array(z.object({ id: z.number().int(), name: z.string() })),
  })
  .openapi('RuleOptions')

/**
 * The live preview: the saved curation with one draft in it, as one person would get it on one
 * kind of app. The draft shows as live, whatever its schedule. An announcement's preview shows it
 * alone; a section's shows no announcements. Nothing is saved.
 */
export const CurationPreviewInput = z
  .object({
    client: ClientType,
    userId: z.string().max(64),
    draft: z.discriminatedUnion('kind', [
      z.object({
        kind: z.literal('announcement'),
        /** The announcement being edited; absent for a new one. */
        id: z.string().optional(),
        announcement: AnnouncementInput.extend({ title: z.string().max(80) }),
      }),
      z.object({
        kind: z.literal('section'),
        id: z.string().optional(),
        section: FeaturedSectionInput.extend({ title: z.string().max(60) }),
      }),
    ]),
  })
  .openapi('CurationPreviewInput')

export const CurationPreview = z
  .object({
    sections: z.array(HomeSection),
    announcements: z.array(ClientAnnouncement),
    /** Whether the person is in the draft's audience on that kind of app. */
    reaches: z.boolean(),
  })
  .openapi('CurationPreview')

/**
 * Curation's topics (checkpoint 8c):
 * - `announcements.updated` and `home.updated`: personal, sent to each person only when what they'd
 *   get changed (a save, a schedule's start or end);
 * - `curation.updated`: the admin's lists changed. Staff only.
 */
export const CURATION_TOPICS = {
  announcements: 'announcements.updated',
  home: 'home.updated',
  curation: 'curation.updated',
} as const

// ---------------------------------------------------------------- routes

const CURATION = `${API_PREFIX}/curation`
const ClientQuery = z.object({
  client: ClientType.optional().openapi({ description: 'The kind of app; `web` when absent' }),
})

export const curation = {
  announcements: createRoute({
    method: 'get',
    path: `${CURATION}/announcements`,
    tags: ['Curation'],
    summary: 'Every announcement, live first, then scheduled, drafts and ended',
    ...access('staff'),
    responses: {
      200: json(z.array(AnnouncementSummary), 'Announcements'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
  addAnnouncement: createRoute({
    method: 'post',
    path: `${CURATION}/announcements`,
    tags: ['Curation'],
    summary: 'Publish, schedule or save a draft of an announcement',
    ...access('staff'),
    request: { ...body(AnnouncementInput) },
    responses: {
      201: json(Announcement, 'Saved'),
      ...errors('invalid', 'unauthorized', 'forbidden'),
    },
  }),
  announcement: createRoute({
    method: 'get',
    path: `${CURATION}/announcements/{id}`,
    tags: ['Curation'],
    summary: 'An announcement',
    ...access('staff'),
    request: { params: IdParam },
    responses: {
      200: json(Announcement, 'The announcement'),
      ...errors('unauthorized', 'forbidden', 'not-found'),
    },
  }),
  saveAnnouncement: createRoute({
    method: 'put',
    path: `${CURATION}/announcements/{id}`,
    tags: ['Curation'],
    summary: 'Change an announcement',
    ...access('staff'),
    request: { params: IdParam, ...body(AnnouncementInput) },
    responses: {
      200: json(Announcement, 'Saved'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'not-found'),
    },
  }),
  endAnnouncement: createRoute({
    method: 'post',
    path: `${CURATION}/announcements/{id}/end`,
    tags: ['Curation'],
    summary: 'End it now: off every screen, kept with its reach as ended',
    ...access('staff'),
    request: { params: IdParam },
    responses: { ...noContent, ...errors('unauthorized', 'forbidden', 'not-found') },
  }),
  removeAnnouncement: createRoute({
    method: 'delete',
    path: `${CURATION}/announcements/{id}`,
    tags: ['Curation'],
    summary: 'Delete an announcement and the record of who saw it',
    ...access('staff'),
    request: { params: IdParam },
    responses: { ...noContent, ...errors('unauthorized', 'forbidden', 'not-found') },
  }),

  sections: createRoute({
    method: 'get',
    path: `${CURATION}/sections`,
    tags: ['Curation'],
    summary: 'The featured sections in home-screen order, with what each picks now',
    ...access('staff'),
    responses: {
      200: json(z.array(SectionSummary), 'Sections'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
  addSection: createRoute({
    method: 'post',
    path: `${CURATION}/sections`,
    tags: ['Curation'],
    summary: 'Add a featured section, at the end of the order',
    ...access('staff'),
    request: { ...body(FeaturedSectionInput) },
    responses: {
      201: json(FeaturedSection, 'Added'),
      ...errors('invalid', 'unauthorized', 'forbidden'),
    },
  }),
  orderSections: createRoute({
    method: 'put',
    path: `${CURATION}/sections/order`,
    tags: ['Curation'],
    summary: 'Put the sections in this order',
    description: 'Sections left out keep their place after the ones named.',
    ...access('staff'),
    request: { ...body(z.object({ ids: z.array(z.string().max(64)).max(500) })) },
    responses: { ...noContent, ...errors('invalid', 'unauthorized', 'forbidden') },
  }),
  resolve: createRoute({
    method: 'post',
    path: `${CURATION}/sections/resolve`,
    tags: ['Curation'],
    summary: 'The titles a source picks right now',
    description: 'For the composer: titles with a file, in the section’s order, at most 100.',
    ...access('staff'),
    request: { ...body(z.object({ source: FeaturedSource })) },
    responses: {
      200: json(z.object({ items: z.array(HomeItem), total: z.number().int() }), 'What it picks'),
      ...errors('invalid', 'unauthorized', 'forbidden'),
    },
  }),
  section: createRoute({
    method: 'get',
    path: `${CURATION}/sections/{id}`,
    tags: ['Curation'],
    summary: 'A featured section',
    ...access('staff'),
    request: { params: IdParam },
    responses: {
      200: json(FeaturedSection, 'The section'),
      ...errors('unauthorized', 'forbidden', 'not-found'),
    },
  }),
  saveSection: createRoute({
    method: 'put',
    path: `${CURATION}/sections/{id}`,
    tags: ['Curation'],
    summary: 'Change a featured section',
    ...access('staff'),
    request: { params: IdParam, ...body(FeaturedSectionInput) },
    responses: {
      200: json(FeaturedSection, 'Saved'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'not-found'),
    },
  }),
  removeSection: createRoute({
    method: 'delete',
    path: `${CURATION}/sections/{id}`,
    tags: ['Curation'],
    summary: 'Delete a featured section; its titles stay in the library',
    ...access('staff'),
    request: { params: IdParam },
    responses: { ...noContent, ...errors('unauthorized', 'forbidden', 'not-found') },
  }),

  ruleOptions: createRoute({
    method: 'get',
    path: `${CURATION}/rule-options`,
    tags: ['Curation'],
    summary: 'What a rule can pick from: the library’s genres and collections',
    ...access('staff'),
    responses: { 200: json(RuleOptions, 'Options'), ...errors('unauthorized', 'forbidden') },
  }),
  preview: createRoute({
    method: 'post',
    path: `${CURATION}/preview`,
    tags: ['Curation'],
    summary: 'A home screen with a draft in it, as one person would get it',
    description: 'Nothing is saved.',
    ...access('staff'),
    request: { ...body(CurationPreviewInput) },
    responses: {
      200: json(CurationPreview, 'The preview'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'not-found'),
    },
  }),
}

export const clientHome = {
  sections: createRoute({
    method: 'get',
    path: `${API_PREFIX}/home`,
    tags: ['Home'],
    summary: 'Your home screen on this kind of app',
    description:
      'The live featured sections in your audience, with Continue watching right after the hero, then Recently added and the genre rows; then your own order and hidden rows (`/me/home`). Only titles with a file; a section that picks nothing is left out.',
    ...access('user'),
    request: { query: ClientQuery },
    responses: { 200: json(z.array(HomeSection), 'Sections'), ...errors('unauthorized') },
  }),
}

export const announcements = {
  active: createRoute({
    method: 'get',
    path: `${API_PREFIX}/announcements`,
    tags: ['Home'],
    summary: 'The live announcements for you on this kind of app',
    ...access('user'),
    request: { query: ClientQuery },
    responses: {
      200: json(z.array(ClientAnnouncement), 'Announcements, newest first'),
      ...errors('unauthorized'),
    },
  }),
  seen: createRoute({
    method: 'post',
    path: `${API_PREFIX}/announcements/{id}/seen`,
    tags: ['Home'],
    summary: 'Dismiss or acknowledge an announcement',
    description: 'Once per person; a second time changes nothing.',
    ...access('user'),
    request: { params: IdParam },
    responses: { ...noContent, ...errors('unauthorized', 'not-found') },
  }),
}

export type Audience = z.infer<typeof Audience>
export type Placement = z.infer<typeof Placement>
export type Severity = z.infer<typeof Severity>
export type CurationStatus = z.infer<typeof CurationStatus>
export type Schedule = z.infer<typeof Schedule>
export type Announcement = z.infer<typeof Announcement>
export type AnnouncementInput = z.infer<typeof AnnouncementInput>
export type AnnouncementSummary = z.infer<typeof AnnouncementSummary>
export type ClientAnnouncement = z.infer<typeof ClientAnnouncement>
export type FeaturedRule = z.infer<typeof FeaturedRule>
export type FeaturedLayout = z.infer<typeof FeaturedLayout>
export type FeaturedSource = z.infer<typeof FeaturedSource>
export type FeaturedOverride = z.infer<typeof FeaturedOverride>
export type FeaturedSection = z.infer<typeof FeaturedSection>
export type FeaturedSectionInput = z.infer<typeof FeaturedSectionInput>
export type SectionSummary = z.infer<typeof SectionSummary>
export type HomeItem = z.infer<typeof HomeItem>
export type HomeSection = z.infer<typeof HomeSection>
export type RuleOptions = z.infer<typeof RuleOptions>
export type CurationPreviewInput = z.infer<typeof CurationPreviewInput>
export type CurationPreview = z.infer<typeof CurationPreview>

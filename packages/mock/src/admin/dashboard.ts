// SPDX-License-Identifier: AGPL-3.0-only
// The admin's dashboard routes (one-client-platform-d.md › D2), answered from the mock's api: the
// layouts and the role defaults (packages/personalization's layouts.ts, with its refusals and
// words), and what the dashboard's widgets read: the speeds, the people, the VPN's line, Now
// playing with its history and Stop, the tags, the movies' root folders and the quality profiles.
// `preferences.get` is the transport's own answer, which wins.
//
// The mock's own writes raise their topics (`layout.updated`, `sessions.updated`) through the
// transport's relay, so these answers raise none of their own. The server also tells the person
// whose stream was stopped (`playback.stopped`, to them alone); the kit's `emit` can't address
// one person, and the mock's seeded sessions have no player to hear it, so that one isn't raised.
import type { routes } from '@highsea-tv/api-contract'
import { createT, defineMessages } from '@highsea-tv/i18n'
import { widgetDefinition } from '@highsea-tv/personalization/widgets'
import { seedProfiles } from '@highsea-tv/quality'
import type { Output } from '@highsea-tv/sdk'
import { EPOCH } from '../clock.ts'
import type { PlayingItem, StreamSession, WatchRecord } from '../sessions.ts'
import { allowed, normalize, type WidgetPlacement, type WidgetRole } from '../widgets.ts'
import { type AdminKit, type Answers, type Ctx, refuse } from './kit.ts'

type Routes = typeof routes
type Layout = Output<Routes['dashboard']['layout']>
type NowPlaying = Output<Routes['sessions']['list']>
type Title = NowPlaying['sessions'][number]['item']

export const dashboardMessages = defineMessages({
  'dashboard.duplicate': 'Each widget can be on the dashboard once.',
  'dashboard.duplicateId': 'Two widgets have the same id.',
  'dashboard.settings': 'A widget’s settings aren’t valid.',
  'dashboard.notAllowed': 'Your role can’t add some of those widgets.',
  'sessions.ended': 'That stream has already ended.',
  'sessions.unknown': 'Unknown',
})

const t = createT(dashboardMessages)

const _DAY = 86_400_000
const SEEDED = new Set(seedProfiles().map((p) => p.id))
const SECOND = 1000
/** The mock samples the rates every 10 simulated seconds; the server a second at a time. */
const SAMPLE_SECONDS = 10

/** The server's check of what someone sends (layouts.ts's `checked`), normalized to its ranges. */
function checked(widgets: WidgetPlacement[]): WidgetPlacement[] {
  const kinds = new Set<string>()
  const ids = new Set<string>()
  for (const w of widgets) {
    if (kinds.has(w.kind))
      throw refuse('invalid', t('dashboard.duplicate'), { reason: 'duplicate', kind: w.kind })
    if (ids.has(w.id))
      throw refuse('invalid', t('dashboard.duplicateId'), { reason: 'duplicate-id' })
    kinds.add(w.kind)
    ids.add(w.id)
    const settings = widgetDefinition(w.kind).settings.safeParse(w.settings ?? {})
    if (!settings.success)
      throw refuse('invalid', t('dashboard.settings'), {
        reason: 'settings',
        kind: w.kind,
        issues: settings.error.issues,
      })
  }
  return widgets.map(normalize)
}

/** The caller's role; the transport has already turned a user away from these staff routes. */
const roleOf = (ctx: Ctx): WidgetRole =>
  ctx.srv.state.users.find((u) => u.id === ctx.userId)?.role === 'owner' ? 'owner' : 'admin'

export function dashboardAnswers({ wall, wallMs, userOf }: AdminKit): Answers {
  // when each layout was saved through the transport, by server and scope (`updatedAt`, in ms):
  // the mock's own api doesn't keep it
  const saved = new Map<string, number>()
  const key = (ctx: Ctx, scope: string) => `${ctx.srv.kind}:${scope}`

  const roleLayout = (ctx: Ctx, role: WidgetRole): Layout => ({
    scope: { kind: 'role', role },
    widgets: ctx.api.dashboard.roleDefault(role),
    updatedAt: saved.get(key(ctx, `role:${role}`)) ?? null,
    inherited: false,
  })

  const layout = (ctx: Ctx): Layout => {
    const own = ctx.api.dashboard.layout()
    if (own.inherited) return { ...roleLayout(ctx, roleOf(ctx)), inherited: true }
    return {
      scope: { kind: 'user', userId: ctx.userId },
      widgets: own.widgets,
      // a layout saved before this transport started has no time: the mock's evening stands in
      updatedAt: saved.get(key(ctx, `user:${ctx.userId}`)) ?? Date.parse(wallMs(EPOCH)),
      inherited: false,
    }
  }

  /**
   * What a session plays, as the contract's film title. Episodes and songs (drafted kinds the
   * server doesn't stream yet) carry their show or artist in the title, and no TMDB id to link.
   */
  const titleOf = (ctx: Ctx, item: PlayingItem): Title => {
    const film = ctx.srv.state.items.find((m) => m.id === item.id)
    const title =
      item.kind === 'episode'
        ? `${item.show.title} · ${item.code}`
        : item.kind === 'song'
          ? `${item.artist} · ${item.title}`
          : item.title === 'Unknown'
            ? t('sessions.unknown')
            : item.title
    return {
      tmdbId: item.kind === 'movie' && film ? film.tmdbId : null,
      title,
      year: item.year,
      poster: item.poster || null,
    }
  }

  /** The version a record played: the mock's history doesn't keep it, so the item's first. */
  const versionOf = (ctx: Ctx, item: PlayingItem) =>
    ctx.srv.state.items.find((m) => m.id === item.id)?.versions[0]?.label ??
    (item.kind === 'song' ? 'FLAC · 16-bit · 44.1 kHz' : '1080p · H.264')

  type Session = StreamSession & { user: { id: string; displayName: string }; item: PlayingItem }
  type Watch = WatchRecord & { user: { id: string; displayName: string }; item: PlayingItem }

  const sessionOf = (ctx: Ctx, s: Session): NowPlaying['sessions'][number] => ({
    id: s.id,
    user: s.user,
    deviceName: s.deviceName,
    client: s.client,
    item: titleOf(ctx, s.item),
    version: s.version,
    kind: s.kind,
    state: s.state,
    position: s.position,
    runtime: s.runtime,
    method: s.method,
    reasons: s.reasons,
    sent: s.sent,
    mbps: s.mbps,
    network: s.network,
    address: s.address,
    hardware: s.method === 'transcode' ? s.hardware : null,
    speed: s.method === 'transcode' ? s.speed : null,
    startedAt: wallMs(s.startedAt),
    stopped: s.stopped && {
      by: s.stopped.by,
      message: s.stopped.message || null,
      at: wallMs(s.stopped.at),
    },
  })

  const nowPlayingOf = (ctx: Ctx, n: ReturnType<Ctx['api']['sessions']['list']>): NowPlaying => ({
    sessions: n.sessions.map((s) => sessionOf(ctx, s)),
    totalMbps: n.totalMbps,
    remoteMbps: n.remoteMbps,
    transcodes: n.transcodes,
  })

  const watchOf = (ctx: Ctx, w: Watch): Output<Routes['sessions']['history']>[number] => ({
    id: w.id,
    user: w.user,
    deviceName: w.deviceName,
    client: w.client,
    item: titleOf(ctx, w.item),
    version: versionOf(ctx, w.item),
    method: w.method,
    network: w.network,
    startedAt: wall(w.startedAt),
    // the mock keeps how long was watched, not when it ended
    endedAt: wallMs(Date.parse(w.startedAt) + w.watched * SECOND),
    watched: w.watched,
    finished: w.finished,
  })

  return {
    dashboard: {
      layout: (_, ctx) => layout(ctx),
      saveLayout: ({ body }, ctx) => {
        const role = roleOf(ctx)
        const refused = body.widgets.filter((w) => !allowed(w.kind, role))
        if (refused.length)
          throw refuse('forbidden', t('dashboard.notAllowed'), {
            reason: 'widget-not-allowed',
            kinds: refused.map((w) => w.kind),
          })
        ctx.api.dashboard.saveLayout(checked(body.widgets))
        saved.set(key(ctx, `user:${ctx.userId}`), Date.now())
        return layout(ctx)
      },
      resetLayout: (_, ctx) => {
        ctx.api.dashboard.resetLayout()
        saved.delete(key(ctx, `user:${ctx.userId}`))
        return layout(ctx)
      },
      roleDefault: ({ params }, ctx) => roleLayout(ctx, params.role),
      saveRoleDefault: ({ params, body }, ctx) => {
        const { role } = params
        const kept = body.widgets.filter((w) => allowed(w.kind, role))
        ctx.api.dashboard.saveRoleDefault(role, checked(kept))
        saved.set(key(ctx, `role:${role}`), Date.now())
        return {
          ...roleLayout(ctx, role),
          dropped: body.widgets.filter((w) => !allowed(w.kind, role)).map((w) => w.kind),
        }
      },
    },

    system: {
      // the server keeps a sample a second for ten minutes; the mock one every ten simulated
      // seconds, so each of its samples stands for the ten seconds up to it
      speeds: (_, ctx) =>
        ctx.api.system.speeds().flatMap((s) =>
          Array.from({ length: SAMPLE_SECONDS }, (_, i) => ({
            at: wallMs(s.t - (SAMPLE_SECONDS - 1 - i) * SECOND),
            down: s.down,
            up: s.up,
          })),
        ),
    },

    users: {
      list: (_, ctx) => ctx.api.users.list().map(userOf),
    },

    vpn: {
      status: (_, ctx) => {
        const s = ctx.api.vpn.status()
        return { ...s, checkedAt: s.checkedAt && wall(s.checkedAt) }
      },
    },

    sessions: {
      list: (_, ctx) => nowPlayingOf(ctx, ctx.api.sessions.list()),
      history: ({ query }, ctx) =>
        ctx.api.sessions.history({ userId: query.userId }).map((w) => watchOf(ctx, w)),
      stop: ({ params, body }, ctx) => {
        if (!ctx.srv.state.sessions.live.some((s) => s.id === params.id && !s.stopped))
          throw refuse('not-found', t('sessions.ended'))
        return nowPlayingOf(ctx, ctx.api.sessions.stop(params.id, body.message))
      },
    },

    tags: {
      list: (_, ctx) => ctx.api.tags.list(),
    },

    rootFolders: {
      // the movies' folders, as the server lists them; the mock's seeded filesystem has every
      // folder under /data on one disk, `data`, and the rest unreadable
      list: (_, ctx) =>
        ctx.api.rootFolders.list('movies').map((f) => ({
          id: f.id,
          path: f.path,
          free: f.free,
          total: f.total,
          device: f.accessible && f.path.startsWith('/data/') ? 'data' : null,
          accessible: f.accessible,
          movies: f.titles,
          languageProfileId: f.languageProfileId,
          waiting: f.waiting,
        })),
    },

    quality: {
      // the seeded ones are built in, as the server marks the profiles it starts with
      profiles: (_, ctx) =>
        ctx.api.movies.qualityProfiles().map((p) => ({ ...p, builtIn: SEEDED.has(p.id) })),
    },
  }
}

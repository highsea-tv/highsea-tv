// SPDX-License-Identifier: AGPL-3.0-only
// Settings › General, Appearance, Playback and Download client through the mock's transport
// (one-client-platform-d.md › D3), from the mock's own api in the contract's shapes: Region,
// Updates, Diagnostics and /metrics; TMDB's key and the indexer catalog; the playback settings and
// the hardware's status, its checks and the cache; the appearance's saves, themes and the built-in
// sound pack; and the download client, whose rates are Downloads' limits. The mock keeps no mark
// (`appearance.get` gives none), so uploading or removing one answers 501, as do the owner's own
// download categories, which the mock doesn't keep either (work.ts's `categoriesOf`).
import type { PathStatus, PlaybackSettings, PlaybackStatus } from '@highsea-tv/api-contract'
import { createT, defineMessages } from '@highsea-tv/i18n'
import { defaultSoundPack } from '@highsea-tv/tokens'
import type { PlaybackStatus as MockStatus } from '../playback.ts'
import type { DownloadClientSettings as MockClient } from '../settings.ts'
import type { AdminKit, Answers, Ctx } from './kit.ts'
import { refuse } from './kit.ts'

const t = createT(
  defineMessages({
    'general.checking': 'A check is already running on this path.',
    'general.packUnknown': 'That sound pack isn’t on this server.',
  }),
)

/** What the contract's download client has that the mock's doesn't, as a new server has them. */
const CLIENT_DEFAULTS = {
  utp: true,
  seedRatio: 2,
  seedMinutes: null,
  watchFolder: null,
  watchCategory: 'manual',
  blocklistUrl: '',
}

export function settingsGeneralAnswers({ wallMs, appearanceOf }: AdminKit): Answers {
  /** The hardware's status as the contract gives it: checks' times on the wall clock. */
  const statusOf = (s: MockStatus): PlaybackStatus => ({
    paths: s.paths.map(
      (p): PathStatus => ({
        id: p.id,
        device: p.device,
        name: p.name,
        check: p.check && {
          result: p.check.result,
          fps: p.check.fps ?? null,
          detail: p.check.detail,
          at: wallMs(p.check.at),
        },
        unavailable: p.unavailable,
        checking: p.checking,
      }),
    ),
    inUse: s.inUse,
    cache: { ...s.cache },
  })

  const clientOf = (ctx: Ctx) => {
    const saved = ctx.api.settings.get('downloadClient') as MockClient &
      Partial<typeof CLIENT_DEFAULTS>
    const limits = ctx.api.downloads.limits()
    return {
      ...CLIENT_DEFAULTS,
      ...saved,
      downloadRate: limits.downRateLimit,
      uploadRate: limits.upRateLimit,
    }
  }

  return {
    settings: {
      general: (_, ctx) => ctx.api.settings.get('general'),
      saveGeneral: ({ body }, ctx) => ctx.api.settings.save('general', body),
      metrics: (_, ctx) => ctx.api.settings.get('metrics'),
      saveMetrics: ({ body }, ctx) => ctx.api.settings.save('metrics', body),
      metadata: (_, ctx) => ctx.api.settings.metadata(),
      // the fields left out keep what's saved (MetadataInput's are each optional)
      saveMetadata: ({ body }, ctx) => {
        const now = ctx.api.settings.metadata()
        return ctx.api.settings.saveMetadata({
          language: body.language ?? now.language,
          region: body.region ?? now.region,
          ...(body.key === undefined ? {} : { key: body.key }),
        })
      },
      removeMetadataKey: (_, ctx) => {
        ctx.api.settings.removeMetadataKey()
        return ctx.api.settings.metadata()
      },
      playback: (_, ctx) => ctx.api.settings.get('playback') as PlaybackSettings,
      savePlayback: ({ body }, ctx) => ctx.api.settings.save('playback', body) as PlaybackSettings,
      downloadClient: (_, ctx) => clientOf(ctx),
      saveDownloadClient: ({ body }, ctx) => {
        const { downloadRate, uploadRate, ...rest } = body
        ctx.api.settings.save('downloadClient', rest as MockClient)
        ctx.api.downloads.setLimits({ downRateLimit: downloadRate, upRateLimit: uploadRate })
        return clientOf(ctx)
      },
    },

    catalog: {
      settings: (_, ctx) => ctx.api.catalog.settings(),
      updateSettings: ({ body }, ctx) => ctx.api.catalog.updateSettings(body),
    },

    playback: {
      status: (_, ctx) => statusOf(ctx.api.transcoding.status()),
      check: ({ params }, ctx) => {
        const now = statusOf(ctx.api.transcoding.status())
        const path = now.paths.find((p) => p.id === params.path)
        if (path?.checking) throw refuse('conflict', t('general.checking'))
        if (path?.unavailable) throw refuse('conflict', path.unavailable)
        return statusOf(ctx.api.transcoding.check(params.path))
      },
      clearCache: (_, ctx) => statusOf(ctx.api.transcoding.clearCache()),
    },

    appearance: {
      // the transport's `get` gives the toolbar's theme and sounds; a save reads back through it
      save: ({ body }, ctx) => {
        ctx.api.appearance.save(body)
        return appearanceOf() as never
      },
      saveTheme: ({ params, body }, ctx) =>
        ctx.api.appearance.saveTheme({ ...body, id: params.id }),
      deleteTheme: ({ params }, ctx) => {
        ctx.api.appearance.deleteTheme(params.id)
        return undefined
      },
      soundPack: ({ params }) => {
        if (params.id !== defaultSoundPack.id) throw refuse('not-found', t('general.packUnknown'))
        return defaultSoundPack as never
      },
    },
  }
}

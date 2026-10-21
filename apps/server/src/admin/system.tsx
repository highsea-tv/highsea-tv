'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// System (A16, system.md) arrives with checkpoint 8. Checkpoint 4 needs one part of it now: About,
// where TMDB's terms ask for its logo and notice (checkpoint 4 plan › Attribution). So the page is
// its header, About from the public info (the server, its version and the providers it credits),
// and a line saying the rest comes later. Checkpoint 5 adds the indexer catalog's version to About,
// with Check now (ADR 0034; system.md lists the catalog under Updates, which comes with the rest).
// Checkpoint 6 adds the prototype's Health list above About, where the torrent client's and
// imports' problems show beside the indexers' and the network's; the prototype's Check now waits
// for Tasks, which runs the check, and its rate graph is the dashboard's Network widget.
import {
  DOWNLOAD_TOPICS,
  type HealthCheck,
  INDEXER_TOPICS,
  TMDB_ATTRIBUTION,
} from '@highsea/api-contract'
import { duration } from '@highsea/core/format'
import { useLocale, useT } from '@highsea/i18n/react'
import { useAction, useQuery } from '@highsea/sdk/react'
import {
  Badge,
  type BadgeTone,
  Button,
  EmptyState,
  Icon,
  type IconName,
  Skeleton,
  toast,
} from '@highsea/ui-web'
import { TmdbNotice } from './attribution.tsx'
import { Loadable } from './loadable.tsx'
import { Group } from './settings.tsx'
import { AdminPage } from './shell.tsx'
import { system as messages } from './system-messages.ts'
import { useNow, useRelative } from './time.ts'

export function System() {
  const t = useT(messages)
  const info = useQuery('public-info', (c) => c.system.publicInfo(), ['server.updated'])
  return (
    <AdminPage title={t('title')} description={t('description')}>
      <div className="grid max-w-200 gap-6">
        <Group title={t('health.title')} description={t('health.description')}>
          <Health />
        </Group>
        <Group title={t('about.title')} description={t('about.description')}>
          <Loadable query={info} what={t('what')}>
            {(i) => (
              <dl className="grid gap-3 text-ui medium:grid-cols-[10rem_minmax(0,1fr)]">
                <dt className="text-caption text-text-3 medium:pt-0.5">{t('about.name')}</dt>
                <dd className="text-text">{i.name}</dd>
                <dt className="text-caption text-text-3 medium:pt-0.5">{t('about.version')}</dt>
                <dd className="font-mono text-figure text-text">{i.version}</dd>
                <dt className="text-caption text-text-3 medium:pt-0.5">{t('about.catalog')}</dt>
                <dd>
                  <Catalog />
                </dd>
                {i.attributions.length > 0 && (
                  <>
                    <dt className="text-caption text-text-3 medium:pt-0.5">{t('about.data')}</dt>
                    <dd className="grid gap-3">
                      {i.attributions.map((a) =>
                        a.name === TMDB_ATTRIBUTION.name ? (
                          <TmdbNotice key={a.name} />
                        ) : (
                          <p key={a.name} className="text-caption text-text-3">
                            <a href={a.url} className="text-text-2 hover:underline">
                              {a.name}
                            </a>{' '}
                            {a.notice}
                          </p>
                        ),
                      )}
                    </dd>
                  </>
                )}
              </dl>
            )}
          </Loadable>
        </Group>
        <p className="text-caption text-text-3">{t('later')}</p>
      </div>
    </AdminPage>
  )
}

/** The indexer catalog's version and last check, and Check now. */
function Catalog() {
  const t = useT(messages)
  const locale = useLocale()
  const now = useNow()
  const status = useQuery('catalog-status', (c) => c.catalog.status(), [INDEXER_TOPICS.catalog])
  const check = useAction((c) => c.catalog.check())
  if (status.status === 'loading') return <Skeleton className="h-5 w-40" />
  if (status.status === 'error')
    return <p className="text-caption text-text-3">{status.error.message}</p>
  const s = status.data
  const ago = s.lastCheck ? duration((now - Date.parse(s.lastCheck.at)) / 1000, locale) : ''
  const onCheck = () => {
    const before = s.version
    check.run().then(
      (after) => {
        if (after.lastCheck && !after.lastCheck.ok)
          toast.error(t('catalog.failed'), { description: after.lastCheck.message ?? undefined })
        else if (after.version !== before)
          toast.success(t('catalog.updated', { version: after.version ?? '' }))
        else if (after.available)
          toast({
            title: t('catalog.available', { version: after.available.version }),
            description: t('catalog.availableBody'),
          })
        else toast({ title: t('catalog.current') })
        status.refetch()
      },
      (e: Error) => toast.error(t('catalog.failed'), { description: e.message }),
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="font-mono text-figure text-text">{s.version ?? t('catalog.none')}</span>
      {s.lastCheck && (
        <span className="text-caption text-text-3">
          {s.lastCheck.ok
            ? t('catalog.checked', { ago })
            : t('catalog.checkFailed', {
                ago,
                message: s.lastCheck.message ?? '',
              })}
        </span>
      )}
      <Button size="sm" icon="refresh" loading={check.pending} onClick={onCheck}>
        {t('catalog.check')}
      </Button>
    </div>
  )
}

const levels: Record<HealthCheck['level'], { tone: BadgeTone; icon: IconName }> = {
  ok: { tone: 'success', icon: 'success' },
  notice: { tone: 'info', icon: 'info' },
  warning: { tone: 'warning', icon: 'warning' },
  error: { tone: 'danger', icon: 'error' },
}

/** What changes a check: the server and its settings, an indexer, a download or the VPN. */
const HEALTH_TOPICS = [
  'server.updated',
  'settings.updated',
  INDEXER_TOPICS.health,
  DOWNLOAD_TOPICS.queue,
  DOWNLOAD_TOPICS.vpn,
]

/** The prototype's Health list: each check with its level, where it comes from and since when. */
function Health() {
  const t = useT(messages)
  const { relative } = useRelative()
  const health = useQuery('system:health', (c) => c.system.healthChecks(), HEALTH_TOPICS)
  return (
    <Loadable query={health} what={t('health.what')}>
      {(checks) =>
        checks.length === 0 ? (
          <EmptyState icon="success" title={t('health.none')}>
            {t('health.noneBody')}
          </EmptyState>
        ) : (
          <ul aria-label={t('health.label')} className="grid gap-2">
            {checks.map((c) => {
              const l = levels[c.level]
              return (
                <li key={c.id} className="flex gap-3 rounded-lg border border-line bg-s1 p-4">
                  <Icon name={l.icon} size={18} className="mt-0.5 shrink-0 text-text-2" />
                  <div className="grid gap-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <Badge tone={l.tone}>{t(`health.${c.level}`)}</Badge>
                      <span className="font-semibold text-text text-ui">{c.source}</span>
                      <span className="text-caption text-text-3">
                        {t('health.since', { ago: relative(c.since) })}
                      </span>
                    </p>
                    <p className="text-body text-text-2">{c.message}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        )
      }
    </Loadable>
  )
}

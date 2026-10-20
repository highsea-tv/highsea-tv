'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// System (A16, system.md) arrives with checkpoint 8. Checkpoint 4 needs one part of it now: About,
// where TMDB's terms ask for its logo and notice (checkpoint 4 plan › Attribution). So the page is
// its header, About from the public info (the server, its version and the providers it credits),
// and a line saying the rest comes later. Checkpoint 5 adds the indexer catalog's version to About,
// with Check now (ADR 0034; system.md lists the catalog under Updates, which comes with the rest).
import { INDEXER_TOPICS, TMDB_ATTRIBUTION } from '@highsea/api-contract'
import { duration } from '@highsea/core/format'
import { useLocale, useT } from '@highsea/i18n/react'
import { useAction, useQuery } from '@highsea/sdk/react'
import { Button, Skeleton, toast } from '@highsea/ui-web'
import { TmdbNotice } from './attribution.tsx'
import { Loadable } from './loadable.tsx'
import { Group } from './settings.tsx'
import { AdminPage } from './shell.tsx'
import { system as messages } from './system-messages.ts'
import { useNow } from './time.ts'

export function System() {
  const t = useT(messages)
  const info = useQuery('public-info', (c) => c.system.publicInfo(), ['server.updated'])
  return (
    <AdminPage title={t('title')} description={t('description')}>
      <div className="grid max-w-200 gap-6">
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

'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// System (A16, system.md) arrives with checkpoint 8. Checkpoint 4 needs one part of it now: About,
// where TMDB's terms ask for its logo and notice (checkpoint 4 plan › Attribution). So the page is
// its header, About from the public info (the server, its version and the providers it credits),
// and a line saying the rest comes later.
import { TMDB_ATTRIBUTION } from '@highsea/api-contract'
import { useT } from '@highsea/i18n/react'
import { useQuery } from '@highsea/sdk/react'
import { TmdbNotice } from './attribution.tsx'
import { Loadable } from './loadable.tsx'
import { Group } from './settings.tsx'
import { AdminPage } from './shell.tsx'
import { system as messages } from './system-messages.ts'

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

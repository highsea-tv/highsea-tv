'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// TMDB's logo and notice, as its terms ask (https://www.themoviedb.org/api-terms-of-use § 3): the
// logo, less prominent than highsea's own marks, and the notice in the terms' wording, which is a
// legal text and stays in English (TMDB_ATTRIBUTION). Setup's key step and System › About show it.
// The logo is TMDB's own file, unmodified (https://www.themoviedb.org/about/logos-attribution).
import { TMDB_ATTRIBUTION } from '@highsea-tv/api-contract'
import tmdbLogo from '@highsea-tv/brand/attribution/tmdb.svg'
import { defineMessages } from '@highsea-tv/i18n'
import { useT } from '@highsea-tv/i18n/react'

const messages = defineMessages({ logo: 'TMDB' })

export function TmdbNotice() {
  const t = useT(messages)
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-2 text-caption text-text-3">
      <a
        href={TMDB_ATTRIBUTION.url}
        target="_blank"
        rel="noreferrer"
        className="shrink-0 rounded-sm outline-none focus-visible:ring-focus"
      >
        {/* biome-ignore lint/performance/noImgElement: a small static SVG, which next/image only passes through */}
        <img src={tmdbLogo.src} alt={t('logo')} className="h-3 w-auto" />
      </a>
      <span className="min-w-0 flex-1 basis-48">{TMDB_ATTRIBUTION.notice}</span>
    </p>
  )
}

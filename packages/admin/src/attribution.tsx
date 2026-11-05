'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// TMDB's logo and notice, as its terms ask (https://www.themoviedb.org/api-terms-of-use § 3): the
// logo, less prominent than highsea's own marks, and the notice in the terms' wording, which is a
// legal text and stays in English (TMDB_ATTRIBUTION). System › About shows it, drawn by the
// library's Attribution (one-client-platform-d.md › D1). The logo is TMDB's own file, unmodified
// (https://www.themoviedb.org/about/logos-attribution), at the size its host's bundler gives.
import { TMDB_ATTRIBUTION } from '@highsea-tv/api-contract'
import tmdbLogo from '@highsea-tv/brand/attribution/tmdb.svg'
import { useT } from '@highsea-tv/i18n/react'
import { Attribution } from '@highsea-tv/ui/native'
import { attribution as messages } from './attribution-messages.ts'

// the file's viewBox (273.42 × 35.52), for a bundler that gives only its address
const LOGO = { width: 273.42, height: 35.52 }
// Next gives an object, Vite (the prototype) the address (assets.d.ts)
const LOGO_SRC = typeof tmdbLogo === 'string' ? tmdbLogo : (tmdbLogo as { src: string }).src

export function TmdbNotice() {
  const t = useT(messages)
  return (
    <Attribution
      logo={{ src: LOGO_SRC, alt: t('logo'), ...LOGO }}
      href={TMDB_ATTRIBUTION.url}
      notice={TMDB_ATTRIBUTION.notice}
    />
  )
}

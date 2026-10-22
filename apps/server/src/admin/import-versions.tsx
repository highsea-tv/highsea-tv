'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// A17's version per row (checkpoint 6b, answer 8): each file goes to one of its movie's versions,
// the first without a file by default, as the scan picks; two files for one version are refused
// with the answer's copy, "Pick another version for one of these." Kept apart from import.tsx so
// the screen's other modes don't carry it.
import type { Movie } from '@highsea-tv/api-contract'
import { useT } from '@highsea-tv/i18n/react'
import { Select } from '@highsea-tv/ui-web'
import { manualImport as messages } from './import-messages.ts'

/** The first version without a file, else the first: what the scan picks (ADR 0012). */
export function defaultVersion(movie: Pick<Movie, 'versions'> | undefined): string | null {
  if (!movie) return null
  return (movie.versions.find((v) => v.fileId === null) ?? movie.versions[0])?.id ?? null
}

/** The paths of chosen files that share a movie's version with another chosen file. */
export function clashes(
  rows: { path: string; movieId: number | null; versionId: string | null }[],
): Set<string> {
  const byVersion = new Map<string, string[]>()
  for (const r of rows) {
    if (r.movieId === null || !r.versionId) continue
    const key = `${r.movieId}|${r.versionId}`
    byVersion.set(key, [...(byVersion.get(key) ?? []), r.path])
  }
  return new Set([...byVersion.values()].filter((ps) => ps.length > 1).flat())
}

export function VersionSelect({
  file,
  movie,
  value,
  disabled,
  clash,
  onChange,
}: {
  file: string
  movie: Pick<Movie, 'versions'> | undefined
  value: string | null
  disabled: boolean
  clash: boolean
  onChange: (versionId: string) => void
}) {
  const t = useT(messages)
  if (!movie) return <span className="text-text-3">—</span>
  const id = `version-clash-${file.replace(/\W/g, '-')}`
  return (
    <div className="grid gap-1">
      <Select
        aria-label={t('versionOf', { file })}
        aria-describedby={clash ? id : undefined}
        value={value ?? defaultVersion(movie) ?? ''}
        disabled={disabled || movie.versions.length < 2}
        onValueChange={onChange}
        options={movie.versions.map((v) => ({
          value: v.id,
          label: v.fileId ? t('versionHasFile', { label: v.label }) : v.label,
        }))}
      />
      {clash && (
        <p id={id} className="whitespace-normal text-caption text-badge-danger">
          {t('versionClash')}
        </p>
      )}
    </div>
  )
}

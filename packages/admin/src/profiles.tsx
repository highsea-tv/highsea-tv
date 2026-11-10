'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Profiles and formats and › Quality sizes (settings.md), ported from the prototype's
// reference areas with real data. A format's conditions read as @highsea-tv/quality describes them.
// Since checkpoint 8c, Edit, New profile, New format and Edit sizes open the editors
// (quality-editors.tsx), and a preset someone changed reads as theirs. The catalog's profile
// presets stay inert, with a tooltip: the catalog has none to add yet.
// Drawn with the library's native renderer since D3 (one-client-platform-d.md), on the web through
// react-native-web, with the same parts, words and behaviour as the web renderer's.
import type { ProfileUsage, QualityProfile, QualitySize } from '@highsea-tv/api-contract'
import { bytes } from '@highsea-tv/core/format'
import { useLocale, useT } from '@highsea-tv/i18n/react'
import { describeFormat } from '@highsea-tv/quality/browser'
import { useQuery } from '@highsea-tv/sdk/react'
import {
  Badge,
  Button,
  SegmentedControl,
  Table,
  TableBody,
  TableCell,
  TableFrame,
  TableHead,
  TableHeader,
  TableRow,
  Text,
  TitleLink,
  Tooltip,
  tokens,
  useRegularWindow,
  visuallyHidden,
} from '@highsea-tv/ui/native'
import { useState } from 'react'
import { View, type ViewStyle } from 'react-native'
import { filmBytes } from './library-figures.ts'
import { Loadable } from './loadable.tsx'
import { profiles as messages, sizes as sizeMessages } from './profiles-messages.ts'
import { useServes } from './serves.tsx'
import { AreaPage, Group } from './settings.tsx'
import { Card, Cards, Line, Note } from './settings-card.tsx'

const s = tokens.space
const figure = tokens.adminText.figure

/**
 * Read, never seen (the library's visually hidden style, the web's `sr-only`): the cutoff's badge
 * says which it is only in words.
 */
const READ_ONLY_TEXT = visuallyHidden

/**
 * A preset the catalog doesn't have yet: shown but inert, its wrapper taking focus so the tooltip
 * is reachable by keyboard (WAI-ARIA APG, "Focusability of disabled controls"), as Library's
 * Search is while no indexer is on.
 */
function Later({ label, children }: { label: string; children: string }) {
  const t = useT(messages)
  return (
    <View style={{ alignSelf: 'flex-start' }}>
      <Tooltip content={t('later')} focusable>
        <Button size="sm" icon="add" accessibilityLabel={label} disabled>
          {children}
        </Button>
      </Tooltip>
    </View>
  )
}

const presets = [
  { name: 'presets.hd', detail: 'presets.hdDetail' },
  { name: 'presets.uhd', detail: 'presets.uhdDetail' },
  { name: 'presets.remux', detail: 'presets.remuxDetail' },
] as const

export function Profiles() {
  const t = useT(messages)
  const locale = useLocale()
  const medium = useRegularWindow()
  const shows = useServes('shows')
  const profiles = useQuery('settings:profiles', (c) => c.quality.profiles(), ['settings.updated'])
  const formats = useQuery('settings:formats', (c) => c.quality.customFormats(), [
    'settings.updated',
  ])
  return (
    <AreaPage
      id="profiles"
      actions={
        <Button icon="add" href="/settings/profiles/new">
          {t('newProfile')}
        </Button>
      }
    >
      <Group title={t('profiles.title')} description={t('profiles.description')}>
        <Loadable query={profiles} what={t('profiles.what')}>
          {(ps) =>
            ps.length === 0 ? (
              <Note>{t('profiles.none')}</Note>
            ) : shows ? (
              <UsedProfileCards profiles={ps} />
            ) : (
              <ProfileCards profiles={ps} />
            )
          }
        </Loadable>
      </Group>
      <Group title={t('formats.title')} description={t('formats.description')}>
        <Loadable query={formats} what={t('formats.what')}>
          {(fs) =>
            fs.length === 0 ? (
              <Note>{t('formats.none')}</Note>
            ) : (
              <TableFrame>
                <Table label={t('formats.title')}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('formats.format')}</TableHead>
                      <TableHead>{t('formats.matches')}</TableHead>
                      <TableHead>{t('formats.from')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fs.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell>
                          <TitleLink href={`/settings/profiles/formats/${f.id}`}>
                            {f.name}
                          </TitleLink>
                        </TableCell>
                        <TableCell>
                          <Text
                            size={figure.size}
                            leading={figure.leading}
                            mono
                            color="text-2"
                            style={
                              { flexShrink: 1, minWidth: 0, overflowWrap: 'break-word' } as object
                            }
                          >
                            {describeFormat(f, locale).join(' · ')}
                          </Text>
                        </TableCell>
                        <TableCell>
                          {f.source === 'preset' && !f.edited ? (
                            <Badge tone="info">{t('formats.preset')}</Badge>
                          ) : (
                            <Badge tone="neutral">{t('formats.custom')}</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableFrame>
            )
          }
        </Loadable>
        <View style={{ alignSelf: 'flex-start' }}>
          <Button size="sm" variant="secondary" icon="add" href="/settings/profiles/formats/new">
            {t('newFormat')}
          </Button>
        </View>
      </Group>
      <Group title={t('presets.title')} description={t('presets.description')}>
        <View
          role="list"
          style={
            {
              display: 'grid',
              gridTemplateColumns: medium ? 'repeat(3, minmax(0, 1fr))' : 'minmax(0, 1fr)',
              gap: s['2'],
            } as unknown as ViewStyle
          }
        >
          {presets.map((p) => (
            <Card key={p.name} style={{ justifyContent: 'space-between' }}>
              <View style={{ gap: s['1'] }}>
                <Line weight={600}>{t(p.name)}</Line>
                <Note>{t(p.detail)}</Note>
              </View>
              <Later label={t('addLabel', { name: t(p.name) })}>{t('add')}</Later>
            </Card>
          ))}
        </View>
      </Group>
    </AreaPage>
  )
}

/**
 * Each profile's card. With `usage` (when the server serves shows, D3's answer 5), each says how
 * many movies and shows use it, as the prototype's stage 6 drew.
 */
function ProfileCards({
  profiles: ps,
  usage,
}: {
  profiles: QualityProfile[]
  usage?: ProfileUsage[]
}) {
  const t = useT(messages)
  const medium = useRegularWindow()
  return (
    <Cards>
      {ps.map((p) => (
        <Card
          key={p.id}
          gap={s['2']}
          style={medium ? { flexDirection: 'row', alignItems: 'center', gap: s['2'] } : undefined}
        >
          <View style={{ flex: medium ? 1 : undefined, minWidth: 0, gap: s['1'] }}>
            <Line weight={600}>{p.name}</Line>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s['1'] }}>
              {p.items
                .filter((q) => q.allowed)
                .map((q) =>
                  q.name === p.cutoff ? (
                    <View key={q.name}>
                      <View aria-hidden>
                        <Badge tone="accent">{q.name}</Badge>
                      </View>
                      <Text style={READ_ONLY_TEXT}>{t('profiles.cutoff', { name: q.name })}</Text>
                    </View>
                  ) : (
                    <Badge key={q.name} tone="neutral">
                      {q.name}
                    </Badge>
                  ),
                )}
            </View>
            <Note>
              {p.upgradeAllowed
                ? t('profiles.upgrades', { cutoff: p.cutoff })
                : t('profiles.noUpgrades')}{' '}
              · {t('profiles.scores', { count: p.formats.length })}
              {p.waitMinutes > 0 ? ` · ${t('profiles.wait', { minutes: p.waitMinutes })}` : null}
            </Note>
            {usage ? (
              <Note>
                {(() => {
                  const u = usage.find((x) => x.profileId === p.id)
                  return !u || u.movies + u.shows === 0
                    ? t('profiles.unused')
                    : t('profiles.usedBy', { movies: u.movies, shows: u.shows })
                })()}
              </Note>
            ) : null}
          </View>
          <View style={{ alignSelf: medium ? 'center' : 'flex-start' }}>
            <Button
              size="sm"
              icon="edit"
              href={`/settings/profiles/${p.id}`}
              accessibilityLabel={t('editLabel', { name: p.name })}
            >
              {t('edit')}
            </Button>
          </View>
        </Card>
      ))}
    </Cards>
  )
}

/** The cards with each profile's use, read from Shows' drafted route (series-settings.ts). */
function UsedProfileCards({ profiles: ps }: { profiles: QualityProfile[] }) {
  const usage = useQuery('settings:profile-usage', (c) => c.series.profileUsage(), [
    'settings.updated',
    'movies.updated',
    'shows.updated',
  ])
  // the cards draw at once; the use joins them when it answers, as the prototype's did
  return <ProfileCards profiles={ps} usage={usage.data} />
}

// ---------------------------------------------------------------- quality sizes

/** A MiB-per-minute figure as the table shows it: 2.3, 137, 400. */
const perMinute = (n: number, locale: string) =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(n)

/**
 * The size table. When the server serves shows (D3's answer 5), a switch above it chooses movies'
 * table, per minute of the film as Radarr's, or episodes', per minute of the episode as Sonarr's,
 * as the prototype's stage 6 drew; episodes' come from Shows' drafted route (series-settings.ts).
 */
export function QualitySizes() {
  const t = useT(sizeMessages)
  const shows = useServes('shows')
  const [kind, setKind] = useState<SizeKind>('movies')
  return (
    <AreaPage
      id="quality"
      actions={
        <Button icon="edit" href="/settings/quality/sizes">
          {t('edit')}
        </Button>
      }
    >
      {shows ? (
        <View style={{ alignSelf: 'flex-start' }}>
          <SegmentedControl
            aria-label={t('kind')}
            size="sm"
            value={kind}
            onValueChange={(k) => setKind(k as SizeKind)}
            options={[
              { value: 'movies', label: t('kind.movies') },
              { value: 'shows', label: t('kind.shows') },
            ]}
          />
        </View>
      ) : null}
      {shows && kind === 'shows' ? <EpisodeSizes /> : <MovieSizes />}
    </AreaPage>
  )
}

type SizeKind = 'movies' | 'shows'

function MovieSizes() {
  const t = useT(sizeMessages)
  const data = useQuery('settings:quality-sizes', (c) => c.settings.qualitySizes(), [
    'settings.updated',
  ])
  return (
    <Group title={t('title')} description={t('description')}>
      <Loadable query={data} what={t('what')}>
        {(rows) => (rows.length === 0 ? <Note>{t('none')}</Note> : <SizesTable rows={rows} />)}
      </Loadable>
      <Note>{t('note')}</Note>
    </Group>
  )
}

/** Episodes' sizes, a 45-minute episode beside each, as the prototype's. */
function EpisodeSizes() {
  const t = useT(sizeMessages)
  const data = useQuery('settings:episode-sizes', (c) => c.series.qualitySizes(), [
    'settings.updated',
  ])
  return (
    <Group title={t('episodes.title')} description={t('episodes.description')}>
      <Loadable query={data} what={t('what')}>
        {(rows) =>
          rows.length === 0 ? (
            <Note>{t('none')}</Note>
          ) : (
            <SizesTable rows={rows} minutes={EPISODE_MINUTES} />
          )
        }
      </Loadable>
    </Group>
  )
}

/** The episode the table's last column sizes, as the prototype's. */
const EPISODE_MINUTES = 45

/** The table; `minutes` makes its last column an episode of that length rather than a 2-hour film. */
function SizesTable({ rows, minutes }: { rows: QualitySize[]; minutes?: number }) {
  const label = minutes ? 'episodes.title' : 'title'
  const size = (perMinute: number) => bytes(filmBytes(perMinute, minutes))
  const t = useT(sizeMessages)
  const locale = useLocale()
  return (
    <TableFrame>
      <Table label={t(label)}>
        <TableHeader>
          <TableRow>
            <TableHead>{t('quality')}</TableHead>
            <TableHead numeric>{t('min')}</TableHead>
            <TableHead numeric>{t('preferred')}</TableHead>
            <TableHead numeric>{t('max')}</TableHead>
            <TableHead numeric>{minutes ? t('episode', { minutes }) : t('film')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((q) => (
            <TableRow key={q.quality}>
              <TableCell>{q.quality}</TableCell>
              <TableCell numeric>{perMinute(q.min, locale)}</TableCell>
              <TableCell numeric>
                {q.preferred === null ? t('noPreference') : perMinute(q.preferred, locale)}
              </TableCell>
              <TableCell numeric>
                {q.max === null ? t('noLimit') : perMinute(q.max, locale)}
              </TableCell>
              <TableCell numeric>
                {q.max === null
                  ? t('filmFrom', { min: size(q.min) })
                  : t('filmRange', { min: size(q.min), max: size(q.max) })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableFrame>
  )
}

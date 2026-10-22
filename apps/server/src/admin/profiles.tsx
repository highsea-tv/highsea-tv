'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Profiles and formats and › Quality sizes (settings.md), ported from the prototype's
// reference areas with real data. A format's conditions read as @highsea/quality describes them.
// Since checkpoint 8c, Edit, New profile, New format and Edit sizes open the editors
// (quality-editors.tsx), and a preset someone changed reads as theirs. The catalog's profile
// presets stay inert, with a tooltip: the catalog has none to add yet.
import type { QualitySize } from '@highsea/api-contract'
import { bytes } from '@highsea/core/format'
import { useLocale, useT } from '@highsea/i18n/react'
import { describeFormat } from '@highsea/quality/browser'
import { useQuery } from '@highsea/sdk/react'
import {
  Badge,
  Button,
  type ButtonProps,
  cn,
  Table,
  TableBody,
  TableCell,
  TableFrame,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
} from '@highsea/ui-web'
import { filmBytes } from './library-figures.ts'
import { Loadable } from './loadable.tsx'
import { profiles as messages, sizes as sizeMessages } from './profiles-messages.ts'
import { AreaPage, Group } from './settings.tsx'

/** A preset the catalog doesn't have yet: focusable, so its tooltip is reachable. */
function Later({ children, className, ...props }: Omit<ButtonProps, 'onClick' | 'disabled'>) {
  const t = useT(messages)
  return (
    <Tooltip content={t('later')}>
      <Button {...props} aria-disabled className={cn('cursor-not-allowed opacity-60', className)}>
        {children}
      </Button>
    </Tooltip>
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
  const profiles = useQuery('settings:profiles', (c) => c.quality.profiles(), ['settings.updated'])
  const formats = useQuery('settings:formats', (c) => c.quality.customFormats(), [
    'settings.updated',
  ])
  return (
    <AreaPage
      id="profiles"
      actions={
        <Button icon="add" asChild>
          <a href="/settings/profiles/new">{t('newProfile')}</a>
        </Button>
      }
    >
      <Group title={t('profiles.title')} description={t('profiles.description')}>
        <Loadable query={profiles} what={t('profiles.what')}>
          {(ps) =>
            ps.length === 0 ? (
              <p className="text-caption text-text-3">{t('profiles.none')}</p>
            ) : (
              <ul className="grid gap-2">
                {ps.map((p) => (
                  <li
                    key={p.id}
                    className="grid gap-2 rounded-md border border-line bg-s2 p-3 medium:grid-cols-[minmax(0,1fr)_auto] medium:items-center"
                  >
                    <div className="grid gap-1">
                      <p className="font-semibold text-text text-ui">{p.name}</p>
                      <p className="flex flex-wrap gap-1">
                        {p.items
                          .filter((q) => q.allowed)
                          .map((q) => (
                            <Badge key={q.name} tone={q.name === p.cutoff ? 'accent' : 'neutral'}>
                              {q.name === p.cutoff ? (
                                <>
                                  <span aria-hidden>{q.name}</span>
                                  <span className="sr-only">
                                    {t('profiles.cutoff', { name: q.name })}
                                  </span>
                                </>
                              ) : (
                                q.name
                              )}
                            </Badge>
                          ))}
                      </p>
                      <p className="text-caption text-text-3">
                        {p.upgradeAllowed
                          ? t('profiles.upgrades', { cutoff: p.cutoff })
                          : t('profiles.noUpgrades')}{' '}
                        · {t('profiles.scores', { count: p.formats.length })}
                        {p.waitMinutes > 0 && (
                          <> · {t('profiles.wait', { minutes: p.waitMinutes })}</>
                        )}
                      </p>
                    </div>
                    <Button size="sm" icon="edit" asChild>
                      <a
                        href={`/settings/profiles/${p.id}`}
                        aria-label={t('editLabel', { name: p.name })}
                      >
                        {t('edit')}
                      </a>
                    </Button>
                  </li>
                ))}
              </ul>
            )
          }
        </Loadable>
      </Group>
      <Group title={t('formats.title')} description={t('formats.description')}>
        <Loadable query={formats} what={t('formats.what')}>
          {(fs) =>
            fs.length === 0 ? (
              <p className="text-caption text-text-3">{t('formats.none')}</p>
            ) : (
              <TableFrame>
                <Table aria-label={t('formats.title')}>
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
                        <TableCell className="text-text">
                          <a
                            href={`/settings/profiles/formats/${f.id}`}
                            className="rounded-sm outline-none hover:underline focus-visible:ring-focus"
                          >
                            {f.name}
                          </a>
                        </TableCell>
                        <TableCell className="whitespace-normal break-words font-mono text-figure text-text-2">
                          {describeFormat(f, locale).join(' · ')}
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
        <Button size="sm" variant="secondary" icon="add" className="justify-self-start" asChild>
          <a href="/settings/profiles/formats/new">{t('newFormat')}</a>
        </Button>
      </Group>
      <Group title={t('presets.title')} description={t('presets.description')}>
        <ul className="grid gap-2 medium:grid-cols-3">
          {presets.map((p) => (
            <li
              key={p.name}
              className="grid content-between gap-3 rounded-md border border-line bg-s2 p-3"
            >
              <div className="grid gap-1">
                <p className="font-semibold text-text text-ui">{t(p.name)}</p>
                <p className="text-caption text-text-3">{t(p.detail)}</p>
              </div>
              <Later
                size="sm"
                icon="add"
                className="justify-self-start"
                aria-label={t('addLabel', { name: t(p.name) })}
              >
                {t('add')}
              </Later>
            </li>
          ))}
        </ul>
      </Group>
    </AreaPage>
  )
}

// ---------------------------------------------------------------- quality sizes

/** A MiB-per-minute figure as the table shows it: 2.3, 137, 400. */
const perMinute = (n: number, locale: string) =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(n)

export function QualitySizes() {
  const t = useT(sizeMessages)
  const data = useQuery('settings:quality-sizes', (c) => c.settings.qualitySizes(), [
    'settings.updated',
  ])
  return (
    <AreaPage
      id="quality"
      actions={
        <Button icon="edit" asChild>
          <a href="/settings/quality/sizes">{t('edit')}</a>
        </Button>
      }
    >
      <Group title={t('title')} description={t('description')}>
        <Loadable query={data} what={t('what')}>
          {(rows) =>
            rows.length === 0 ? (
              <p className="text-caption text-text-3">{t('none')}</p>
            ) : (
              <SizesTable rows={rows} />
            )
          }
        </Loadable>
        <p className="text-caption text-text-3">{t('note')}</p>
      </Group>
    </AreaPage>
  )
}

function SizesTable({ rows }: { rows: QualitySize[] }) {
  const t = useT(sizeMessages)
  const locale = useLocale()
  return (
    <TableFrame>
      <Table aria-label={t('title')}>
        <TableHeader>
          <TableRow>
            <TableHead>{t('quality')}</TableHead>
            <TableHead numeric>{t('min')}</TableHead>
            <TableHead numeric>{t('preferred')}</TableHead>
            <TableHead numeric>{t('max')}</TableHead>
            <TableHead numeric>{t('film')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((q) => (
            <TableRow key={q.quality}>
              <TableCell className="text-text">{q.quality}</TableCell>
              <TableCell numeric className="font-mono text-text-2">
                {perMinute(q.min, locale)}
              </TableCell>
              <TableCell numeric className="font-mono text-text-2">
                {q.preferred === null ? t('noPreference') : perMinute(q.preferred, locale)}
              </TableCell>
              <TableCell numeric className="font-mono text-text-2">
                {q.max === null ? t('noLimit') : perMinute(q.max, locale)}
              </TableCell>
              <TableCell numeric className="text-text-2">
                {q.max === null
                  ? t('filmFrom', { min: bytes(filmBytes(q.min)) })
                  : t('filmRange', { min: bytes(filmBytes(q.min)), max: bytes(filmBytes(q.max)) })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableFrame>
  )
}

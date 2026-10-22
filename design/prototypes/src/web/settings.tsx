// SPDX-License-Identifier: AGPL-3.0-only
// C7 Settings and C8 Profile on the web and desktop (docs/product/client-settings.md): the
// sections beside each other from medium widths, an index on a phone-width window; the account
// page; and Downloads, which needs the desktop app.
import { cn, EmptyState, Icon } from '@highsea-tv/ui-web'
import { useParams } from 'wouter'
import { useServer } from '../client/data.ts'
import { type SettingsSectionId, settingsSections } from '../client/settings.ts'
import { SettingsSectionBody } from '../client/settings-sections.tsx'
import { Soon } from '../kit/soon.tsx'
import { gutter, webHref } from './shell.tsx'

export function WebSettings() {
  const { section } = useParams<{ section?: string }>()
  const current = settingsSections.find((s) => s.id === section)
  // Side by side once the page has room in rem, so 200% text gets the list-then-section pattern
  // a phone gets, rather than a sliver of a column (a container query: rem there follows the text
  // size, where a media query's wouldn't).
  return (
    <main
      className={cn(
        '@container mx-auto grid max-w-[1100px] grid-cols-[minmax(0,1fr)] gap-6 py-8',
        gutter,
      )}
    >
      <h1 className="text-display">Settings</h1>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 @min-[42rem]:grid-cols-[14rem_minmax(0,1fr)]">
        <nav
          aria-label="Settings"
          className={cn('grid content-start gap-1', current && 'hidden @min-[42rem]:grid')}
        >
          {settingsSections.map((s) => (
            <a
              key={s.id}
              href={webHref(`/settings/${s.id}`)}
              aria-current={(current?.id ?? 'appearance') === s.id ? 'page' : undefined}
              className="flex items-center gap-3 rounded-md px-3 py-2.5 text-text-2 text-ui outline-none hover:bg-text/6 hover:text-text focus-visible:ring-focus @min-[42rem]:aria-[current=page]:bg-text/8 @min-[42rem]:aria-[current=page]:text-text"
            >
              <Icon name={s.icon} size={18} />
              <span className="grid">
                {s.label}
                <span className="text-caption text-text-3 @min-[42rem]:hidden">{s.hint}</span>
              </span>
            </a>
          ))}
        </nav>
        <section
          aria-labelledby="settings-section"
          className={cn(
            'grid grid-cols-[minmax(0,1fr)] content-start gap-4',
            !current && 'hidden @min-[42rem]:grid',
          )}
        >
          {current && (
            <a
              href={webHref('/settings')}
              className="flex items-center gap-1 justify-self-start text-text-2 text-ui @min-[42rem]:hidden"
            >
              <Icon name="chevron-left" size={16} />
              Settings
            </a>
          )}
          <h2 id="settings-section" className="text-title">
            {(current ?? settingsSections[0])?.label}
          </h2>
          <SettingsSectionBody
            id={(current?.id ?? 'appearance') as SettingsSectionId}
            platform="web"
          />
        </section>
      </div>
    </main>
  )
}

/** C8: who you are on this server. */
export function WebProfile() {
  const server = useServer()
  const name = server.data?.name ?? 'Harbor'
  return (
    <main className={cn('mx-auto grid max-w-[720px] grid-cols-[minmax(0,1fr)] gap-6 py-8', gutter)}>
      <div className="flex items-center gap-4">
        <span
          aria-hidden
          className="grid size-16 place-items-center rounded-full bg-accent-soft font-semibold text-[28px] text-accent-text"
        >
          I
        </span>
        <div className="grid">
          <h1 className="text-display">Ines</h1>
          <p className="text-text-2 text-ui">@ines · owner of {name}</p>
        </div>
      </div>
      <section aria-label="Account" className="grid gap-3 rounded-lg border border-line bg-s1 p-5">
        <h2 className="text-title">Account</h2>
        <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-6 gap-y-2 text-ui [overflow-wrap:anywhere]">
          <dt className="text-text-3">Server</dt>
          <dd className="text-text">{name}</dd>
          <dt className="text-text-3">Two-step verification</dt>
          <dd className="text-text">On</dd>
          <dt className="text-text-3">Libraries</dt>
          <dd className="text-text">All</dd>
        </dl>
        <div className="flex flex-wrap gap-2">
          <Soon size="sm">Change password</Soon>
          <Soon size="sm">Set up a passkey</Soon>
        </div>
      </section>
      <ul className="grid gap-2">
        {[
          {
            href: '/settings',
            icon: 'settings' as const,
            label: 'Settings',
            hint: 'Theme, sounds, home screen',
          },
          {
            href: '/settings/devices',
            icon: 'phone' as const,
            label: 'Your devices',
            hint: 'Where you’re signed in',
          },
          {
            href: '/downloads',
            icon: 'download' as const,
            label: 'Downloads',
            hint: 'Movies kept on this computer',
          },
        ].map((l) => (
          <li key={l.href}>
            <a
              href={webHref(l.href)}
              className="flex items-center gap-3 rounded-md border border-line bg-s1 px-4 py-3 text-ui outline-none hover:bg-s2 focus-visible:ring-focus"
            >
              <Icon name={l.icon} size={18} className="text-text-3" />
              <span className="grid flex-1">
                <span className="text-text">{l.label}</span>
                <span className="text-caption text-text-3">{l.hint}</span>
              </span>
              <Icon name="chevron-right" size={16} className="text-text-3" />
            </a>
          </li>
        ))}
      </ul>
    </main>
  )
}

/** Downloads (C8): a browser can't keep films; the desktop app can. */
export function WebDownloads() {
  return (
    <main
      className={cn(
        'mx-auto grid min-h-[60vh] max-w-[1680px] grid-cols-[minmax(0,1fr)] place-items-center',
        gutter,
      )}
    >
      <EmptyState
        icon="download"
        title="Downloads live in the desktop app"
        // it wraps rather than widening a phone at 200% text
        action={
          <Soon variant="primary" className="h-auto min-h-9 whitespace-normal py-1.5">
            Get the desktop app
          </Soon>
        }
      >
        A browser can’t keep films for offline. The highsea app for macOS, Windows and Linux can,
        and they play on a plane, a train, or anywhere the server can’t be reached.
      </EmptyState>
    </main>
  )
}

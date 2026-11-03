// SPDX-License-Identifier: AGPL-3.0-only
// C8 Profile on the web and desktop (docs/product/client-settings.md): the account page, and
// Downloads, which needs the desktop app. C7 Settings is apps/client's (/settings).

import { Button, cn, EmptyState, Icon } from '@highsea-tv/ui'
import { useState } from 'react'
import { useDesktopApp, useServer } from '../client/data.ts'
import { GetTheAppsDialog } from '../client/get-the-apps.tsx'
import { OfflineList } from '../client/offline-list.tsx'
import { ProfileAvatar, useMe } from '../client/who.tsx'
import { Soon } from '../kit/soon.tsx'
import { KeptIn } from './kept-in.tsx'
import { gutter, webHref } from './shell.tsx'

/** C8: who you are on this server. */
export function WebProfile() {
  const server = useServer()
  const name = server.data?.name ?? 'this server'
  const me = useMe()
  return (
    <main
      className={cn(
        'mx-auto w-full grid max-w-[720px] grid-cols-[minmax(0,1fr)] gap-6 py-8',
        gutter,
      )}
    >
      <div className="flex items-center gap-4">
        <ProfileAvatar profile={me} className="size-16 text-heading" />
        <div className="grid">
          <h1 className="text-heading">{me.name}</h1>
          <p className="text-text-2 text-body">
            {me.main ? `@ines · owner of ${name}` : 'A profile on @ines’s account'}
          </p>
        </div>
      </div>
      <section aria-label="Account" className="grid gap-3 rounded-lg border border-line bg-s1 p-5">
        <h2 className="text-title">Account</h2>
        <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-6 gap-y-2 text-body [overflow-wrap:anywhere]">
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
            href: '/settings?section=devices',
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
              className="flex items-center gap-3 rounded-md border border-line bg-s1 px-4 py-3 text-body outline-none hover:bg-s2 focus-visible:ring-focus"
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
  const desktop = useDesktopApp()
  const server = useServer()
  const [apps, setApps] = useState(false)
  if (desktop) return <DesktopDownloads />
  return (
    <main
      className={cn(
        'mx-auto w-full grid min-h-[60vh] max-w-[1680px] grid-cols-[minmax(0,1fr)] place-items-center',
        gutter,
      )}
    >
      <EmptyState
        icon="download"
        title="Downloads live in the desktop app"
        // it wraps rather than widening a phone at 200% text
        action={
          <Button variant="primary" icon="laptop" onClick={() => setApps(true)}>
            Get the desktop app
          </Button>
        }
      >
        To keep films for offline, use the highsea app for macOS, Windows or Linux. They play on a
        plane, a train, or anywhere the server can’t be reached.
      </EmptyState>
      <GetTheAppsDialog
        server={server.data?.name ?? 'this server'}
        address={server.data?.addresses.public ?? server.data?.addresses.local[0] ?? ''}
        open={apps}
        onOpenChange={setApps}
      />
    </main>
  )
}

/** The desktop app's Downloads: films kept on this computer, in a folder the person picks. */
function DesktopDownloads() {
  return (
    <main
      className={cn(
        'mx-auto w-full grid max-w-[1680px] grid-cols-[minmax(0,1fr)] gap-6 pt-6 pb-16',
        gutter,
      )}
    >
      <h1 className="text-heading">Downloads</h1>
      <OfflineList
        app="desktop"
        href={(x) => (x.kind === 'song' ? undefined : webHref(`/play/${x.id}`))}
        settings={<KeptIn />}
      />
    </main>
  )
}

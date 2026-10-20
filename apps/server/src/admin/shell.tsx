'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// A1, the admin shell, as far as checkpoint 1 needs it: the sidebar and the page frame, reading
// the server through the SDK (ADR 0018). The palette, status bar, banners and the phone menu
// come with checkpoint 2.
import { useT } from '@highsea/i18n/react'
import { createClient } from '@highsea/sdk'
import { ClientProvider, useQuery } from '@highsea/sdk/react'
import {
  Lockup,
  NavGroup,
  NavItem,
  PageHeader,
  ServerCard,
  Sidebar,
  UIProvider,
} from '@highsea/ui-web'
import { usePathname } from 'next/navigation'
import { type ReactNode, useMemo, useRef } from 'react'
import { shell } from './messages.ts'
import { pageAt, pageGroups } from './nav.ts'

export function AdminShell({ title, children }: { title: string; children: ReactNode }) {
  // same origin: the session cookie goes with every call
  const client = useMemo(() => createClient(), [])
  return (
    <ClientProvider client={client}>
      <UIProvider>
        <Frame title={title}>{children}</Frame>
      </UIProvider>
    </ClientProvider>
  )
}

function Frame({ title, children }: { title: string; children: ReactNode }) {
  const t = useT(shell)
  const main = useRef<HTMLElement>(null)
  return (
    <div className="flex h-screen bg-bg text-text">
      <button
        type="button"
        onClick={() => main.current?.focus()}
        className="sr-only z-50 rounded-sm bg-s3 px-3 py-2 text-ui focus:not-sr-only focus:fixed focus:start-3 focus:top-3"
      >
        {t('skip')}
      </button>
      <Navigation />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="relative min-h-0 flex-1 overflow-y-auto">
          <main
            ref={main}
            tabIndex={-1}
            className="grid grid-cols-1 content-start gap-5 p-4 outline-none medium:px-6.5 medium:py-5.5"
          >
            <PageHeader title={title} />
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}

function Navigation() {
  const t = useT(shell)
  const path = usePathname()
  const current = pageAt(path)
  const info = useQuery('server', (c) => c.system.publicInfo(), ['server.updated'])
  return (
    <Sidebar
      header={<Lockup />}
      footer={
        info.status === 'success' ? (
          <ServerCard
            name={info.data.name}
            detail={t('server.version', { version: info.data.version })}
          />
        ) : undefined
      }
    >
      {pageGroups.map((group) => (
        <NavGroup key={group[0]?.id}>
          {group.map((p) => (
            <NavItem
              key={p.id}
              icon={p.icon}
              label={t(p.label)}
              href={p.path}
              active={current?.id === p.id}
            />
          ))}
        </NavGroup>
      ))}
    </Sidebar>
  )
}

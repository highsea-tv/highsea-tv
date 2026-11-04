// SPDX-License-Identifier: AGPL-3.0-only
// The mobile tabs after Library: Search (C6, reference) and You (C8),
// which leads to the settings (C7, apps/client's Settings at /settings). docs/product/client-search.md,
// client-settings.md.

import { settingsSections } from '@highsea-tv/client/prefs'
import { ConfirmDialog, cn, Icon, toast } from '@highsea-tv/ui'
import { useLocation } from 'wouter'
import { useServer } from '../client/data.ts'
import { usePeople } from '../client/profiles.ts'
import { ProfileAvatar } from '../client/who.tsx'
import { gutter, Header, mobileHref } from './shell.tsx'
import { MobileWhoSheet } from './who-sheet.tsx'

// ---------------------------------------------------------------- you

/**
 * You at `/you/who`, with Switch profile's sheet open over it: profiles move with B3. `/you` itself is
 * apps/client's Settings (chrome/client.ts).
 */
export function MobileYou({ who = false }: { who?: boolean }) {
  const server = useServer()
  const [, navigate] = useLocation()
  const name = server.data?.name ?? 'this server'
  const { people, me } = usePeople()
  const row =
    'flex min-h-13 items-center gap-3 px-4 py-2.5 text-[15px] outline-none active:bg-s2 focus-visible:focus-ring-inset'
  return (
    <div className="grid gap-6 pt-1">
      <Header title="You" />
      <div className={cn('flex items-center gap-3', gutter)}>
        <ProfileAvatar profile={me} className="size-14 text-[22px]" />
        <div className="grid">
          <p className="font-semibold text-[20px]">{me.name}</p>
          <p className="text-[13px] text-text-3">
            {me.main ? `@ines · owner of ${name}` : 'A profile on @ines’s account'}
          </p>
        </div>
      </div>
      <nav
        aria-label="Settings"
        className="mx-4 overflow-hidden rounded-lg border border-line bg-s1"
      >
        <ul className="divide-y divide-line">
          {settingsSections().map((s) => (
            <li key={s.id}>
              <a href={mobileHref(`/settings?section=${s.id}`)} className={row}>
                <Icon name={s.icon} size={20} className="text-text-3" />
                <span className="flex-1">{s.label}</span>
                <Icon name="chevron-right" size={18} className="text-text-3" />
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <ul className="mx-4 divide-y divide-line overflow-hidden rounded-lg border border-line bg-s1">
        {people.length > 1 && (
          <li>
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => navigate('/you/who', { replace: true })}
              className={cn(row, 'w-full cursor-pointer text-start')}
            >
              <Icon name="users" size={20} className="text-text-3" />
              <span className="flex-1">Switch profile</span>
            </button>
          </li>
        )}
        <li>
          <a href={mobileHref('/offline')} className={row}>
            <Icon name="download" size={20} className="text-text-3" />
            <span className="flex-1">Downloads</span>
            <Icon name="chevron-right" size={18} className="text-text-3" />
          </a>
        </li>
        <li>
          {/* asks first, as Forget this server does on apps/client's sign-in screen */}
          <ConfirmDialog
            trigger={
              <button type="button" className={cn(row, 'w-full cursor-pointer text-badge-danger')}>
                <Icon name="sign-out" size={20} />
                Sign out of {name}
              </button>
            }
            title={`Sign out of ${name}?`}
            description="Your downloads stay on this phone. You can sign in again later."
            confirmLabel="Sign out"
            destructive
            onConfirm={() => {
              toast({
                title: `Signed out of ${name}`,
                description: 'Your downloads stay on this device.',
              })
              navigate('/connect')
            }}
          />
        </li>
      </ul>
      <MobileWhoSheet
        open={who}
        // the sheet's open state is in the address, without an entry of its own in the history
        onOpenChange={(open) => navigate(open ? '/you/who' : '/you', { replace: true })}
      />
    </div>
  )
}

// SPDX-License-Identifier: AGPL-3.0-only
// Switching profiles on the phone (prototype-gaps.md › 3.6; the owner, 2026-11-01): a sheet over
// You rather than the TV's page of large circles, as phones switch accounts in Instagram, Gmail
// and the Apple TV app. One row per profile: its circle, its name, "Watching now" and a check
// under the current one, a lock when it has a PIN. A profile with a PIN asks for it in the same
// sheet (client/who.tsx's PinStep); then Home, as that profile.
import { cn, Icon, Sheet, SheetContent } from '@highsea-tv/ui'
import { useState } from 'react'
import { useLocation } from 'wouter'
import { type Profile, usePeople } from '../client/profiles.ts'
import { PinStep, ProfileAvatar } from '../client/who.tsx'
import { sheetAction } from './now-playing.tsx'

export function MobileWhoSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { people, me, switchTo } = usePeople()
  const [, navigate] = useLocation()
  const [asking, setAsking] = useState<Profile | null>(null)
  const done = (p: Profile) => {
    switchTo(p.id)
    setAsking(null)
    navigate('/', { replace: true })
  }
  const choose = (p: Profile) => {
    if (p.id === me.id) return onOpenChange(false)
    // anyone without a PIN needs none
    if (p.pin) return setAsking(p)
    done(p)
  }
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setAsking(null)
      }}
    >
      <SheetContent title={asking ? `Enter ${asking.name}’s PIN` : 'Switch profile'}>
        {asking ? (
          <PinStep
            profile={asking}
            size="sheet"
            onBack={() => setAsking(null)}
            onRight={() => done(asking)}
          />
        ) : (
          <ul aria-label="Profiles" className="-mx-3 grid">
            {people.map((p) => {
              const current = p.id === me.id
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    aria-current={current ? 'true' : undefined}
                    aria-label={`${p.name}${p.pin ? ', has a PIN' : ''}${current ? ', watching now' : ''}`}
                    onClick={() => choose(p)}
                    className={cn(sheetAction, 'min-h-16 py-2')}
                  >
                    <ProfileAvatar profile={p} className="size-11 text-[18px]" />
                    <span className="grid min-w-0 flex-1">
                      <span className="truncate font-semibold">{p.name}</span>
                      {current && <span className="text-[13px] text-text-3">Watching now</span>}
                    </span>
                    {current ? (
                      <Icon name="check" size={20} className="text-accent-text" />
                    ) : (
                      p.pin && <Icon name="lock" size={18} className="text-text-3" />
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  )
}

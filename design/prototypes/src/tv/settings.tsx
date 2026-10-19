// SPDX-License-Identifier: AGPL-3.0-only
// C7 Settings, TV (docs/product/client-settings.md#tv): the sections down the left, the chosen
// one on the right. Focus moving down the list shows each section (as tvOS does); Right enters it,
// Left returns to the list. Theme and sound apply to this TV; the home layout follows the person.
import { cn } from '@highsea/ui-web'
import { useState } from 'react'
import { useLocation } from 'wouter'
import { useServer } from '../client/data.ts'
import { useDevicePrefs } from '../client/prefs.tsx'
import {
  APP_VERSION,
  type SettingsSectionId,
  settingsSections,
  useHomeLayout,
  useMyDevices,
  useThemeChoices,
} from '../client/settings.ts'
import { useProto } from '../screen/screen.tsx'
import { GlobalNav, ServerIdentity, TvButton, useInitialFocus } from './kit.tsx'

const option =
  'flex w-full items-center gap-[1cqw] rounded-[0.5cqw] px-[1.2cqw] py-[0.8cqw] text-start text-(length:--tv-text-button) text-text-2 outline-none transition-lift focus-visible:scale-[1.03] focus-visible:bg-text focus-visible:text-bg not-focus-visible:aria-checked:text-text'

function Check({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-[1.3cqw] shrink-0 place-items-center rounded-full border-[0.15cqw] border-current',
        on && 'bg-current',
      )}
    />
  )
}

function Theme() {
  const [prefs, set] = useDevicePrefs('tv')
  const choices = useThemeChoices()
  return (
    <div role="radiogroup" aria-label="Theme" className="grid gap-[0.4cqw]">
      {choices.map((t) => (
        // biome-ignore lint/a11y/useSemanticElements: a D-pad row, focused by the spatial navigator
        <button
          key={t.id}
          type="button"
          role="radio"
          aria-checked={prefs.theme === t.id}
          data-focusable=""
          onClick={() => set({ theme: t.id })}
          className={option}
        >
          <Check on={prefs.theme === t.id} />
          <span className="flex-1">{t.name}</span>
          <span className="text-(length:--tv-text-pill) opacity-70">{t.detail}</span>
        </button>
      ))}
    </div>
  )
}

function Sounds() {
  const [prefs, set] = useDevicePrefs('tv')
  const proto = useProto()
  const on = prefs.sound ?? proto.sound.tv
  return (
    <div className="grid gap-[1.2cqw]">
      <div className="flex gap-[1cqw]">
        <TvButton primary={on} onClick={() => set({ sound: !on })}>
          Interface sounds: {on ? 'On' : 'Off'}
        </TvButton>
      </div>
      <div className="grid gap-[0.6cqw]">
        <p className="text-(length:--tv-text-meta) text-text-2">
          Volume {Math.round(prefs.volume * 100)}%
        </p>
        <div className="flex gap-[1cqw]">
          <TvButton onClick={() => set({ volume: Math.max(0, prefs.volume - 0.1) })}>
            Quieter
          </TvButton>
          <TvButton onClick={() => set({ volume: Math.min(1, prefs.volume + 0.1) })}>
            Louder
          </TvButton>
        </div>
      </div>
    </div>
  )
}

function Home() {
  const home = useHomeLayout()
  return (
    <div className="grid gap-[0.8cqw]">
      <p className="text-(length:--tv-text-meta) text-text-2">
        OK shows or hides a row. Up and Down on Move change its place. It follows you to every
        device.
      </p>
      <ol className="grid gap-[0.4cqw]">
        {home.rows.map((r, i) => {
          const shown = !home.hidden.includes(r.id)
          return (
            <li
              key={r.id}
              data-group={`row-${r.id}`}
              className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-[0.6cqw]"
            >
              <button
                type="button"
                data-focusable=""
                aria-pressed={shown}
                onClick={() => home.toggle(r.id, !shown)}
                className={option}
              >
                <Check on={shown} />
                <span className="flex-1">{r.title}</span>
                <span className="text-(length:--tv-text-pill) opacity-70">
                  {shown ? 'Shown' : 'Hidden'}
                </span>
              </button>
              <TvButton
                aria-label={`Move ${r.title} up`}
                disabled={i === 0}
                onClick={() => home.move(r.id, -1)}
              >
                Up
              </TvButton>
              <TvButton
                aria-label={`Move ${r.title} down`}
                disabled={i === home.rows.length - 1}
                onClick={() => home.move(r.id, 1)}
              >
                Down
              </TvButton>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function Servers() {
  const server = useServer()
  const [, navigate] = useLocation()
  return (
    <div className="grid gap-[1.2cqw]">
      <p className="text-(length:--tv-text-synopsis) text-text-2">
        Watching on {server.data?.name ?? 'Harbor'}, signed in as Ines.
      </p>
      <div className="flex gap-[1cqw]">
        <TvButton icon="server" onClick={() => navigate('/connect')}>
          Another server
        </TvButton>
        <TvButton icon="sign-out" onClick={() => navigate('/connect')}>
          Sign out
        </TvButton>
      </div>
    </div>
  )
}

function Devices() {
  const { devices, revoke } = useMyDevices()
  return (
    <ul className="grid gap-[0.4cqw]">
      {(devices.data ?? []).map((d) => (
        <li key={d.id} className="flex items-center gap-[1cqw]">
          <span className="flex-1 text-(length:--tv-text-button)">
            {d.name}
            {d.client === 'tvos' && <span className="text-text-3"> · this TV</span>}
          </span>
          {d.client !== 'tvos' && d.client !== 'admin' && (
            <TvButton onClick={() => revoke(d.id)}>Sign out</TvButton>
          )}
        </li>
      ))}
    </ul>
  )
}

function About() {
  const server = useServer()
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-[2cqw] gap-y-[0.6cqw] text-(length:--tv-text-synopsis)">
      <dt className="text-text-3">This app</dt>
      <dd>highsea {APP_VERSION}</dd>
      <dt className="text-text-3">Server</dt>
      <dd>
        {server.data?.name ?? 'Harbor'} {server.data?.version}
      </dd>
      <dt className="text-text-3">Licence</dt>
      <dd>AGPL-3.0, free software</dd>
    </dl>
  )
}

const bodies: Record<SettingsSectionId, () => React.JSX.Element> = {
  appearance: Theme,
  sounds: Sounds,
  home: Home,
  servers: Servers,
  devices: Devices,
  about: About,
}

export function TvSettings() {
  const [section, setSection] = useState<SettingsSectionId>('appearance')
  useInitialFocus(true, null, '[data-group="menu"] [data-focusable]')
  const Body = bodies[section]
  const current = settingsSections.find((s) => s.id === section)
  return (
    <>
      <GlobalNav down="menu" />
      <div className="absolute inset-0 grid grid-cols-[24cqw_minmax(0,1fr)] gap-[4cqw] px-(--tv-safe-x) pt-[7cqw] pb-(--tv-safe-y)">
        <ServerIdentity />
        <nav aria-label="Settings" className="grid content-start gap-[1.2cqw]">
          <h1 className="font-semibold text-[2.6cqw] leading-none tracking-display">Settings</h1>
          <ul
            data-group="menu"
            data-go-up="nav"
            data-go-right="panel"
            className="grid gap-[0.3cqw]"
          >
            {settingsSections.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  data-focusable=""
                  aria-current={s.id === section ? 'true' : undefined}
                  onFocus={() => setSection(s.id)}
                  className={cn(option, 'not-focus-visible:aria-[current=true]:bg-text/10')}
                >
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <section
          aria-label={current?.label}
          data-group="panel"
          data-go-left="menu"
          className="grid content-start gap-[1.4cqw] pt-[3.6cqw]"
        >
          <p className="text-(length:--tv-text-meta) text-text-3">{current?.hint}</p>
          <Body />
        </section>
      </div>
    </>
  )
}

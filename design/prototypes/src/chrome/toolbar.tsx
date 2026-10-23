// SPDX-License-Identifier: AGPL-3.0-only
// The prototype toolbar. Deliberately not product UI: a thin bar, mono labels, native selects.
import { type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { flowFor, flows } from '../flows.ts'
import {
  connections,
  dataStates,
  type Platform,
  type ProtoState,
  platforms,
  roles,
  themes,
  timeModes,
  type Width,
  widths,
} from '../proto/state.ts'

type ToolbarProps = {
  state: ProtoState
  set: (next: (prev: ProtoState) => ProtoState) => void
  path: string
  platform: Platform | null
  /** The mock server's simulated time, reported by the screen. */
  now: number | null
  onNavigate: (path: string) => void
  onPlatform: (platform: Platform) => void
}

const control =
  'h-7 cursor-pointer rounded-[6px] border border-line bg-s2 px-2 font-mono text-[11px] text-text transition-tint hover:bg-s3 disabled:cursor-not-allowed disabled:opacity-40'

function Group({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId()
  return (
    <div className="flex items-center gap-1.5">
      <label htmlFor={id} className="font-mono text-[10px] text-text-3 uppercase tracking-label">
        {label}
      </label>
      {children(id)}
    </div>
  )
}

function Toggle({
  label,
  pressed,
  onChange,
}: {
  label: string
  pressed: boolean
  onChange: (pressed: boolean) => void
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onChange(!pressed)}
      className={`${control} aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent-text`}
    >
      {label}
    </button>
  )
}

const clockFormat = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

export function Toolbar({ state, set, path, platform, now, onNavigate, onPlatform }: ToolbarProps) {
  const update = <K extends keyof ProtoState>(key: K, value: ProtoState[K]) =>
    set((s) => ({ ...s, [key]: value }))
  const flow = flowFor(path)
  const sized = platform === 'admin' || platform === 'web'
  const [hintsOpen, setHintsOpen] = useState(false)
  const hints = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!hintsOpen) return
    const close = (e: PointerEvent | KeyboardEvent) => {
      if (
        e instanceof KeyboardEvent ? e.key === 'Escape' : !hints.current?.contains(e.target as Node)
      )
        setHintsOpen(false)
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', close)
    }
  }, [hintsOpen])

  return (
    <section
      aria-label="Prototype toolbar"
      className="relative z-10 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1.5 border-line border-b bg-s1 px-3 py-1.5"
    >
      <a
        href="#/"
        className="font-mono text-[11px] text-text-2 uppercase tracking-label hover:text-text"
      >
        highsea · prototypes
      </a>

      <Group label="Flow">
        {(id) => (
          <select
            id={id}
            className={control}
            value={flow?.id ?? ''}
            onChange={(e) => {
              if (!e.target.value) return onNavigate('/')
              const next = flows.find((f) => f.id === e.target.value)
              const route =
                next && ((platform && next.routes[platform]) ?? Object.values(next.routes)[0])
              if (route) onNavigate(route)
            }}
          >
            <option value="">All flows</option>
            {flows
              .filter((f) => f.ready)
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.id} {f.title}
                </option>
              ))}
          </select>
        )}
      </Group>

      <fieldset className="flex items-center gap-1.5">
        <legend className="float-left me-1.5 font-mono text-[10px] text-text-3 uppercase tracking-label">
          Platform
        </legend>
        {platforms.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={platform === p.id}
            onClick={() => onPlatform(p.id)}
            className={`${control} aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent-text`}
          >
            {p.label}
          </button>
        ))}
      </fieldset>

      <Group label="Width">
        {(id) => (
          <select
            id={id}
            className={control}
            disabled={!sized}
            value={String(state.width)}
            onChange={(e) =>
              update(
                'width',
                (e.target.value === 'fluid' ? 'fluid' : Number(e.target.value)) as Width,
              )
            }
          >
            {widths.map((w) => (
              <option key={w} value={String(w)}>
                {w === 'fluid' ? 'Fluid' : `${w}px`}
              </option>
            ))}
          </select>
        )}
      </Group>

      <Group label="Theme">
        {(id) => (
          <select
            id={id}
            className={control}
            value={state.theme}
            onChange={(e) => update('theme', e.target.value as ProtoState['theme'])}
          >
            {themes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        )}
      </Group>

      <Group label="Data">
        {(id) => (
          <select
            id={id}
            className={control}
            value={state.data}
            onChange={(e) => update('data', e.target.value as ProtoState['data'])}
          >
            {dataStates.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        )}
      </Group>

      <Group label="Server">
        {(id) => (
          <select
            id={id}
            className={control}
            value={state.role}
            onChange={(e) => update('role', e.target.value as ProtoState['role'])}
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        )}
      </Group>

      {platform !== 'admin' && (
        <Group label="Connection">
          {(id) => (
            <select
              id={id}
              className={control}
              value={state.connection}
              onChange={(e) => update('connection', e.target.value as ProtoState['connection'])}
            >
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          )}
        </Group>
      )}

      <div className="flex items-center gap-1.5">
        <Toggle
          label="Reduced motion"
          pressed={state.reducedMotion}
          onChange={(v) => update('reducedMotion', v)}
        />
        <Toggle
          label="Text 200%"
          pressed={state.largeText}
          onChange={(v) => update('largeText', v)}
        />
        <Toggle
          label="Sound"
          pressed={platform ? state.sound[platform] : false}
          onChange={(v) => platform && update('sound', { ...state.sound, [platform]: v })}
        />
      </div>

      <fieldset className="flex items-center gap-1.5">
        <legend className="float-left me-1.5 font-mono text-[10px] text-text-3 uppercase tracking-label">
          Time
        </legend>
        {timeModes.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={state.time === t.id}
            onClick={() => update('time', t.id)}
            className={`${control} aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent-text`}
          >
            {t.label}
          </button>
        ))}
        <output
          className="min-w-[13ch] font-mono text-[11px] text-text-2"
          aria-label="Simulated time"
        >
          {now ? clockFormat.format(now) : '—'}
        </output>
      </fieldset>

      {flow?.hints && (
        <div ref={hints} className="relative ms-auto">
          <button
            type="button"
            aria-expanded={hintsOpen}
            onClick={() => setHintsOpen((o) => !o)}
            className={control}
          >
            {flow.id} hints
          </button>
          {hintsOpen && (
            <div className="absolute end-0 top-full mt-1.5 w-[340px] rounded-sm border border-line-strong bg-s2 p-3 shadow-3">
              <p className="mb-2 font-mono text-[10px] text-text-3 uppercase tracking-label">
                {flow.id} {flow.title}
              </p>
              <ul className="grid list-disc gap-1.5 ps-4 text-caption text-text-2">
                {flow.hints.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

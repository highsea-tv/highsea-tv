// SPDX-License-Identifier: AGPL-3.0-only
// The launcher: every flow in the plan, what it covers, its spec and whether it's built yet.
import { type Flow, flows } from '../flows.ts'
import { platforms } from '../proto/state.ts'

const platformLabel = Object.fromEntries(platforms.map((p) => [p.id, p.label]))

function FlowCard({ flow, onOpen }: { flow: Flow; onOpen: (path: string) => void }) {
  const routes = Object.entries(flow.routes)
  return (
    <li className="grid content-start gap-2 rounded-md border border-line bg-s1 p-3.5">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[11px] text-text-3">{flow.id}</span>
        <h3 className="min-w-0 flex-1 text-text text-widget-title">{flow.title}</h3>
        {flow.fidelity === 'reference' && (
          <span className="font-mono text-[10px] text-text-3 uppercase tracking-label">
            reference
          </span>
        )}
      </div>
      <p className="text-caption text-text-2">{flow.description}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {flow.ready ? (
          routes.map(([platform, route]) => (
            <a
              key={platform}
              href={`#${route}`}
              onClick={(e) => {
                e.preventDefault()
                onOpen(route as string)
              }}
              className="rounded-[6px] border border-line-strong bg-s2 px-2 py-1 font-mono text-[11px] text-text transition-tint hover:bg-s3"
            >
              Open on {platformLabel[platform]}
            </a>
          ))
        ) : (
          <span className="font-mono text-[11px] text-text-3">
            Checkpoint {flow.checkpoint} · {flow.platforms.map((p) => platformLabel[p]).join(', ')}
          </span>
        )}
      </div>
      {flow.spec && <p className="font-mono text-[11px] text-text-3">Spec: {flow.spec}</p>}
    </li>
  )
}

export function Launcher({ onOpen }: { onOpen: (path: string) => void }) {
  const sections = [
    { id: 'admin', title: 'Server admin', items: flows.filter((f) => f.area === 'admin') },
    { id: 'clients', title: 'Clients', items: flows.filter((f) => f.area === 'client') },
  ]
  const ready = flows.filter((f) => f.ready).length
  return (
    <main className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto grid max-w-[1200px] gap-8 px-6 py-8">
        <header className="grid gap-2">
          <h1 className="text-heading">Prototypes</h1>
          <p className="max-w-[70ch] text-body text-text-2">
            Clickable references for milestone 1, built on the real tokens and components with a
            simulated server. {ready} of {flows.length} flows are built. Use the toolbar to switch
            platform, width, theme, data state and role; every screen honours them.
          </p>
        </header>
        {sections.map((s) => (
          <section key={s.title} className="grid gap-3" aria-labelledby={`launcher-${s.id}`}>
            <h2 id={`launcher-${s.id}`} className="text-title">
              {s.title}
            </h2>
            <ul className="grid grid-cols-1 gap-3 medium:grid-cols-2 expanded:grid-cols-3">
              {s.items.map((f) => (
                <FlowCard key={f.id} flow={f} onOpen={onOpen} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  )
}

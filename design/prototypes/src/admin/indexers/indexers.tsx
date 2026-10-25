// SPDX-License-Identifier: AGPL-3.0-only
// A9 Indexers (docs/product/indexers.md). Installed indexers with health, backoff and stats; the
// catalog to add more. Public indexers are one click: add, then an automatic test. Private ones
// open a form generated from the definition, with "where to find this" under each field, and are
// tested before they're saved. The catalog's version and changelog sit in the page header.

import { percent, relative } from '@highsea-tv/core/format'
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  EmptyState,
  Field,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  SegmentedControl,
  Select,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableFrame,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TitleCell,
  toast,
} from '@highsea-tv/ui-web'
import { useState } from 'react'
import { useAction, useNow, useQuery } from '../../mock/hooks.tsx'
import type { CatalogDefinition, Indexer, IndexerPrivacy } from '../../mock/types.ts'
import { Loadable } from '../loadable.tsx'
import { AdminPage } from '../shell.tsx'
import { indexerStatus } from '../status.ts'

const privacyLabel: Record<IndexerPrivacy, string> = {
  public: 'Public',
  'semi-private': 'Semi-private',
  private: 'Private',
}

const languageName: Record<string, string> = { en: 'English', es: 'Spanish' }

/** The catalog ships on its own schedule (roadmap › indexers). */
const changelog = [
  {
    version: '2026.10.14',
    notes: [
      'Anchorage: new 4K category ids.',
      'Fathom: login moved to the API; re-enter your key.',
    ],
  },
  { version: '2026.10.02', notes: ['Added Bosun.', 'Driftnet: faster search endpoint.'] },
  { version: '2026.09.20', notes: ['Keel: follows its new domain.'] },
]

type Tab = 'installed' | 'catalog'

export function Indexers() {
  const [tab, setTab] = useState<Tab>('installed')
  const installed = useQuery('indexers', (c) => c.indexers.list(), ['indexers.updated'])
  const server = useQuery('server', (c) => c.system.server(), ['server.updated'])
  const [notes, setNotes] = useState(false)

  return (
    <AdminPage
      title="Indexers"
      description={
        server.data ? (
          <>
            Catalog <span className="font-mono">{server.data.catalogVersion}</span>, updated on its
            own schedule.{' '}
            <button type="button" onClick={() => setNotes(true)} className="underline">
              What changed
            </button>
          </>
        ) : undefined
      }
      actions={
        <Button variant="primary" icon="add" onClick={() => setTab('catalog')}>
          Add indexer
        </Button>
      }
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} variant="line">
        <TabsList aria-label="Indexer sections">
          <TabsTrigger value="installed" count={installed.data?.length || undefined}>
            Installed
          </TabsTrigger>
          <TabsTrigger value="catalog">Catalog</TabsTrigger>
        </TabsList>
        <TabsContent value="installed" className="pt-5">
          <Installed onBrowse={() => setTab('catalog')} />
        </TabsContent>
        <TabsContent value="catalog" className="pt-5">
          <Catalog installed={installed.data ?? []} />
        </TabsContent>
      </Tabs>
      <Dialog open={notes} onOpenChange={setNotes}>
        <DialogContent title="What changed in the catalog" size="md">
          <ol className="grid gap-4">
            {changelog.map((c) => (
              <li key={c.version} className="grid gap-1">
                <h3 className="font-mono font-semibold text-text text-ui">{c.version}</h3>
                <ul className="grid list-disc gap-0.5 ps-5 text-body text-text-2">
                  {c.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </DialogContent>
      </Dialog>
    </AdminPage>
  )
}

// ---------------------------------------------------------------- installed

function Installed({ onBrowse }: { onBrowse: () => void }) {
  const now = useNow()
  const list = useQuery('indexers', (c) => c.indexers.list(), ['indexers.updated'])
  const toggle = useAction((c, id: string, on: boolean) => c.indexers.toggle(id, on))
  const test = useAction((c, id: string) => c.indexers.test(id))
  const clear = useAction((c, id: string) => c.indexers.clearBackoff(id))
  const remove = useAction((c, id: string) => c.indexers.remove(id))

  const runTest = (ix: Indexer) =>
    test
      .run(ix.id)
      .then((r) =>
        r.ok
          ? toast.success(`${ix.name} works`, { description: `${r.message} (${r.latencyMs} ms)` })
          : toast.error(`${ix.name} didn’t answer`, { description: r.message }),
      )

  return (
    <Loadable query={list} what="your indexers">
      {(xs) =>
        xs.length === 0 ? (
          <EmptyState
            icon="indexer"
            title="No indexers yet"
            action={
              <Button variant="primary" icon="catalog" onClick={onBrowse}>
                Browse the catalog
              </Button>
            }
          >
            Indexers are where highsea looks for releases. Public ones are a single click.
          </EmptyState>
        ) : (
          <TableFrame>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Indexer</TableHead>
                  <TableHead>Health</TableHead>
                  <TableHead numeric>Queries 24h</TableHead>
                  <TableHead numeric>Grabs 24h</TableHead>
                  <TableHead numeric>Response</TableHead>
                  <TableHead numeric>Success</TableHead>
                  <TableHead>Enabled</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {xs.map((ix) => {
                  const h = indexerStatus[ix.enabled ? ix.health : 'disabled']
                  return (
                    <TableRow key={ix.id}>
                      <TitleCell
                        title={ix.name}
                        detail={`${privacyLabel[ix.privacy]} · priority ${ix.priority}`}
                      />
                      <TableCell className="max-w-72 whitespace-normal">
                        <Badge tone={h.tone}>{h.label}</Badge>
                        {ix.health !== 'healthy' && ix.enabled && (
                          <p className="mt-1 text-caption text-text-3">
                            {ix.lastError ?? 'Not answering.'}
                            {ix.backoffUntil
                              ? ` Trying again ${relative(ix.backoffUntil, now)}.`
                              : ''}
                          </p>
                        )}
                      </TableCell>
                      <TableCell numeric>{ix.stats.queries24h}</TableCell>
                      <TableCell numeric>{ix.stats.grabs24h}</TableCell>
                      <TableCell numeric>{ix.stats.avgResponseMs} ms</TableCell>
                      <TableCell numeric>{percent(ix.stats.successRate)}</TableCell>
                      <TableCell>
                        <Switch
                          checked={ix.enabled}
                          onCheckedChange={(on) => toggle.run(ix.id, on)}
                          aria-label={`${ix.name} enabled`}
                        />
                      </TableCell>
                      <TableCell className="text-end">
                        <span className="inline-flex gap-1">
                          {ix.health === 'backoff' && (
                            <Button
                              size="sm"
                              onClick={() =>
                                clear
                                  .run(ix.id)
                                  .then(() => toast({ title: `${ix.name} is back in rotation` }))
                              }
                            >
                              Retry now
                            </Button>
                          )}
                          <Menu>
                            <MenuTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                iconOnly
                                icon="more"
                                aria-label={`More for ${ix.name}`}
                              />
                            </MenuTrigger>
                            <MenuContent>
                              <MenuItem icon="network" onSelect={() => runTest(ix)}>
                                Test
                              </MenuItem>
                              <MenuItem
                                icon="delete"
                                danger
                                onSelect={() =>
                                  remove
                                    .run(ix.id)
                                    .then(() => toast({ title: `${ix.name} removed` }))
                                }
                              >
                                Remove
                              </MenuItem>
                            </MenuContent>
                          </Menu>
                        </span>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableFrame>
        )
      }
    </Loadable>
  )
}

// ---------------------------------------------------------------- catalog

function Catalog({ installed }: { installed: Indexer[] }) {
  const catalog = useQuery('catalog', (c) => c.indexers.catalog())
  const [text, setText] = useState('')
  const [privacy, setPrivacy] = useState<'all' | IndexerPrivacy>('all')
  const [language, setLanguage] = useState('all')
  const [setting, setSetting] = useState<CatalogDefinition | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const add = useAction(async (c, def: CatalogDefinition, settings: Record<string, string>) => {
    const ix = await c.indexers.add(def.id, settings)
    const result = await c.indexers.test(ix.id)
    return { ix, result }
  })

  const oneClick = (def: CatalogDefinition) => {
    setAdding(def.id)
    add
      .run(def, {})
      .then(({ result }) =>
        result.ok
          ? toast.success(`${def.name} added and tested`, { description: result.message })
          : toast({
              title: `${def.name} added, but its test failed`,
              description: result.message,
              tone: 'warning',
            }),
      )
      .catch((e: Error) => toast.error(`Couldn’t add ${def.name}`, { description: e.message }))
      .finally(() => setAdding(null))
  }

  return (
    <Loadable query={catalog} what="the catalog">
      {(defs) => {
        const languages = [...new Set(defs.map((d) => d.language))]
        const q = text.trim().toLowerCase()
        const shown = defs.filter(
          (d) =>
            (privacy === 'all' || d.privacy === privacy) &&
            (language === 'all' || d.language === language) &&
            (!q || d.name.toLowerCase().includes(q) || d.description.toLowerCase().includes(q)),
        )
        return (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="search"
                icon="search"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Search the catalog"
                aria-label="Search the catalog"
                className="w-64"
              />
              <SegmentedControl
                aria-label="Privacy"
                size="sm"
                value={privacy}
                onValueChange={(v) => setPrivacy(v as typeof privacy)}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'public', label: 'Public' },
                  { value: 'semi-private', label: 'Semi-private' },
                  { value: 'private', label: 'Private' },
                ]}
              />
              <Select
                value={language}
                onValueChange={setLanguage}
                aria-label="Language"
                options={[
                  { value: 'all', label: 'Every language' },
                  ...languages.map((l) => ({ value: l, label: languageName[l] ?? l })),
                ]}
                className="w-44"
              />
            </div>
            {shown.length === 0 ? (
              <EmptyState size="sm" icon="search" title="Nothing in the catalog matches">
                Try another filter. Missing one? Definitions are open source; anyone can add one.
              </EmptyState>
            ) : (
              <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 medium:grid-cols-2 expanded:grid-cols-3">
                {shown.map((d) => {
                  const have = installed.some((i) => i.definitionId === d.id)
                  return (
                    <li
                      key={d.id}
                      className="grid content-between gap-3 rounded-lg border border-line bg-s1 p-4"
                    >
                      <div className="grid gap-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-text text-ui">{d.name}</h3>
                          <Badge
                            tone={
                              d.privacy === 'public'
                                ? 'success'
                                : d.privacy === 'private'
                                  ? 'warning'
                                  : 'info'
                            }
                          >
                            {privacyLabel[d.privacy]}
                          </Badge>
                        </div>
                        <p className="text-caption text-text-2">{d.description}</p>
                        <p className="font-mono text-figure text-text-3">
                          {languageName[d.language] ?? d.language} · v{d.version} ·{' '}
                          {d.source.license}
                        </p>
                      </div>
                      {have ? (
                        <Badge tone="neutral" className="justify-self-start">
                          Installed
                        </Badge>
                      ) : d.privacy === 'public' ? (
                        <Button
                          size="sm"
                          icon="add"
                          loading={adding === d.id}
                          onClick={() => oneClick(d)}
                          aria-label={`Add ${d.name}`}
                          className="justify-self-start"
                        >
                          Add
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          icon="settings"
                          onClick={() => setSetting(d)}
                          aria-label={`Set up ${d.name}`}
                          className="justify-self-start"
                        >
                          Set up
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
            <PrivateSetup definition={setting} onOpenChange={(o) => !o && setSetting(null)} />
          </div>
        )
      }}
    </Loadable>
  )
}

function PrivateSetup({
  definition: d,
  onOpenChange,
}: {
  definition: CatalogDefinition | null
  onOpenChange: (o: boolean) => void
}) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [touched, setTouched] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const save = useAction(async (c, def: CatalogDefinition, settings: Record<string, string>) => {
    const result = await c.indexers.test(def.id, settings)
    if (!result.ok) return result
    await c.indexers.add(def.id, settings)
    return result
  })
  const missing = (d?.settings ?? []).filter((f) => f.required && !values[f.key]?.trim())

  const close = (o: boolean) => {
    if (!o) {
      setValues({})
      setTouched(false)
      setFailure(null)
    }
    onOpenChange(o)
  }

  const submit = async () => {
    if (!d) return
    setTouched(true)
    setFailure(null)
    if (missing.length) return
    const r = await save.run(d, values).catch((e: Error) => ({ ok: false, message: e.message }))
    if (!r.ok) return setFailure(r.message)
    close(false)
    toast.success(`${d.name} added`, { description: 'Tested and working.' })
  }

  return (
    <Dialog open={!!d} onOpenChange={close}>
      <DialogContent
        size="md"
        title={d ? `Set up ${d.name}` : 'Set up'}
        description="highsea tests these before saving. They stay on your server."
        footer={
          <>
            <Button variant="ghost" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={save.pending} onClick={submit}>
              Test and save
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          {d?.settings.map((f) => (
            <Field
              key={f.key}
              label={f.label}
              hint={f.help}
              error={
                touched && f.required && !values[f.key]?.trim()
                  ? `Enter your ${f.label.toLowerCase()}.`
                  : undefined
              }
            >
              <Input
                type={f.type === 'password' ? 'password' : 'text'}
                value={values[f.key] ?? ''}
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
          ))}
          {failure && (
            <p
              role="alert"
              className="rounded-md border border-line bg-s2 p-3 text-caption text-danger"
            >
              {failure}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

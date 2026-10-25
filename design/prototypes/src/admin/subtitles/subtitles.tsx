// SPDX-License-Identifier: AGPL-3.0-only
// A10 Subtitles (docs/product/subtitles.md). The wanted list (movies missing a language their
// profile asks for) with search for one or all; then the settings: providers with their rate
// limits, language profiles (ordered, forced and SDH, cutoff), scoring and the automatic sync.

import { percent } from '@highsea-tv/core/format'
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Progress,
  Select,
  SortableList,
  Stat,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableFrame,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TitleCell,
  toast,
} from '@highsea-tv/ui-web'
import { useEffect, useState } from 'react'
import { useAction, useQuery } from '../../mock/hooks.tsx'
import type { Language, LanguageProfile, LanguageRule, SubtitleSettings } from '../../mock/types.ts'
import { Loadable } from '../loadable.tsx'
import { AdminPage, adminHref } from '../shell.tsx'

type Tab = 'wanted' | 'providers' | 'languages' | 'scoring'

export function Subtitles() {
  const [tab, setTab] = useState<Tab>('wanted')
  const wanted = useQuery('subtitles-wanted', (c) => c.subtitles.wanted(), ['subtitles.updated'])
  return (
    <AdminPage
      title="Subtitles"
      description="highsea finds subtitles for every movie it imports, then syncs them to the audio."
    >
      <Stats />
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} variant="line">
        <TabsList aria-label="Subtitle sections" className="max-w-full overflow-x-auto">
          <TabsTrigger value="wanted" count={wanted.data?.length || undefined}>
            Wanted
          </TabsTrigger>
          <TabsTrigger value="providers">Providers</TabsTrigger>
          <TabsTrigger value="languages">Languages</TabsTrigger>
          <TabsTrigger value="scoring">Scoring and sync</TabsTrigger>
        </TabsList>
        <TabsContent value="wanted" className="pt-5">
          <Wanted />
        </TabsContent>
        <TabsContent value="providers" className="pt-5">
          <Providers />
        </TabsContent>
        <TabsContent value="languages" className="pt-5">
          <Languages />
        </TabsContent>
        <TabsContent value="scoring" className="pt-5">
          <Scoring />
        </TabsContent>
      </Tabs>
    </AdminPage>
  )
}

function Stats() {
  const stats = useQuery('subtitle-stats', (c) => c.subtitles.stats(), ['subtitles.updated'])
  if (stats.status !== 'success') return null
  const s = stats.data
  return (
    <div className="grid grid-cols-2 gap-4 rounded-lg border border-line bg-s1 p-4 medium:grid-cols-4">
      <Stat value={String(s.syncedToday)} caption="synced today" />
      <Stat value={String(s.waiting)} caption="waiting to sync" />
      <Stat value={String(s.avgOffsetMs)} unit="ms" caption="average correction" />
      <Stat value={percent(s.avgConfidence)} caption="average confidence" />
    </div>
  )
}

// ---------------------------------------------------------------- wanted

function Wanted() {
  const data = useQuery(
    'subtitles-wanted-page',
    async (c) => {
      const [wanted, languages] = await Promise.all([c.subtitles.wanted(), c.subtitles.languages()])
      return { wanted, languages }
    },
    ['subtitles.updated'],
  )
  const searchAll = useAction((c) => c.subtitles.searchAllMissing())
  const searchOne = useAction(async (c, id: string, language: string) => {
    const [best] = await c.subtitles.search(id, language)
    if (!best) throw new Error('No provider has subtitles in that language yet.')
    return c.subtitles.download(id, best)
  })
  return (
    <Loadable query={data} what="the wanted list">
      {({ wanted, languages }) => {
        const name = (code: string) => languages.find((l) => l.code === code)?.name ?? code
        if (wanted.length === 0)
          return (
            <EmptyState icon="subtitles" title="Every movie has its subtitles">
              Movies show here when a language their profile asks for is missing.
            </EmptyState>
          )
        return (
          <TableFrame>
            <TableToolbar>
              <span className="text-text">
                {wanted.length} {wanted.length === 1 ? 'movie' : 'movies'} missing a language
              </span>
              <Button
                size="sm"
                icon="search"
                className="ms-auto"
                loading={searchAll.pending}
                onClick={() =>
                  searchAll.run().then(() =>
                    toast.success('Searched every provider', {
                      description: 'What was found is downloading and syncing.',
                    }),
                  )
                }
              >
                Search all
              </Button>
            </TableToolbar>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Movie</TableHead>
                  <TableHead>Missing</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {wanted.map(({ movie: m, missingLanguages }) => (
                  <TableRow key={m.id}>
                    <TitleCell
                      title={
                        <a href={adminHref(`/movies/${m.id}`)} className="hover:underline">
                          {m.title} ({m.year})
                        </a>
                      }
                      detail={m.path}
                    />
                    <TableCell>
                      <span className="flex flex-wrap gap-1">
                        {missingLanguages.map((l) => (
                          <Badge key={l} tone="warning">
                            {name(l)}
                          </Badge>
                        ))}
                      </span>
                    </TableCell>
                    <TableCell className="text-end">
                      <Button
                        size="sm"
                        icon="search"
                        disabled={searchOne.pending}
                        aria-label={`Search subtitles for ${m.title}`}
                        onClick={() =>
                          Promise.all(missingLanguages.map((l) => searchOne.run(m.id, l))).then(
                            () => toast.success(`Subtitles found for ${m.title}`),
                            (e: Error) =>
                              toast.error(`Nothing found for ${m.title}`, {
                                description: e.message,
                              }),
                          )
                        }
                      >
                        Search
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableFrame>
        )
      }}
    </Loadable>
  )
}

// ---------------------------------------------------------------- providers

function Providers() {
  const providers = useQuery('subtitle-providers', (c) => c.subtitles.providers(), [
    'subtitles.updated',
  ])
  const toggle = useAction((c, id: string, on: boolean) => c.subtitles.toggleProvider(id, on))
  return (
    <Loadable query={providers} what="the providers">
      {(ps) => (
        <TableFrame>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Requests left today</TableHead>
                <TableHead>Enabled</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ps.map((p) => {
                const left = p.rateLimitMax ? p.rateLimitRemaining / p.rateLimitMax : 0
                return (
                  <TableRow key={p.id}>
                    <TitleCell title={p.name} />
                    <TableCell className="text-text-2">
                      {p.requiresAuth ? (p.username ?? 'Needs an account') : 'Not needed'}
                    </TableCell>
                    <TableCell className="w-56">
                      <span className="flex items-center gap-3">
                        <Progress
                          value={left * 100}
                          tone={left < 0.1 ? 'warning' : 'neutral'}
                          aria-label={`${p.name} requests left`}
                          className="flex-1"
                        />
                        <span className="font-mono text-figure text-text-3">
                          {p.rateLimitRemaining}/{p.rateLimitMax}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={p.enabled}
                        onCheckedChange={(on) => toggle.run(p.id, on)}
                        aria-label={`${p.name} enabled`}
                      />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableFrame>
      )}
    </Loadable>
  )
}

// ---------------------------------------------------------------- languages

const forcedOptions = [
  { value: 'no', label: 'Regular only' },
  { value: 'also', label: 'Regular and forced' },
  { value: 'only', label: 'Forced only' },
]
const hiOptions = [
  { value: 'no', label: 'Without SDH' },
  { value: 'also', label: 'With or without SDH' },
  { value: 'only', label: 'SDH only' },
]

function Languages() {
  const data = useQuery(
    'language-profiles',
    async (c) => {
      const [profiles, languages] = await Promise.all([
        c.subtitles.languageProfiles(),
        c.subtitles.languages(),
      ])
      return { profiles, languages }
    },
    ['subtitles.updated'],
  )
  const [editing, setEditing] = useState<string | null>(null)
  return (
    <Loadable query={data} what="the language profiles">
      {({ profiles, languages }) => (
        <div className="grid gap-4">
          {profiles.map((p) =>
            editing === p.id ? (
              <ProfileEditor
                key={p.id}
                profile={p}
                languages={languages}
                onDone={() => setEditing(null)}
              />
            ) : (
              <ProfileCard
                key={p.id}
                profile={p}
                languages={languages}
                onEdit={() => setEditing(p.id)}
              />
            ),
          )}
          {editing === 'new' ? (
            <ProfileEditor
              profile={{
                id: `lp-${Date.now().toString(36)}`,
                name: '',
                languages: [{ code: 'en', forced: 'also', hi: 'no' }],
                cutoff: null,
                minScore: 80,
              }}
              languages={languages}
              onDone={() => setEditing(null)}
            />
          ) : (
            <Button icon="add" onClick={() => setEditing('new')} className="justify-self-start">
              New profile
            </Button>
          )}
        </div>
      )}
    </Loadable>
  )
}

function ProfileCard({
  profile: p,
  languages,
  onEdit,
}: {
  profile: LanguageProfile
  languages: Language[]
  onEdit: () => void
}) {
  const name = (code: string) => languages.find((l) => l.code === code)?.name ?? code
  return (
    <section
      aria-label={p.name}
      className="grid gap-2 rounded-lg border border-line bg-s1 p-4 medium:grid-cols-[1fr_auto]"
    >
      <div className="grid gap-1">
        <h3 className="font-semibold text-text text-ui">{p.name}</h3>
        <ol className="flex flex-wrap gap-1.5 text-caption text-text-2">
          {p.languages.map((l, i) => (
            <li key={l.code}>
              {i + 1}. {name(l.code)}
              {l.forced !== 'no' && ` · forced ${l.forced === 'only' ? 'only' : 'too'}`}
              {l.hi !== 'no' && ` · SDH ${l.hi === 'only' ? 'only' : 'too'}`}
            </li>
          ))}
        </ol>
        <p className="text-caption text-text-3">
          {p.cutoff
            ? `Stops upgrading once ${name(p.cutoff)} is found.`
            : 'Keeps looking for better matches.'}{' '}
          Minimum score {p.minScore}.
        </p>
      </div>
      <Button
        size="sm"
        icon="edit"
        onClick={onEdit}
        aria-label={`Edit ${p.name}`}
        className="self-start"
      >
        Edit
      </Button>
    </section>
  )
}

function ProfileEditor({
  profile,
  languages,
  onDone,
}: {
  profile: LanguageProfile
  languages: Language[]
  onDone: () => void
}) {
  const [draft, setDraft] = useState(profile)
  const [touched, setTouched] = useState(false)
  const save = useAction((c, p: LanguageProfile) => c.subtitles.saveLanguageProfile(p))
  const remove = useAction((c, id: string) => c.subtitles.deleteLanguageProfile(id))
  const name = (code: string) => languages.find((l) => l.code === code)?.name ?? code
  const unused = languages.filter((l) => !draft.languages.some((x) => x.code === l.code))

  const setRule = (i: number, patch: Partial<LanguageRule>) =>
    setDraft({
      ...draft,
      languages: draft.languages.map((l, j) => (j === i ? { ...l, ...patch } : l)),
    })
  const error = !draft.name.trim()
    ? 'Give the profile a name.'
    : !draft.languages.length
      ? 'Add at least one language.'
      : null

  return (
    <section
      aria-label={draft.name || 'New profile'}
      className="grid grid-cols-[minmax(0,1fr)] gap-4 rounded-lg border border-line-strong bg-s1 p-4"
    >
      <Field
        label="Name"
        error={touched && !draft.name.trim() ? 'Give the profile a name.' : undefined}
      >
        <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      </Field>
      <div className="grid gap-2">
        <h3 className="font-medium text-text text-ui">Languages, in order of preference</h3>
        <SortableList
          aria-label="Languages, in order of preference"
          items={draft.languages}
          id={(l) => l.code}
          label={(l) => name(l.code)}
          onChange={(languages) => setDraft({ ...draft, languages })}
          className="gap-2"
          itemClassName="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-line bg-s2 p-2.5 medium:grid-cols-[auto_minmax(0,1fr)_12rem_12rem_auto]"
        >
          {(l, handle) => {
            const i = draft.languages.findIndex((x) => x.code === l.code)
            return (
              <>
                {handle}
                <span className="text-text text-ui">
                  <span className="font-mono text-text-3">{i + 1}.</span> {name(l.code)}
                </span>
                <Select
                  value={l.forced}
                  onValueChange={(v) => setRule(i, { forced: v as LanguageRule['forced'] })}
                  options={forcedOptions}
                  aria-label={`${name(l.code)}: forced subtitles`}
                  className="col-span-3 medium:col-span-1"
                />
                <Select
                  value={l.hi}
                  onValueChange={(v) => setRule(i, { hi: v as LanguageRule['hi'] })}
                  options={hiOptions}
                  aria-label={`${name(l.code)}: SDH`}
                  className="col-span-3 medium:col-span-1"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  iconOnly
                  icon="close"
                  aria-label={`Remove ${name(l.code)}`}
                  className="col-start-3 row-start-1 medium:col-start-auto medium:row-start-auto"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      languages: draft.languages.filter((x) => x.code !== l.code),
                      cutoff: draft.cutoff === l.code ? null : draft.cutoff,
                    })
                  }
                />
              </>
            )
          }}
        </SortableList>
        {unused.length > 0 && (
          <Select
            value=""
            onValueChange={(code) =>
              setDraft({
                ...draft,
                languages: [...draft.languages, { code, forced: 'no', hi: 'no' }],
              })
            }
            placeholder="Add a language"
            aria-label="Add a language"
            options={unused.map((l) => ({ value: l.code, label: l.name }))}
            className="w-56"
          />
        )}
      </div>
      <div className="grid gap-4 medium:grid-cols-2">
        <Field label="Cutoff" hint="Once this language is found, stop looking for better matches.">
          <Select
            value={draft.cutoff ?? 'none'}
            onValueChange={(v) => setDraft({ ...draft, cutoff: v === 'none' ? null : v })}
            options={[
              { value: 'none', label: 'Keep looking' },
              ...draft.languages.map((l) => ({ value: l.code, label: name(l.code) })),
            ]}
          />
        </Field>
        <Field label="Minimum score" hint="0 to 100. A hash match scores about 95.">
          <Input
            inputMode="numeric"
            value={String(draft.minScore)}
            onChange={(e) =>
              setDraft({
                ...draft,
                minScore: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
              })
            }
          />
        </Field>
      </div>
      {touched && error && (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          loading={save.pending}
          onClick={() => {
            setTouched(true)
            if (error) return
            save.run({ ...draft, name: draft.name.trim() }).then(() => {
              toast.success(`${draft.name.trim()} saved`)
              onDone()
            })
          }}
        >
          Save profile
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        {profile.name && (
          <Button
            variant="danger"
            icon="delete"
            className="ms-auto"
            onClick={() =>
              remove.run(profile.id).then(() => {
                toast({ title: `${profile.name} deleted` })
                onDone()
              })
            }
          >
            Delete
          </Button>
        )}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- scoring and sync

function Scoring() {
  const settings = useQuery('subtitle-settings', (c) => c.subtitles.settings(), [
    'subtitles.updated',
  ])
  return (
    <Loadable query={settings} what="the subtitle settings">
      {(s) => <ScoringForm settings={s} />}
    </Loadable>
  )
}

function ScoringForm({ settings }: { settings: SubtitleSettings }) {
  const [draft, setDraft] = useState(settings)
  useEffect(() => setDraft(settings), [settings])
  const save = useAction((c, patch: SubtitleSettings) => c.subtitles.saveSettings(patch))
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings)
  return (
    <div className="grid max-w-2xl gap-5">
      <Field label="Minimum score" hint="0 to 100. Subtitles below this are never downloaded.">
        <Input
          inputMode="numeric"
          value={String(draft.minScore)}
          onChange={(e) =>
            setDraft({
              ...draft,
              minScore: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
            })
          }
          className="w-32"
        />
      </Field>
      <Field
        inline
        label="Prefer release matches"
        hint="A subtitle made for this exact release beats one matched on title and year."
      >
        <Switch
          checked={draft.preferReleaseMatch}
          onCheckedChange={(preferReleaseMatch) => setDraft({ ...draft, preferReleaseMatch })}
        />
      </Field>
      <Field
        inline
        label="Sync to the audio"
        hint="Every downloaded subtitle is lined up with the speech, in the background."
      >
        <Switch
          checked={draft.autoSync}
          onCheckedChange={(autoSync) => setDraft({ ...draft, autoSync })}
        />
      </Field>
      <Field
        label="Minimum confidence"
        hint="Below this, highsea keeps the original timing and marks the track for review."
      >
        <Select
          value={String(draft.minConfidence)}
          onValueChange={(v) => setDraft({ ...draft, minConfidence: Number(v) })}
          options={[0.5, 0.6, 0.7, 0.8, 0.9].map((v) => ({ value: String(v), label: percent(v) }))}
          disabled={!draft.autoSync}
          className="w-32"
        />
      </Field>
      <Field label="Keep upgrading for" hint="Look for a better match this many days after import.">
        <Input
          inputMode="numeric"
          value={String(draft.upgradeDays)}
          onChange={(e) =>
            setDraft({ ...draft, upgradeDays: Math.max(0, Number(e.target.value) || 0) })
          }
          end={<span className="text-caption text-text-3">days</span>}
          className="w-32"
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          disabled={!dirty}
          loading={save.pending}
          onClick={() => save.run(draft).then(() => toast.success('Subtitle settings saved'))}
        >
          Save
        </Button>
        <Button variant="ghost" disabled={!dirty} onClick={() => setDraft(settings)}>
          Discard changes
        </Button>
      </div>
    </div>
  )
}

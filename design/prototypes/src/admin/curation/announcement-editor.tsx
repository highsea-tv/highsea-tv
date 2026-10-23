// SPDX-License-Identifier: AGPL-3.0-only
// The announcement composer (A11, docs/product/curation.md#announcement-composer): the message,
// how loud it is, where it shows, who sees it and when, beside a live preview on each client.
import {
  Button,
  Checkbox,
  Field,
  Input,
  SegmentedControl,
  Select,
  Switch,
  Textarea,
  toast,
} from '@highsea-tv/ui-web'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useParams } from 'wouter'
import { useAction, useNow, useQuery } from '../../mock/hooks.tsx'
import type { Announcement, CurationPreview, Placement } from '../../mock/types.ts'
import { Loadable } from '../loadable.tsx'
import { AdminPage, adminHref } from '../shell.tsx'
import { placementLabels } from './curation.tsx'
import { ClientPreview } from './preview.tsx'
import { AudienceField, audienceError, LIVE_IN_PREVIEW, ScheduleField } from './shared.tsx'

const placementHints: Record<Exclude<Placement, 'modal'>, string> = {
  banner: 'Above the page on the web, desktop and the admin.',
  card: 'A card under the header on phones.',
  toast: 'A short notice on the web and desktop, once.',
}

const severities: { value: Announcement['severity']; label: string }[] = [
  { value: 'info', label: 'Info' },
  { value: 'notice', label: 'Notice' },
  { value: 'warning', label: 'Warning' },
  { value: 'critical', label: 'Critical' },
]

function blank(now: number): Announcement {
  return {
    id: `an-${now.toString(36)}`,
    title: '',
    body: '',
    image: null,
    cta: null,
    severity: 'notice',
    placements: ['banner', 'card'],
    audience: { kind: 'everyone' },
    schedule: { start: new Date(now).toISOString(), end: null },
    acknowledgement: 'dismiss',
    status: 'draft',
    seen: false,
  }
}

export function AnnouncementEditor() {
  const { id } = useParams<{ id: string }>()
  const isNew = id === 'new'
  const existing = useQuery(`curation:announcement:${id}`, (c) =>
    isNew ? Promise.resolve(null) : c.curation.announcement(id),
  )
  return (
    <AdminPage title={isNew ? 'New announcement' : 'Edit announcement'}>
      <Loadable query={existing} what="the announcement">
        {(a) => <Composer initial={a} />}
      </Loadable>
    </AdminPage>
  )
}

function Composer({ initial }: { initial: Announcement | null }) {
  const now = useNow()
  const [, navigate] = useLocation()
  const [draft, setDraft] = useState<Announcement>(() => initial ?? blank(now))
  const [tried, setTried] = useState(false)
  const snapshot = useQuery('curation:snapshot', (c) => c.curation.snapshot())
  const titles = useQuery('curation:titles', (c) => c.movies.list())
  const save = useAction((c, a: Announcement) => c.curation.saveAnnouncement(a))
  const set = (patch: Partial<Announcement>) => setDraft((d) => ({ ...d, ...patch }))

  // a dirty form asks before the tab closes
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial ?? blank(now))
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const require = draft.acknowledgement === 'require'
  const errors = {
    title: !draft.title.trim() ? 'Give it a title. It’s the first thing people read.' : undefined,
    placements:
      !require && !draft.placements.length ? 'Choose at least one place to show it.' : undefined,
    audience: audienceError(draft.audience),
    cta:
      draft.cta && (!draft.cta.label.trim() || !/^https?:\/\/\S+$/.test(draft.cta.url))
        ? 'The button needs a label and a full link, starting with https://.'
        : undefined,
    schedule:
      draft.schedule.end && Date.parse(draft.schedule.end) <= Date.parse(draft.schedule.start)
        ? 'The end has to come after the start.'
        : undefined,
  }
  const invalid = Object.values(errors).some(Boolean)
  const show = (e: string | undefined) => (tried ? e : undefined)

  const preview = useMemo<CurationPreview>(() => {
    const saved = snapshot.data ?? { announcements: [], featured: [] }
    // the preview shows the draft as if it were live now, whatever its schedule
    const live = {
      ...draft,
      status: 'live' as const,
      schedule: LIVE_IN_PREVIEW,
    }
    // only the draft: the others would stack with it, or cover it with their own dialog
    return { featured: saved.featured, announcements: [live] }
  }, [draft, snapshot.data])

  const later = Date.parse(draft.schedule.start) > now + 60_000
  const submit = (asDraft: boolean) => {
    setTried(true)
    if (!asDraft && invalid) return
    if (asDraft && errors.title) return
    save
      .run({ ...draft, status: asDraft ? 'draft' : 'live' })
      .then((a) => {
        toast.success(
          asDraft
            ? `“${a.title}” saved as a draft`
            : a.status === 'scheduled'
              ? `“${a.title}” is scheduled`
              : `“${a.title}” is live`,
          {
            description: asDraft
              ? 'Nobody sees it until you publish it.'
              : a.status === 'scheduled'
                ? 'It goes out on its own at the start time.'
                : 'It’s on everyone’s screens in its audience now.',
          },
        )
        navigate('/curation')
      })
      .catch((e: Error) =>
        toast.error('Couldn’t save the announcement', { description: e.message }),
      )
  }

  const placements = (['banner', 'card', 'toast'] as const).map((p) => ({
    p,
    checked: draft.placements.includes(p),
  }))

  return (
    <div className="grid gap-6 expanded:grid-cols-[minmax(22rem,28rem)_minmax(0,1fr)] expanded:items-start">
      <form
        aria-label="Announcement"
        className="grid gap-6"
        onSubmit={(e) => {
          e.preventDefault()
          submit(false)
        }}
      >
        <div className="grid gap-4">
          <Field label="Title" error={show(errors.title)}>
            <Input
              value={draft.title}
              maxLength={80}
              onChange={(e) => set({ title: e.target.value })}
              placeholder="Movie night is Friday"
            />
          </Field>
          <Field label="Message" hint="**bold**, _italic_ and [links](https://…) work here.">
            <Textarea
              rows={4}
              value={draft.body}
              onChange={(e) => set({ body: e.target.value })}
              placeholder="We’re watching Sintel in the living room at 8 pm."
            />
          </Field>
          <Field label="Image" hint="Shown with the dialog and on the TV’s screen.">
            <Select
              value={draft.image ?? 'none'}
              onValueChange={(v) => set({ image: v === 'none' ? null : v })}
              options={[
                { value: 'none', label: 'No image' },
                ...(titles.data ?? [])
                  .filter((m) => m.status === 'available')
                  .slice(0, 12)
                  .map((m) => ({ value: m.art.backdrop, label: `${m.title} backdrop` })),
              ]}
            />
          </Field>
          <div className="grid gap-2">
            <Field inline label="Add a button">
              <Switch
                checked={!!draft.cta}
                onCheckedChange={(on) => set({ cta: on ? { label: '', url: 'https://' } : null })}
              />
            </Field>
            {draft.cta && (
              <div className="grid gap-3 medium:grid-cols-2">
                <Field label="Button label">
                  <Input
                    value={draft.cta.label}
                    onChange={(e) => set({ cta: { url: '', ...draft.cta, label: e.target.value } })}
                    placeholder="See the schedule"
                  />
                </Field>
                <Field label="Link" error={show(errors.cta)}>
                  <Input
                    type="url"
                    value={draft.cta.url}
                    onChange={(e) => set({ cta: { label: '', ...draft.cta, url: e.target.value } })}
                    className="font-mono"
                  />
                </Field>
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-2">
          <span className="font-medium text-text text-ui">How important</span>
          <SegmentedControl
            aria-label="How important"
            size="sm"
            value={draft.severity}
            onValueChange={(v) => set({ severity: v as Announcement['severity'] })}
            options={severities}
            className="justify-self-start"
          />
          <p className="text-caption text-text-3">
            Warnings and critical ones take their tone in banners, so they stand out from the
            everyday.
          </p>
        </div>

        <fieldset className="grid gap-3">
          <legend className="mb-1.5 font-medium text-text text-ui">Where it shows</legend>
          <Field
            inline
            label="Everyone has to acknowledge it"
            hint="It opens as a dialog with only Got it, and on TV as a screen of its own before Home. Use it for things people must not miss."
          >
            <Switch
              checked={require}
              onCheckedChange={(on) =>
                set({
                  acknowledgement: on ? 'require' : 'dismiss',
                  placements: on
                    ? [...new Set<Placement>([...draft.placements, 'modal'])]
                    : draft.placements.filter((p) => p !== 'modal'),
                })
              }
            />
          </Field>
          <div className="grid gap-2 rounded-md border border-line bg-s2 p-3">
            {placements.map(({ p, checked }) => (
              <Field key={p} inline label={placementLabels[p]} hint={placementHints[p]}>
                <Checkbox
                  checked={checked}
                  onCheckedChange={(c) =>
                    set({
                      placements:
                        c === true
                          ? [...draft.placements, p]
                          : draft.placements.filter((x) => x !== p),
                    })
                  }
                />
              </Field>
            ))}
            <p className="text-caption text-text-3">
              On TV, the newest announcement shows as a pill at the top of Home.
            </p>
          </div>
          {show(errors.placements) && (
            <p role="alert" className="text-badge-danger text-caption">
              {errors.placements}
            </p>
          )}
        </fieldset>

        <AudienceField
          value={draft.audience}
          onChange={(audience) => set({ audience })}
          error={show(errors.audience)}
        />
        <ScheduleField
          value={draft.schedule}
          onChange={(schedule) => set({ schedule })}
          now={now}
        />

        <div className="flex flex-wrap gap-2 border-line border-t pt-4">
          <Button type="submit" variant="primary" loading={save.pending}>
            {later
              ? 'Schedule'
              : initial && initial.status !== 'draft'
                ? 'Save changes'
                : 'Publish'}
          </Button>
          <Button type="button" onClick={() => submit(true)} disabled={save.pending}>
            Save as draft
          </Button>
          <Button type="button" variant="ghost" asChild>
            <a href={adminHref('/curation')}>Cancel</a>
          </Button>
        </div>
      </form>
      <div className="expanded:sticky expanded:top-4">
        <ClientPreview
          preview={preview}
          draftId={draft.id}
          audience={draft.audience}
          what="this announcement"
          note="Other announcements are left out."
        />
      </div>
    </div>
  )
}

'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// The announcement composer (A11, curation.md#announcement-composer; checkpoint 8c), ported from
// the prototype's curation/announcement-editor.tsx: the message, how loud it is, where it shows,
// who sees it and when, beside the live client preview. Publish checks everything; a draft needs
// only its title, as the server does.
import type { Announcement, AnnouncementInput, Placement } from '@highsea-tv/api-contract'
import { useAction, useQuery } from '@highsea-tv/sdk/react'
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
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { ClientPreview } from './curation-preview.tsx'
import { AudienceField, audienceError, ScheduleField, useCurationT } from './curation-shared.tsx'
import { Loadable } from './loadable.tsx'
import { AdminPage } from './shell.tsx'
import { useNow } from './time.ts'

const SEVERITIES: Announcement['severity'][] = ['info', 'notice', 'warning', 'critical']
const PLACEMENTS = ['banner', 'card', 'toast'] as const

type Draft = Omit<AnnouncementInput, 'draft'>

function blank(now: number): Draft {
  return {
    title: '',
    body: '',
    image: null,
    cta: null,
    severity: 'notice',
    placements: ['banner', 'card'],
    audience: { kind: 'everyone' },
    schedule: { start: new Date(now).toISOString(), end: null },
    acknowledgement: 'dismiss',
  }
}

const draftOf = ({ id: _, status: _s, ...a }: Announcement): Draft => a

export function AnnouncementEditor({ id }: { id: string }) {
  const t = useCurationT()
  const isNew = id === 'new'
  const existing = useQuery(`curation:announcement:${id}`, (c) =>
    isNew ? Promise.resolve(null) : c.curation.announcement({ params: { id } }),
  )
  return (
    <AdminPage title={isNew ? t('announcement.new') : t('announcement.edit')}>
      <Loadable query={existing} what={t('announcement.what')}>
        {(a) => <Composer initial={a} />}
      </Loadable>
    </AdminPage>
  )
}

function Composer({ initial }: { initial: Announcement | null }) {
  const t = useCurationT()
  const now = useNow()
  const router = useRouter()
  const [start] = useState(() => (initial ? draftOf(initial) : blank(now)))
  const [draft, setDraft] = useState<Draft>(start)
  const [tried, setTried] = useState(false)
  const backdrops = useQuery('curation:backdrops', (c) =>
    c.movies.list({ query: { status: 'available', limit: 12 } }),
  )
  const save = useAction((c, body: AnnouncementInput) =>
    initial
      ? c.curation.saveAnnouncement({ params: { id: initial.id }, body })
      : c.curation.addAnnouncement({ body }),
  )
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))

  // a dirty form asks before the tab closes
  const dirty = JSON.stringify(draft) !== JSON.stringify(start)
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const require = draft.acknowledgement === 'require'
  const errors = {
    title: !draft.title.trim() ? t('error.title') : undefined,
    placements: !require && !draft.placements.length ? t('error.placements') : undefined,
    audience: audienceError(draft.audience, t),
    cta:
      draft.cta && (!draft.cta.label.trim() || !/^https?:\/\/\S+$/.test(draft.cta.url))
        ? t('error.cta')
        : undefined,
    schedule:
      draft.schedule.end && Date.parse(draft.schedule.end) <= Date.parse(draft.schedule.start)
        ? t('error.endBeforeStart')
        : undefined,
  }
  const invalid = Object.values(errors).some(Boolean)
  const show = (e: string | undefined) => (tried ? e : undefined)

  // the preview shows the draft as if it were live now, alone: the others would stack with it,
  // or cover it with their own dialog
  const preview = useMemo(
    () => ({
      kind: 'announcement' as const,
      id: initial?.id,
      announcement: { ...draft, draft: false },
    }),
    [draft, initial?.id],
  )

  const later = Date.parse(draft.schedule.start) > now + 60_000
  const submit = (asDraft: boolean) => {
    setTried(true)
    if (!asDraft && invalid) return
    if (asDraft && errors.title) return
    save
      .run({ ...draft, draft: asDraft })
      .then((a) => {
        const kind = asDraft ? 'draft' : a.status === 'scheduled' ? 'scheduled' : 'live'
        toast.success(t(`saved.${kind}`, { title: a.title }), {
          description: t(`saved.${kind}Body`),
        })
        router.push('/curation')
      })
      .catch((e: Error) => toast.error(t('saveFailed.announcement'), { description: e.message }))
  }

  return (
    <div className="grid gap-6 expanded:grid-cols-[minmax(22rem,28rem)_minmax(0,1fr)] expanded:items-start">
      <form
        aria-label={t('announcement.form')}
        className="grid gap-6"
        onSubmit={(e) => {
          e.preventDefault()
          submit(false)
        }}
      >
        <div className="grid gap-4">
          <Field label={t('field.title')} error={show(errors.title)}>
            <Input
              value={draft.title}
              maxLength={80}
              onChange={(e) => set({ title: e.target.value })}
              placeholder={t('field.titlePlaceholder')}
            />
          </Field>
          <Field label={t('field.message')} hint={t('field.messageHint')}>
            <Textarea
              rows={4}
              maxLength={4000}
              value={draft.body}
              onChange={(e) => set({ body: e.target.value })}
              placeholder={t('field.messagePlaceholder')}
            />
          </Field>
          <Field label={t('field.image')} hint={t('field.imageHint')}>
            <Select
              value={draft.image ?? 'none'}
              onValueChange={(v) => set({ image: v === 'none' ? null : v })}
              options={[
                { value: 'none', label: t('field.noImage') },
                // the one saved stays offered, even once it's off the first page
                ...(draft.image &&
                !backdrops.data?.items.some((m) => m.art.backdrop === draft.image)
                  ? [{ value: draft.image, label: draft.image }]
                  : []),
                ...(backdrops.data?.items ?? []).flatMap((m) =>
                  m.art.backdrop
                    ? [{ value: m.art.backdrop, label: t('field.backdrop', { title: m.title }) }]
                    : [],
                ),
              ]}
            />
          </Field>
          <div className="grid gap-2">
            <Field inline label={t('field.button')}>
              <Switch
                checked={!!draft.cta}
                onCheckedChange={(on) => set({ cta: on ? { label: '', url: 'https://' } : null })}
              />
            </Field>
            {draft.cta && (
              <div className="grid gap-3 medium:grid-cols-2">
                <Field label={t('field.buttonLabel')}>
                  <Input
                    value={draft.cta.label}
                    maxLength={40}
                    onChange={(e) => set({ cta: { url: '', ...draft.cta, label: e.target.value } })}
                    placeholder={t('field.buttonPlaceholder')}
                  />
                </Field>
                <Field label={t('field.link')} error={show(errors.cta)}>
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
          <span className="font-medium text-text text-ui">{t('importance')}</span>
          <SegmentedControl
            aria-label={t('importance')}
            size="sm"
            value={draft.severity}
            onValueChange={(v) => set({ severity: v as Announcement['severity'] })}
            options={SEVERITIES.map((s) => ({ value: s, label: t(`severity.${s}`) }))}
            className="justify-self-start"
          />
          <p className="text-caption text-text-3">{t('importanceHint')}</p>
        </div>

        <fieldset className="grid gap-3">
          <legend className="mb-1.5 font-medium text-text text-ui">{t('whereShows')}</legend>
          <Field inline label={t('acknowledge')} hint={t('acknowledgeHint')}>
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
            {PLACEMENTS.map((p) => (
              <Field key={p} inline label={t(`placement.${p}`)} hint={t(`hint.${p}`)}>
                <Checkbox
                  checked={draft.placements.includes(p)}
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
            <p className="text-caption text-text-3">{t('tvPill')}</p>
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
              ? t('schedule')
              : initial && initial.status !== 'draft'
                ? t('saveChanges')
                : t('publish')}
          </Button>
          <Button type="button" onClick={() => submit(true)} disabled={save.pending}>
            {t('saveDraft')}
          </Button>
          <Button type="button" variant="ghost" asChild>
            <a href="/curation">{t('cancel')}</a>
          </Button>
        </div>
      </form>
      <div className="min-w-0 expanded:sticky expanded:top-4">
        <ClientPreview
          draft={preview}
          what={t('thisAnnouncement')}
          note={t('otherAnnouncements')}
        />
      </div>
    </div>
  )
}

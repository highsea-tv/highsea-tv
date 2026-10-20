// SPDX-License-Identifier: AGPL-3.0-only
// What both composers share (docs/product/curation.md): who sees it (audience), when (schedule),
// the status badge, and one-line summaries for the lists.
import { Badge, type BadgeTone, Checkbox, Field, Input, SegmentedControl } from '@highsea/ui-web'
import { useQuery } from '../../mock/hooks.tsx'
import type { Audience, ClientType, CurationStatus, User, UserRole } from '../../mock/types.ts'

// ---------------------------------------------------------------- status

const statusTone: Record<CurationStatus, { label: string; tone: BadgeTone }> = {
  live: { label: 'Live', tone: 'success' },
  scheduled: { label: 'Scheduled', tone: 'info' },
  draft: { label: 'Draft', tone: 'neutral' },
  ended: { label: 'Ended', tone: 'neutral' },
}

export function StatusBadge({ status }: { status: CurationStatus }) {
  const s = statusTone[status]
  return <Badge tone={s.tone}>{s.label}</Badge>
}

// ---------------------------------------------------------------- dates

/**
 * A preview shows its draft as live, whatever its schedule. The preview frame runs its own server
 * on its own clock, so "a minute ago" here could still be the future there: date it well back.
 */
export const LIVE_IN_PREVIEW = { start: '2000-01-01T00:00:00.000Z', end: null }

const pad = (n: number) => String(n).padStart(2, '0')

/** ISO → the value a `datetime-local` input takes, in local time. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export const fromLocalInput = (value: string) => new Date(value).toISOString()

const when = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

/** "Fri 24 Oct, 20:00". */
export const dateTime = (iso: string) => when.format(new Date(iso))

/** "Since Fri 17 Oct · until Thu 30 Oct", "From Mon 20 Oct", "Ended Sun 19 Oct". */
export function scheduleSummary(
  schedule: { start: string; end: string | null },
  status: CurationStatus,
): string {
  const until = schedule.end ? ` · until ${dateTime(schedule.end)}` : ''
  if (status === 'ended') return `Ended ${dateTime(schedule.end ?? schedule.start)}`
  if (status === 'scheduled') return `From ${dateTime(schedule.start)}${until}`
  return `Since ${dateTime(schedule.start)}${until}`
}

// ---------------------------------------------------------------- audience

const roleLabels: Record<UserRole, string> = {
  owner: 'Owners',
  admin: 'Admins',
  user: 'Users',
}

/** The apps an owner can address, in groups a person thinks in. */
export const appGroups: { id: string; label: string; clients: ClientType[] }[] = [
  { id: 'tv', label: 'TVs', clients: ['tvos', 'androidtv', 'webos', 'tizen'] },
  { id: 'phone', label: 'Phones and tablets', clients: ['ios', 'android'] },
  { id: 'web', label: 'Web and desktop', clients: ['web', 'desktop'] },
  { id: 'admin', label: 'The admin', clients: ['admin'] },
]

const list = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`

/** "Everyone", "Owners and admins", "Ruth and Sam", "TVs and phones and tablets". */
export function audienceSummary(audience: Audience, users: User[] = []): string {
  if (audience.kind === 'everyone') return 'Everyone'
  if (audience.kind === 'roles') {
    const s = list(audience.roles.map((r) => roleLabels[r].toLowerCase()))
    return s.charAt(0).toUpperCase() + s.slice(1)
  }
  if (audience.kind === 'users')
    return list(
      audience.userIds.map((id) => users.find((u) => u.id === id)?.displayName ?? 'someone'),
    )
  const groups = appGroups.filter((g) => g.clients.some((c) => audience.clients.includes(c)))
  if (groups.length === appGroups.length) return 'Every app'
  if (groups.length === appGroups.length - 1 && !audience.clients.includes('admin'))
    return 'Every app but the admin'
  // "TVs; phones and tablets": the labels have their own "and"s
  return groups.map((g) => g.label).join('; ')
}

/** Whether a person on one app is in the audience: what the preview's "Preview as" checks. */
export function reaches(audience: Audience, user: User | undefined, client: ClientType): boolean {
  if (audience.kind === 'roles') return !!user && audience.roles.includes(user.role)
  if (audience.kind === 'users') return !!user && audience.userIds.includes(user.id)
  if (audience.kind === 'clients') return audience.clients.includes(client)
  return true
}

export const useUsers = () => useQuery('users', (c) => c.users.list())

function toggle<T>(xs: T[], x: T, on: boolean): T[] {
  return on ? [...xs.filter((y) => y !== x), x] : xs.filter((y) => y !== x)
}

/** Everyone, some roles, some people or some apps. An empty choice is an error the form shows. */
export function AudienceField({
  value,
  onChange,
  error,
}: {
  value: Audience
  onChange: (a: Audience) => void
  error?: string
}) {
  const users = useUsers()
  const choices = (
    items: { id: string; label: string; checked: boolean; on: (c: boolean) => void }[],
  ) => (
    <div className="grid gap-2 rounded-md border border-line bg-s2 p-3 medium:grid-cols-2">
      {items.map((i) => (
        <Field key={i.id} inline label={i.label}>
          <Checkbox checked={i.checked} onCheckedChange={(c) => i.on(c === true)} />
        </Field>
      ))}
    </div>
  )
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1.5 font-medium text-text text-ui">Who sees it</legend>
      <SegmentedControl
        aria-label="Audience"
        size="sm"
        value={value.kind}
        onValueChange={(k) =>
          onChange(
            k === 'roles'
              ? { kind: 'roles', roles: ['owner', 'admin'] }
              : k === 'users'
                ? { kind: 'users', userIds: [] }
                : k === 'clients'
                  ? { kind: 'clients', clients: appGroups[0]?.clients ?? [] }
                  : { kind: 'everyone' },
          )
        }
        options={[
          { value: 'everyone', label: 'Everyone' },
          { value: 'roles', label: 'Roles' },
          { value: 'users', label: 'People' },
          { value: 'clients', label: 'Apps' },
        ]}
        className="justify-self-start"
      />
      {value.kind === 'roles' &&
        choices(
          (Object.keys(roleLabels) as UserRole[]).map((r) => ({
            id: r,
            label: roleLabels[r],
            checked: value.roles.includes(r),
            on: (c) => onChange({ kind: 'roles', roles: toggle(value.roles, r, c) }),
          })),
        )}
      {value.kind === 'users' &&
        choices(
          (users.data ?? [])
            .filter((u) => !u.invited)
            .map((u) => ({
              id: u.id,
              label: u.displayName,
              checked: value.userIds.includes(u.id),
              on: (c) => onChange({ kind: 'users', userIds: toggle(value.userIds, u.id, c) }),
            })),
        )}
      {value.kind === 'clients' &&
        choices(
          appGroups.map((g) => ({
            id: g.id,
            label: g.label,
            checked: g.clients.every((c) => value.clients.includes(c)),
            on: (on) =>
              onChange({
                kind: 'clients',
                clients: on
                  ? [...new Set([...value.clients, ...g.clients])]
                  : value.clients.filter((c) => !g.clients.includes(c)),
              }),
          })),
        )}
      {error && (
        <p role="alert" className="text-badge-danger text-caption">
          {error}
        </p>
      )}
    </fieldset>
  )
}

/** The audience's own error, if it picks nobody. */
export function audienceError(a: Audience): string | undefined {
  if (a.kind === 'roles' && !a.roles.length) return 'Choose at least one role.'
  if (a.kind === 'users' && !a.userIds.length) return 'Choose at least one person.'
  if (a.kind === 'clients' && !a.clients.length) return 'Choose at least one kind of app.'
  return undefined
}

/** Start now or later; end never or at a time. */
export function ScheduleField({
  value,
  onChange,
  now,
}: {
  value: { start: string; end: string | null }
  onChange: (s: { start: string; end: string | null }) => void
  now: number
}) {
  const later = Date.parse(value.start) > now + 60_000
  const endError =
    value.end && Date.parse(value.end) <= Date.parse(value.start)
      ? 'The end has to come after the start.'
      : undefined
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1.5 font-medium text-text text-ui">When</legend>
      <div className="grid gap-3 medium:grid-cols-2">
        <div className="grid content-start gap-2">
          <SegmentedControl
            aria-label="Start"
            size="sm"
            value={later ? 'later' : 'now'}
            onValueChange={(v) =>
              onChange({
                ...value,
                start: new Date(v === 'now' ? now : now + 86_400_000).toISOString(),
              })
            }
            options={[
              { value: 'now', label: 'Start now' },
              { value: 'later', label: 'Start later' },
            ]}
            className="justify-self-start"
          />
          {later && (
            <Field label="Starts">
              <Input
                type="datetime-local"
                value={toLocalInput(value.start)}
                onChange={(e) =>
                  e.target.value && onChange({ ...value, start: fromLocalInput(e.target.value) })
                }
              />
            </Field>
          )}
        </div>
        <div className="grid content-start gap-2">
          <SegmentedControl
            aria-label="End"
            size="sm"
            value={value.end ? 'at' : 'never'}
            onValueChange={(v) =>
              onChange({
                ...value,
                end:
                  v === 'never'
                    ? null
                    : new Date(
                        Math.max(now, Date.parse(value.start)) + 7 * 86_400_000,
                      ).toISOString(),
              })
            }
            options={[
              { value: 'never', label: 'No end' },
              { value: 'at', label: 'End at' },
            ]}
            className="justify-self-start"
          />
          {value.end && (
            <Field label="Ends" error={endError}>
              <Input
                type="datetime-local"
                value={toLocalInput(value.end)}
                onChange={(e) =>
                  e.target.value && onChange({ ...value, end: fromLocalInput(e.target.value) })
                }
              />
            </Field>
          )}
        </div>
      </div>
    </fieldset>
  )
}

// SPDX-License-Identifier: AGPL-3.0-only
// A13 Users and devices (docs/product/users-devices.md): who can sign in and what they can do
// (role, permissions, libraries), invites by link, every signed-in device with sign-out, and API
// keys for scripts, shown once.
import {
  Badge,
  type BadgeTone,
  Button,
  Checkbox,
  ConfirmDialog,
  Dialog,
  DialogContent,
  Field,
  Icon,
  type IconName,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  SegmentedControl,
  Select,
  Sheet,
  SheetContent,
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
  toast,
} from '@highsea/ui-web'
import { useState } from 'react'
import { useAction, useNow, useQuery } from '../../mock/hooks.tsx'
import type {
  ApiKey,
  ClientType,
  CreatedApiKey,
  Device,
  Invite,
  InviteInput,
  Permission,
  User,
  UserRole,
} from '../../mock/types.ts'
import { relative } from '../format.ts'
import { Loadable } from '../loadable.tsx'
import { AreaPage } from './settings.tsx'

export const roleInfo: Record<UserRole, { label: string; tone: BadgeTone; hint: string }> = {
  owner: { label: 'Owner', tone: 'accent', hint: 'Everything, including handing the server over.' },
  admin: { label: 'Admin', tone: 'info', hint: 'Runs the server: settings, indexers, users.' },
  member: { label: 'Member', tone: 'neutral', hint: 'Watches, requests and manages the library.' },
  restricted: {
    label: 'Restricted',
    tone: 'warning',
    hint: 'Watches the libraries you choose. Good for children.',
  },
}

const permissionInfo: { id: Permission; label: string; hint: string }[] = [
  { id: 'request', label: 'Ask for titles', hint: 'From Discover, for you to approve.' },
  {
    id: 'autoApprove',
    label: 'Approve their own requests',
    hint: 'Their requests skip the queue.',
  },
  { id: 'download', label: 'Download for offline', hint: 'Phones and laptops keep a copy.' },
  { id: 'manageLibrary', label: 'Manage the library', hint: 'Add, edit and delete movies.' },
  { id: 'manageUsers', label: 'Manage people', hint: 'Invite, edit and remove users.' },
]

const roleDefaults: Record<Exclude<UserRole, 'owner'>, Permission[]> = {
  admin: ['request', 'autoApprove', 'download', 'manageLibrary'],
  member: ['request'],
  restricted: [],
}

const clientInfo: Record<ClientType, { label: string; icon: IconName }> = {
  admin: { label: 'Admin in a browser', icon: 'laptop' },
  web: { label: 'Web', icon: 'laptop' },
  desktop: { label: 'Desktop app', icon: 'laptop' },
  ios: { label: 'iPhone and iPad', icon: 'phone' },
  android: { label: 'Android', icon: 'phone' },
  tvos: { label: 'Apple TV', icon: 'tv' },
  androidtv: { label: 'Android TV', icon: 'tv' },
  webos: { label: 'LG TV', icon: 'tv' },
  tizen: { label: 'Samsung TV', icon: 'tv' },
}

/** "Just now" within a minute, then "3h ago". */
const seen = (iso: string, now: number) =>
  Math.abs(now - Date.parse(iso)) < 60_000 ? 'Just now' : relative(iso, now)

/** The browser this admin runs in: it can't sign itself out from here. */
const THIS_DEVICE = 'd-admin'

type Tab = 'users' | 'devices' | 'keys'

export function UsersDevices() {
  const [tab, setTab] = useState<Tab>('users')
  const [inviting, setInviting] = useState(false)
  const [creating, setCreating] = useState(false)
  return (
    <AreaPage
      id="users"
      actions={
        tab === 'users' ? (
          <Button variant="primary" icon="add" onClick={() => setInviting(true)}>
            Invite someone
          </Button>
        ) : tab === 'keys' ? (
          <Button variant="primary" icon="add" onClick={() => setCreating(true)}>
            New API key
          </Button>
        ) : null
      }
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} variant="line">
        <TabsList aria-label="Users and devices sections">
          <TabsTrigger value="users">People</TabsTrigger>
          <TabsTrigger value="devices">Devices</TabsTrigger>
          <TabsTrigger value="keys">API keys</TabsTrigger>
        </TabsList>
        <TabsContent value="users" className="pt-5">
          <People />
        </TabsContent>
        <TabsContent value="devices" className="pt-5">
          <Devices />
        </TabsContent>
        <TabsContent value="keys" className="pt-5">
          <Keys />
        </TabsContent>
      </Tabs>
      <InviteDialog open={inviting} onOpenChange={setInviting} />
      <NewKeyDialog open={creating} onOpenChange={setCreating} />
    </AreaPage>
  )
}

const usePeople = () => useQuery('settings:users', (c) => c.users.list(), ['users.updated'])

// ---------------------------------------------------------------- people

function Avatar({ user }: { user: Pick<User, 'displayName'> }) {
  return (
    <span
      aria-hidden
      className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft font-semibold text-accent-text text-ui"
    >
      {user.displayName.charAt(0)}
    </span>
  )
}

const libraryLabel = (u: User) => (u.libraries === 'all' ? 'All libraries' : 'Movies')

function People() {
  const people = usePeople()
  const now = useNow()
  const [editing, setEditing] = useState<User | null>(null)
  const [removing, setRemoving] = useState<User | null>(null)
  const remove = useAction((c, id: string) => c.users.remove(id))
  const reset = useAction((c, id: string) => c.users.resetPassword(id))
  return (
    <Loadable query={people} what="the people on this server">
      {(users) => (
        <TableFrame>
          <TableToolbar>
            <span className="text-caption text-text-3">
              {users.filter((u) => !u.invited).length} people
              {users.some((u) => u.invited) &&
                ` · ${users.filter((u) => u.invited).length} invited`}
            </span>
          </TableToolbar>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Libraries</TableHead>
                <TableHead>Two-step</TableHead>
                <TableHead>Last seen</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <span className="flex items-center gap-2.5">
                      <Avatar user={u} />
                      <span className="grid">
                        <span className="text-text">{u.displayName}</span>
                        <span className="font-mono text-figure text-text-3">@{u.username}</span>
                      </span>
                      {u.invited && <Badge tone="info">Invited</Badge>}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge tone={roleInfo[u.role].tone}>{roleInfo[u.role].label}</Badge>
                  </TableCell>
                  <TableCell className="text-text-2">{libraryLabel(u)}</TableCell>
                  <TableCell className="text-text-2">
                    {u.invited ? '—' : u.twoFactor ? 'On' : 'Off'}
                  </TableCell>
                  <TableCell className="text-text-2">
                    {u.invited ? 'Hasn’t joined yet' : u.lastSeen ? seen(u.lastSeen, now) : 'Never'}
                  </TableCell>
                  <TableCell className="text-end">
                    <span className="flex justify-end gap-1">
                      {u.role !== 'owner' && (
                        <Button
                          size="sm"
                          icon="edit"
                          aria-label={`Edit ${u.displayName}`}
                          onClick={() => setEditing(u)}
                        >
                          Edit
                        </Button>
                      )}
                      {u.role !== 'owner' && (
                        <Menu>
                          <MenuTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              iconOnly
                              icon="more"
                              aria-label={`More for ${u.displayName}`}
                            />
                          </MenuTrigger>
                          <MenuContent align="end">
                            {u.invited ? (
                              <MenuItem
                                icon="copy"
                                onSelect={() =>
                                  toast({
                                    title: 'Invite link copied',
                                    description: `Send it to ${u.displayName}. It works for 7 days.`,
                                  })
                                }
                              >
                                Copy the invite link
                              </MenuItem>
                            ) : (
                              <MenuItem
                                icon="lock"
                                onSelect={() =>
                                  reset.run(u.id).then(() =>
                                    toast({
                                      title: `Reset link sent to ${u.displayName}`,
                                      description: 'Their devices stay signed in.',
                                    }),
                                  )
                                }
                              >
                                Send a password reset
                              </MenuItem>
                            )}
                            <MenuItem icon="delete" danger onSelect={() => setRemoving(u)}>
                              {u.invited ? 'Cancel the invite' : 'Remove'}
                            </MenuItem>
                          </MenuContent>
                        </Menu>
                      )}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {editing && (
            <EditSheet key={editing.id} user={editing} onClose={() => setEditing(null)} />
          )}
          <ConfirmDialog
            open={!!removing}
            onOpenChange={(o) => !o && setRemoving(null)}
            title={
              removing?.invited
                ? `Cancel ${removing.displayName}’s invite?`
                : `Remove ${removing?.displayName}?`
            }
            description={
              removing?.invited
                ? 'The link stops working. You can invite them again later.'
                : 'They’re signed out everywhere and can’t sign back in. Their watch history goes with them.'
            }
            confirmLabel={removing?.invited ? 'Cancel invite' : 'Remove'}
            cancelLabel="Keep"
            destructive
            onConfirm={() => {
              const u = removing
              if (!u) return
              remove
                .run(u.id)
                .then(() =>
                  toast({ title: `${u.displayName} ${u.invited ? 'uninvited' : 'removed'}` }),
                )
                .catch((e: Error) =>
                  toast.error('Couldn’t remove them', { description: e.message }),
                )
            }}
          />
        </TableFrame>
      )}
    </Loadable>
  )
}

function RoleField({
  value,
  onChange,
}: {
  value: Exclude<UserRole, 'owner'>
  onChange: (r: Exclude<UserRole, 'owner'>) => void
}) {
  return (
    <Field label="Role" hint={roleInfo[value].hint}>
      <Select
        value={value}
        onValueChange={(v) => onChange(v as Exclude<UserRole, 'owner'>)}
        options={(['admin', 'member', 'restricted'] as const).map((r) => ({
          value: r,
          label: roleInfo[r].label,
        }))}
      />
    </Field>
  )
}

function LibrariesField({
  value,
  onChange,
}: {
  value: 'all' | string[]
  onChange: (v: 'all' | string[]) => void
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 font-medium text-text text-ui">Libraries</legend>
      <SegmentedControl
        aria-label="Libraries"
        size="sm"
        value={value === 'all' ? 'all' : 'some'}
        onValueChange={(v) => onChange(v === 'all' ? 'all' : ['movies'])}
        options={[
          { value: 'all', label: 'All, now and later' },
          { value: 'some', label: 'Choose' },
        ]}
        className="justify-self-start"
      />
      {value !== 'all' && (
        <div className="grid gap-2 rounded-md border border-line bg-s2 p-3">
          <Field inline label="Movies">
            <Checkbox
              checked={value.includes('movies')}
              onCheckedChange={(c) =>
                onChange(c === true ? [...value, 'movies'] : value.filter((x) => x !== 'movies'))
              }
            />
          </Field>
          <p className="text-caption text-text-3">
            TV shows, music and books join this list when the server has them.
          </p>
        </div>
      )}
    </fieldset>
  )
}

function EditSheet({ user, onClose }: { user: User; onClose: () => void }) {
  const [draft, setDraft] = useState({
    role: user.role as Exclude<UserRole, 'owner'>,
    permissions: user.permissions,
    libraries: user.libraries,
  })
  const save = useAction((c, d: typeof draft) => c.users.update(user.id, d))
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" title={user.displayName} description={`@${user.username}`}>
        <div className="grid gap-5">
          <RoleField
            value={draft.role}
            onChange={(role) => setDraft({ ...draft, role, permissions: roleDefaults[role] })}
          />
          <fieldset className="grid gap-2.5">
            <legend className="mb-1 font-medium text-text text-ui">What they can do</legend>
            {permissionInfo.map((p) => (
              <Field key={p.id} inline label={p.label} hint={p.hint}>
                <Checkbox
                  checked={draft.permissions.includes(p.id)}
                  onCheckedChange={(c) =>
                    setDraft({
                      ...draft,
                      permissions:
                        c === true
                          ? [...draft.permissions, p.id]
                          : draft.permissions.filter((x) => x !== p.id),
                    })
                  }
                />
              </Field>
            ))}
            <p className="text-caption text-text-3">
              Changing the role resets these to the role’s defaults.
            </p>
          </fieldset>
          <LibrariesField
            value={draft.libraries}
            onChange={(libraries) => setDraft({ ...draft, libraries })}
          />
          <div className="flex gap-2">
            <Button
              variant="primary"
              loading={save.pending}
              disabled={Array.isArray(draft.libraries) && !draft.libraries.length}
              onClick={() =>
                save
                  .run(draft)
                  .then(() => {
                    toast.success(`${user.displayName} updated`, {
                      description: 'It applies the next time their apps check in.',
                    })
                    onClose()
                  })
                  .catch((e: Error) => toast.error('Couldn’t save', { description: e.message }))
              }
            >
              Save
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function InviteDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const blank: InviteInput = { displayName: '', email: null, role: 'member', libraries: 'all' }
  const [draft, setDraft] = useState(blank)
  const [sent, setSent] = useState<Invite | null>(null)
  const [tried, setTried] = useState(false)
  const invite = useAction((c, d: InviteInput) => c.users.invite(d))
  const close = (o: boolean) => {
    onOpenChange(o)
    if (!o) {
      setDraft(blank)
      setSent(null)
      setTried(false)
    }
  }
  const nameError = tried && !draft.displayName.trim() ? 'Give them a name.' : undefined
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        size="sm"
        title={sent ? `${sent.user.displayName} is invited` : 'Invite someone'}
        description={
          sent
            ? 'Send them this link. It works once, for 7 days, and lets them choose a password.'
            : 'They get a link to finish their account. Nothing is visible to them until they do.'
        }
        footer={
          sent ? (
            <Button variant="primary" onClick={() => close(false)}>
              Done
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                loading={invite.pending}
                onClick={() => {
                  setTried(true)
                  if (!draft.displayName.trim()) return
                  invite
                    .run(draft)
                    .then(setSent)
                    .catch((e: Error) =>
                      toast.error('Couldn’t invite them', { description: e.message }),
                    )
                }}
              >
                {draft.email ? 'Send invite' : 'Create invite link'}
              </Button>
            </>
          )
        }
      >
        {sent ? (
          <div className="grid gap-2">
            <code className="break-all rounded-md bg-s2 p-3 font-mono text-figure text-text">
              {sent.link}
            </code>
            <Button
              icon="copy"
              className="justify-self-start"
              onClick={() => {
                navigator.clipboard?.writeText(sent.link).catch(() => {})
                toast({ title: 'Link copied' })
              }}
            >
              Copy link
            </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            <Field label="Name" hint="As the household knows them." error={nameError}>
              <Input
                value={draft.displayName}
                onChange={(e) => setDraft({ ...draft, displayName: e.target.value })}
              />
            </Field>
            <Field label="Email" hint="Optional. Leave it empty to share a link yourself.">
              <Input
                type="email"
                value={draft.email ?? ''}
                onChange={(e) => setDraft({ ...draft, email: e.target.value || null })}
              />
            </Field>
            <RoleField value={draft.role} onChange={(role) => setDraft({ ...draft, role })} />
            <LibrariesField
              value={draft.libraries}
              onChange={(libraries) => setDraft({ ...draft, libraries })}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------- devices

function Devices() {
  const devices = useQuery('settings:devices', (c) => c.devices.list(), ['users.updated'])
  const people = usePeople()
  const now = useNow()
  const [who, setWho] = useState('all')
  const [revoking, setRevoking] = useState<Device | null>(null)
  const revoke = useAction((c, id: string) => c.devices.revoke(id))
  const name = (id: string) => people.data?.find((u) => u.id === id)?.displayName ?? 'Someone'
  return (
    <Loadable query={devices} what="the devices">
      {(ds) => {
        const shown = (who === 'all' ? ds : ds.filter((d) => d.userId === who)).sort(
          (a, b) => Date.parse(b.lastSeen) - Date.parse(a.lastSeen),
        )
        return (
          <TableFrame>
            <TableToolbar>
              <Select
                aria-label="Whose devices"
                value={who}
                onValueChange={setWho}
                options={[
                  { value: 'all', label: 'Everyone’s devices' },
                  ...(people.data ?? [])
                    .filter((u) => !u.invited)
                    .map((u) => ({ value: u.id, label: `${u.displayName}’s` })),
                ]}
                className="w-56"
              />
              <span className="ms-auto text-caption text-text-3">
                Signing a device out makes it ask for a new code or password.
              </span>
            </TableToolbar>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device</TableHead>
                  <TableHead>Person</TableHead>
                  <TableHead>App</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Last seen</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <span className="flex items-center gap-2.5">
                        <Icon name={clientInfo[d.client].icon} size={16} className="text-text-3" />
                        <span className="text-text">{d.name}</span>
                        {d.id === THIS_DEVICE && <Badge tone="accent">This browser</Badge>}
                      </span>
                    </TableCell>
                    <TableCell className="text-text-2">{name(d.userId)}</TableCell>
                    <TableCell className="text-text-2">
                      {clientInfo[d.client].label} ·{' '}
                      <span className="font-mono text-figure">{d.appVersion}</span>
                    </TableCell>
                    <TableCell className="font-mono text-figure text-text-2">{d.address}</TableCell>
                    <TableCell className="text-text-2">{seen(d.lastSeen, now)}</TableCell>
                    <TableCell className="text-end">
                      {d.id !== THIS_DEVICE && (
                        <Button
                          size="sm"
                          icon="sign-out"
                          aria-label={`Sign out ${d.name}`}
                          onClick={() => setRevoking(d)}
                        >
                          Sign out
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <ConfirmDialog
              open={!!revoking}
              onOpenChange={(o) => !o && setRevoking(null)}
              title={`Sign out ${revoking?.name}?`}
              description={`It stops working at once. ${revoking && name(revoking.userId)} signs in again with a code or a password.`}
              confirmLabel="Sign out"
              destructive
              onConfirm={() => {
                const d = revoking
                if (d) revoke.run(d.id).then(() => toast({ title: `${d.name} signed out` }))
              }}
            />
          </TableFrame>
        )
      }}
    </Loadable>
  )
}

// ---------------------------------------------------------------- API keys

function Keys() {
  const keys = useQuery('settings:keys', (c) => c.apiKeys.list(), ['users.updated'])
  const now = useNow()
  const [revoking, setRevoking] = useState<ApiKey | null>(null)
  const revoke = useAction((c, id: string) => c.apiKeys.revoke(id))
  return (
    <Loadable query={keys} what="the API keys">
      {(ks) =>
        ks.length === 0 ? (
          <p className="rounded-lg border border-line bg-s1 p-6 text-center text-caption text-text-3">
            No API keys. Make one for a script or another app that talks to the server.
          </p>
        ) : (
          <ul aria-label="API keys" className="grid gap-2">
            {ks.map((k) => (
              <li
                key={k.id}
                className="grid gap-2 rounded-lg border border-line bg-s1 p-4 medium:grid-cols-[minmax(0,1fr)_auto] medium:items-center"
              >
                <div className="grid gap-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <Icon name="key" size={16} className="text-text-3" />
                    <span className="font-semibold text-text text-ui">{k.name}</span>
                    <Badge tone={k.scope === 'full' ? 'warning' : 'neutral'}>
                      {k.scope === 'full' ? 'Full access' : 'Read only'}
                    </Badge>
                  </p>
                  <p className="text-caption text-text-3">
                    <span className="font-mono text-figure">{k.prefix}…</span> · made{' '}
                    {relative(k.createdAt, now)} ·{' '}
                    {k.lastUsed ? `last used ${seen(k.lastUsed, now)}` : 'never used'}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="danger"
                  className="justify-self-start medium:justify-self-end"
                  aria-label={`Revoke ${k.name}`}
                  onClick={() => setRevoking(k)}
                >
                  Revoke
                </Button>
              </li>
            ))}
            <ConfirmDialog
              open={!!revoking}
              onOpenChange={(o) => !o && setRevoking(null)}
              title={`Revoke ${revoking?.name}?`}
              description="Anything using it stops working at once. You can’t undo this; make a new key instead."
              confirmLabel="Revoke"
              destructive
              onConfirm={() => {
                const k = revoking
                if (k) revoke.run(k.id).then(() => toast({ title: `${k.name} revoked` }))
              }}
            />
          </ul>
        )
      }
    </Loadable>
  )
}

function NewKeyDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [name, setName] = useState('')
  const [scope, setScope] = useState<ApiKey['scope']>('read')
  const [made, setMade] = useState<CreatedApiKey | null>(null)
  const create = useAction((c, n: string, s: ApiKey['scope']) => c.apiKeys.create(n, s))
  const close = (o: boolean) => {
    onOpenChange(o)
    if (!o) {
      setName('')
      setScope('read')
      setMade(null)
    }
  }
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        size="sm"
        title={made ? 'Copy your key now' : 'New API key'}
        description={
          made
            ? 'This is the only time it shows. Store it where the script can read it.'
            : 'For a script or another app. Each one gets its own, so you can revoke it alone.'
        }
        footer={
          made ? (
            <Button variant="primary" onClick={() => close(false)}>
              I’ve copied it
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                loading={create.pending}
                disabled={!name.trim()}
                onClick={() => create.run(name, scope).then(setMade)}
              >
                Make key
              </Button>
            </>
          )
        }
      >
        {made ? (
          <div className="grid gap-2">
            <code className="break-all rounded-md bg-s2 p-3 font-mono text-figure text-text">
              {made.secret}
            </code>
            <Button
              icon="copy"
              className="justify-self-start"
              onClick={() => {
                navigator.clipboard?.writeText(made.secret).catch(() => {})
                toast({ title: 'Key copied' })
              }}
            >
              Copy key
            </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            <Field label="Name" hint="After what will use it: Home Assistant, a backup script.">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Access">
              <Select
                value={scope}
                onValueChange={(v) => setScope(v as ApiKey['scope'])}
                options={[
                  { value: 'read', label: 'Read only: see the library, queue and status' },
                  { value: 'full', label: 'Full access: everything an admin can do' },
                ]}
              />
            </Field>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

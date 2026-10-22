'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// A13 Users and devices (docs/product/users-devices.md), ported from the prototype: who can sign
// in and what they can do (role, and a user's permissions and libraries), invites by link, every
// signed-in device with sign-out, and API keys for scripts, shown once. Managing people is the
// owner's; admins see people and devices read-only (ADR 0032). Invite and reset links are always
// shown to copy, and also emailed when the server's mail is set up in Connections (checkpoint 8b).
import type { ApiKey, Device, User } from '@highsea/api-contract'
import { useT } from '@highsea/i18n/react'
import { useAction, useQuery } from '@highsea/sdk/react'
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
import { Loadable } from './loadable.tsx'
import { AreaPage } from './settings.tsx'
import { useRelative } from './time.ts'
import { users as messages } from './users-messages.ts'

type Role = User['role']
type Permission = User['permissions'][number]
type ClientType = Device['client']
type Invitable = Exclude<Role, 'owner'>
type InviteInput = Pick<User, 'displayName' | 'email' | 'libraries'> & { role: Invitable }
type CreatedKey = ApiKey & { secret: string }
type Link = { link: string; expiresAt: string; emailedTo?: string | null }

const roleTone: Record<Role, BadgeTone> = {
  owner: 'accent',
  admin: 'info',
  user: 'neutral',
}

/** A user's permissions. Staff hold every power by their role, so they have none to tick. */
const permissions = ['request', 'download'] as const satisfies Permission[]

/** The server's defaults (packages/auth/src/roles.ts), shown as soon as the role changes. */
const roleDefaults: Record<Invitable, Permission[]> = { admin: [], user: ['request'] }

const clientIcon: Record<ClientType, IconName> = {
  admin: 'laptop',
  web: 'laptop',
  desktop: 'laptop',
  ios: 'phone',
  android: 'phone',
  tvos: 'tv',
  androidtv: 'tv',
  webos: 'tv',
  tizen: 'tv',
}

type Tab = 'users' | 'devices' | 'keys'

const useSession = () => useQuery('session', (c) => c.auth.session(), ['users.updated'])
/** Managing people is the owner's alone; admins see this area read-only. */
const useOwner = () => useSession().data?.user.role === 'owner'
const usePeople = () => useQuery('settings:users', (c) => c.users.list(), ['users.updated'])

export function Users() {
  const t = useT(messages)
  const [tab, setTab] = useState<Tab>('users')
  const [inviting, setInviting] = useState(false)
  const [creating, setCreating] = useState(false)
  const owner = useOwner()
  return (
    <AreaPage
      id="users"
      actions={
        tab === 'users' ? (
          owner && (
            <Button variant="primary" icon="add" onClick={() => setInviting(true)}>
              {t('invite')}
            </Button>
          )
        ) : tab === 'keys' ? (
          <Button variant="primary" icon="add" onClick={() => setCreating(true)}>
            {t('newKey')}
          </Button>
        ) : null
      }
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} variant="line">
        <TabsList aria-label={t('sections')}>
          <TabsTrigger value="users">{t('tab.people')}</TabsTrigger>
          <TabsTrigger value="devices">{t('tab.devices')}</TabsTrigger>
          <TabsTrigger value="keys">{t('tab.keys')}</TabsTrigger>
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
      {owner && <InviteDialog open={inviting} onOpenChange={setInviting} />}
      <NewKeyDialog open={creating} onOpenChange={setCreating} />
    </AreaPage>
  )
}

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

/** A secret link to pass on, with a copy button: an invite or a reset. */
function Secret({ value, label, copied }: { value: string; label: string; copied: string }) {
  return (
    <div className="grid gap-2">
      <code className="break-all rounded-md bg-s2 p-3 font-mono text-figure text-text">
        {value}
      </code>
      <Button
        icon="copy"
        className="justify-self-start"
        onClick={() =>
          navigator.clipboard?.writeText(value).then(
            () => toast({ title: copied }),
            () => {},
          )
        }
      >
        {label}
      </Button>
    </div>
  )
}

function LinkDialog({
  shown,
  onClose,
}: {
  shown: { kind: 'invite' | 'reset'; name: string; link: Link } | null
  onClose: () => void
}) {
  const t = useT(messages)
  const { relative } = useRelative()
  return (
    <Dialog open={!!shown} onOpenChange={(o) => !o && onClose()}>
      {shown && (
        <DialogContent
          size="sm"
          title={
            shown.kind === 'invite'
              ? t('link.inviteTitle', { name: shown.name })
              : t('link.resetTitle', { name: shown.name })
          }
          description={
            shown.kind === 'invite'
              ? t('link.inviteBody', { when: relative(shown.link.expiresAt) })
              : t('link.resetBody', { when: relative(shown.link.expiresAt) })
          }
          footer={
            <Button variant="primary" onClick={onClose}>
              {t('done')}
            </Button>
          }
        >
          <div className="grid gap-3">
            <Secret value={shown.link.link} label={t('link.copy')} copied={t('link.copied')} />
            {shown.link.emailedTo && (
              <p className="text-caption text-text-2">
                {t('link.emailed', { email: shown.link.emailedTo })}
              </p>
            )}
          </div>
        </DialogContent>
      )}
    </Dialog>
  )
}

function People() {
  const t = useT(messages)
  const people = usePeople()
  const session = useSession()
  const { seen } = useRelative()
  const [editing, setEditing] = useState<User | null>(null)
  const [removing, setRemoving] = useState<User | null>(null)
  const [unsetting, setUnsetting] = useState<User | null>(null)
  const [shown, setShown] = useState<{
    kind: 'invite' | 'reset'
    name: string
    link: Link
  } | null>(null)
  const remove = useAction((c, id: string) => c.users.remove({ params: { id } }))
  const reset = useAction((c, id: string) => c.users.resetPassword({ params: { id } }))
  const inviteLink = useAction((c, id: string) => c.users.inviteLink({ params: { id } }))
  const resetTwoStep = useAction((c, id: string) => c.users.resetTwoFactor({ params: { id } }))
  const me = session.data?.user.id
  const owner = useOwner()
  // the owner manages everyone else (ADR 0032)
  const manages = (u: User) => owner && u.role !== 'owner' && u.id !== me

  const showLink = (kind: 'invite' | 'reset', u: User) =>
    (kind === 'invite' ? inviteLink : reset).run(u.id).then(
      (link: Link) => setShown({ kind, name: u.displayName, link }),
      (e: Error) => toast.error(t('people.linkFailed'), { description: e.message }),
    )

  return (
    <Loadable query={people} what={t('people.what')}>
      {(users) => {
        const invited = users.filter((u) => u.invited).length
        return (
          <TableFrame>
            <TableToolbar>
              <span className="text-caption text-text-3">
                {t('people.count', { count: users.length - invited })}
                {invited > 0 && ` · ${t('people.invited', { count: invited })}`}
              </span>
              {!owner && (
                <span className="ms-auto text-caption text-text-3">{t('people.readOnly')}</span>
              )}
            </TableToolbar>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('people.person')}</TableHead>
                  <TableHead>{t('people.role')}</TableHead>
                  <TableHead>{t('people.libraries')}</TableHead>
                  <TableHead>{t('people.twoStep')}</TableHead>
                  <TableHead>{t('people.lastSeen')}</TableHead>
                  {owner && (
                    <TableHead>
                      <span className="sr-only">{t('people.actions')}</span>
                    </TableHead>
                  )}
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
                        {u.invited && <Badge tone="info">{t('people.invitedBadge')}</Badge>}
                        {u.id === me && <Badge tone="accent">{t('people.you')}</Badge>}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge tone={roleTone[u.role]}>{t(`role.${u.role}`)}</Badge>
                    </TableCell>
                    <TableCell className="text-text-2">
                      {u.libraries === 'all' ? t('people.allLibraries') : t('people.movies')}
                    </TableCell>
                    <TableCell className="text-text-2">
                      {u.invited ? '—' : u.twoFactor ? t('people.on') : t('people.off')}
                    </TableCell>
                    <TableCell className="text-text-2">
                      {u.invited
                        ? t('people.notJoined')
                        : u.lastSeen
                          ? seen(u.lastSeen)
                          : t('people.never')}
                    </TableCell>
                    {owner && (
                      <TableCell className="text-end">
                        {manages(u) && (
                          <span className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              icon="edit"
                              aria-label={t('people.editLabel', { name: u.displayName })}
                              onClick={() => setEditing(u)}
                            >
                              {t('people.edit')}
                            </Button>
                            <Menu>
                              <MenuTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  iconOnly
                                  icon="more"
                                  aria-label={t('people.more', { name: u.displayName })}
                                />
                              </MenuTrigger>
                              <MenuContent align="end">
                                {u.invited ? (
                                  <MenuItem icon="copy" onSelect={() => showLink('invite', u)}>
                                    {t('people.copyInvite')}
                                  </MenuItem>
                                ) : (
                                  <MenuItem icon="lock" onSelect={() => showLink('reset', u)}>
                                    {t('people.reset')}
                                  </MenuItem>
                                )}
                                {u.twoFactor && (
                                  <MenuItem icon="shield" onSelect={() => setUnsetting(u)}>
                                    {t('people.resetTwoStep')}
                                  </MenuItem>
                                )}
                                <MenuItem icon="delete" danger onSelect={() => setRemoving(u)}>
                                  {u.invited ? t('people.cancelInvite') : t('people.remove')}
                                </MenuItem>
                              </MenuContent>
                            </Menu>
                          </span>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {editing && (
              <EditSheet key={editing.id} user={editing} onClose={() => setEditing(null)} />
            )}
            <LinkDialog shown={shown} onClose={() => setShown(null)} />
            <ConfirmDialog
              open={!!unsetting}
              onOpenChange={(o) => !o && setUnsetting(null)}
              title={t('people.resetTwoStepTitle', { name: unsetting?.displayName ?? '' })}
              description={t('people.resetTwoStepBody')}
              confirmLabel={t('people.resetTwoStep')}
              cancelLabel={t('people.resetTwoStepKeep')}
              destructive
              onConfirm={() => {
                const u = unsetting
                if (!u) return
                resetTwoStep.run(u.id).then(
                  () => toast({ title: t('people.twoStepReset', { name: u.displayName }) }),
                  (e: Error) =>
                    toast.error(t('people.twoStepResetFailed'), { description: e.message }),
                )
              }}
            />
            <ConfirmDialog
              open={!!removing}
              onOpenChange={(o) => !o && setRemoving(null)}
              title={
                removing?.invited
                  ? t('people.uninviteTitle', { name: removing.displayName })
                  : t('people.removeTitle', { name: removing?.displayName ?? '' })
              }
              description={removing?.invited ? t('people.uninviteBody') : t('people.removeBody')}
              confirmLabel={removing?.invited ? t('people.cancelInvite') : t('people.remove')}
              cancelLabel={t('keep')}
              destructive
              onConfirm={() => {
                const u = removing
                if (!u) return
                remove.run(u.id).then(
                  () =>
                    toast({
                      title: u.invited
                        ? t('people.uninvited', { name: u.displayName })
                        : t('people.removed', { name: u.displayName }),
                    }),
                  (e: Error) => toast.error(t('people.removeFailed'), { description: e.message }),
                )
              }}
            />
          </TableFrame>
        )
      }}
    </Loadable>
  )
}

function RoleField({ value, onChange }: { value: Invitable; onChange: (r: Invitable) => void }) {
  const t = useT(messages)
  const roles: Invitable[] = ['admin', 'user']
  return (
    <Field label={t('edit.role')} hint={t(`role.${value}.hint`)}>
      <Select
        value={value}
        onValueChange={(v) => onChange(v as Invitable)}
        options={roles.map((r) => ({ value: r, label: t(`role.${r}`) }))}
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
  const t = useT(messages)
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 font-medium text-text text-ui">{t('edit.libraries')}</legend>
      <SegmentedControl
        aria-label={t('edit.libraries')}
        size="sm"
        value={value === 'all' ? 'all' : 'some'}
        onValueChange={(v) => onChange(v === 'all' ? 'all' : ['movies'])}
        options={[
          { value: 'all', label: t('edit.allLibraries') },
          { value: 'some', label: t('edit.choose') },
        ]}
        className="justify-self-start"
      />
      {value !== 'all' && (
        <div className="grid gap-2 rounded-md border border-line bg-s2 p-3">
          <Field inline label={t('people.movies')}>
            <Checkbox
              checked={value.includes('movies')}
              onCheckedChange={(c) =>
                onChange(c === true ? [...value, 'movies'] : value.filter((x) => x !== 'movies'))
              }
            />
          </Field>
          <p className="text-caption text-text-3">{t('edit.more')}</p>
        </div>
      )}
    </fieldset>
  )
}

function EditSheet({ user, onClose }: { user: User; onClose: () => void }) {
  const t = useT(messages)
  const [draft, setDraft] = useState({
    role: user.role as Invitable,
    permissions: user.permissions,
    libraries: user.libraries,
  })
  // staff hold every power and see every library: what they can do is a user's alone
  const isUser = draft.role === 'user'
  const save = useAction((c, d: typeof draft) =>
    c.users.update({ params: { id: user.id }, body: d }),
  )
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" title={user.displayName} description={`@${user.username}`}>
        <div className="grid gap-5">
          <RoleField
            value={draft.role}
            onChange={(role) =>
              setDraft({
                ...draft,
                role,
                permissions: roleDefaults[role],
                libraries: role === 'admin' ? 'all' : draft.libraries,
              })
            }
          />
          {user.role === 'admin' && isUser && (
            <p className="text-caption text-text-3">{t('edit.demote')}</p>
          )}
          {isUser && (
            <fieldset className="grid gap-2.5">
              <legend className="mb-1 font-medium text-text text-ui">{t('edit.can')}</legend>
              {permissions.map((p) => (
                <Field key={p} inline label={t(`permission.${p}`)} hint={t(`permission.${p}.hint`)}>
                  <Checkbox
                    checked={draft.permissions.includes(p)}
                    onCheckedChange={(c) =>
                      setDraft({
                        ...draft,
                        permissions:
                          c === true
                            ? [...draft.permissions, p]
                            : draft.permissions.filter((x) => x !== p),
                      })
                    }
                  />
                </Field>
              ))}
              <p className="text-caption text-text-3">{t('edit.resets')}</p>
            </fieldset>
          )}
          {isUser && (
            <LibrariesField
              value={draft.libraries}
              onChange={(libraries) => setDraft({ ...draft, libraries })}
            />
          )}
          <div className="flex gap-2">
            <Button
              variant="primary"
              loading={save.pending}
              disabled={Array.isArray(draft.libraries) && !draft.libraries.length}
              onClick={() =>
                save.run(draft).then(
                  () => {
                    toast.success(t('edit.saved', { name: user.displayName }), {
                      description: t('edit.savedBody'),
                    })
                    onClose()
                  },
                  (e: Error) => toast.error(t('edit.failed'), { description: e.message }),
                )
              }
            >
              {t('save')}
            </Button>
            <Button variant="ghost" onClick={onClose}>
              {t('cancel')}
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
  const t = useT(messages)
  const blank: InviteInput = { displayName: '', email: null, role: 'user', libraries: 'all' }
  const [draft, setDraft] = useState(blank)
  const [sent, setSent] = useState<{
    name: string
    link: string
    emailedTo?: string | null
  } | null>(null)
  const [tried, setTried] = useState(false)
  const invite = useAction((c, d: InviteInput) => c.users.invite({ body: d }))
  const close = (o: boolean) => {
    onOpenChange(o)
    if (!o) {
      setDraft(blank)
      setSent(null)
      setTried(false)
    }
  }
  const nameError = tried && !draft.displayName.trim() ? t('invite.nameMissing') : undefined
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        size="sm"
        title={sent ? t('invite.sentTitle', { name: sent.name }) : t('invite.title')}
        description={sent ? t('invite.sentBody') : t('invite.body')}
        footer={
          sent ? (
            <Button variant="primary" onClick={() => close(false)}>
              {t('done')}
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => close(false)}>
                {t('cancel')}
              </Button>
              <Button
                variant="primary"
                loading={invite.pending}
                onClick={() => {
                  setTried(true)
                  if (!draft.displayName.trim()) return
                  invite.run({ ...draft, displayName: draft.displayName.trim() }).then(
                    (out) =>
                      setSent({
                        name: out.user.displayName,
                        link: out.link,
                        emailedTo: out.emailedTo,
                      }),
                    (e: Error) => toast.error(t('invite.failed'), { description: e.message }),
                  )
                }}
              >
                {t('invite.create')}
              </Button>
            </>
          )
        }
      >
        {sent ? (
          <div className="grid gap-3">
            <Secret value={sent.link} label={t('link.copy')} copied={t('link.copied')} />
            {sent.emailedTo && (
              <p className="text-caption text-text-2">
                {t('link.emailed', { email: sent.emailedTo })}
              </p>
            )}
          </div>
        ) : (
          <div className="grid gap-4">
            <Field label={t('invite.name')} hint={t('invite.nameHint')} error={nameError}>
              <Input
                value={draft.displayName}
                onChange={(e) => setDraft({ ...draft, displayName: e.target.value })}
              />
            </Field>
            <Field label={t('invite.email')} hint={t('invite.emailHint')}>
              <Input
                type="email"
                value={draft.email ?? ''}
                onChange={(e) => setDraft({ ...draft, email: e.target.value || null })}
              />
            </Field>
            <RoleField
              value={draft.role}
              onChange={(role) =>
                setDraft({ ...draft, role, libraries: role === 'admin' ? 'all' : draft.libraries })
              }
            />
            {draft.role === 'user' && (
              <LibrariesField
                value={draft.libraries}
                onChange={(libraries) => setDraft({ ...draft, libraries })}
              />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------- devices

function Devices() {
  const t = useT(messages)
  const devices = useQuery('settings:devices', (c) => c.devices.list({ query: {} }), [
    'users.updated',
  ])
  const people = usePeople()
  const session = useSession()
  const { seen } = useRelative()
  const [who, setWho] = useState('all')
  const [revoking, setRevoking] = useState<Device | null>(null)
  const revoke = useAction((c, id: string) => c.devices.revoke({ params: { id } }))
  const name = (id: string) =>
    people.data?.find((u) => u.id === id)?.displayName ?? t('devices.unknown')
  // the browser this admin runs in: it signs out from Your account, not from here
  const self = session.data?.deviceId
  // anyone's for the owner; an admin signs out their own (ADR 0032)
  const owner = useOwner()
  const mayRevoke = (d: Device) => d.id !== self && (owner || d.userId === session.data?.user.id)
  return (
    <Loadable query={devices} what={t('devices.what')}>
      {(ds) => {
        const shown = (who === 'all' ? ds : ds.filter((d) => d.userId === who)).sort(
          (a, b) => Date.parse(b.lastSeen) - Date.parse(a.lastSeen),
        )
        return (
          <TableFrame>
            <TableToolbar>
              <Select
                aria-label={t('devices.whose')}
                value={who}
                onValueChange={setWho}
                options={[
                  { value: 'all', label: t('devices.everyone') },
                  ...(people.data ?? [])
                    .filter((u) => !u.invited)
                    .map((u) => ({
                      value: u.id,
                      label: t('devices.someone', { name: u.displayName }),
                    })),
                ]}
                className="w-56"
              />
              <span className="ms-auto text-caption text-text-3">{t('devices.note')}</span>
            </TableToolbar>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('devices.device')}</TableHead>
                  <TableHead>{t('devices.person')}</TableHead>
                  <TableHead>{t('devices.app')}</TableHead>
                  <TableHead>{t('devices.address')}</TableHead>
                  <TableHead>{t('devices.lastSeen')}</TableHead>
                  <TableHead>
                    <span className="sr-only">{t('people.actions')}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-text-3">
                      {t('devices.none')}
                    </TableCell>
                  </TableRow>
                )}
                {shown.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <span className="flex items-center gap-2.5">
                        <Icon name={clientIcon[d.client]} size={16} className="text-text-3" />
                        <span className="text-text">{d.name}</span>
                        {d.id === self && <Badge tone="accent">{t('devices.thisBrowser')}</Badge>}
                      </span>
                    </TableCell>
                    <TableCell className="text-text-2">{name(d.userId)}</TableCell>
                    <TableCell className="text-text-2">
                      {t(`client.${d.client}`)} ·{' '}
                      <span className="font-mono text-figure">{d.appVersion}</span>
                    </TableCell>
                    <TableCell className="font-mono text-figure text-text-2">{d.address}</TableCell>
                    <TableCell className="text-text-2">{seen(d.lastSeen)}</TableCell>
                    <TableCell className="text-end">
                      {mayRevoke(d) && (
                        <Button
                          size="sm"
                          icon="sign-out"
                          aria-label={t('devices.signOutLabel', { name: d.name })}
                          onClick={() => setRevoking(d)}
                        >
                          {t('devices.signOut')}
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
              title={t('devices.signOutTitle', { name: revoking?.name ?? '' })}
              description={t('devices.signOutBody', {
                person: revoking ? name(revoking.userId) : '',
              })}
              confirmLabel={t('devices.signOut')}
              cancelLabel={t('keep')}
              destructive
              onConfirm={() => {
                const d = revoking
                if (d)
                  revoke.run(d.id).then(
                    () => toast({ title: t('devices.signedOut', { name: d.name }) }),
                    (e: Error) => toast.error(t('devices.failed'), { description: e.message }),
                  )
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
  const t = useT(messages)
  // the owner sees everyone's keys, so any key that acts on the server can be revoked; an admin
  // sees their own
  const keys = useQuery('settings:keys', (c) => c.apiKeys.list(), ['users.updated'])
  const people = usePeople()
  const me = useSession().data?.user.id
  const whose = (k: ApiKey) =>
    k.userId === me
      ? null
      : (people.data?.find((u) => u.id === k.userId)?.displayName ?? t('devices.unknown'))
  const { relative, seen } = useRelative()
  const [revoking, setRevoking] = useState<ApiKey | null>(null)
  const revoke = useAction((c, id: string) => c.apiKeys.revoke({ params: { id } }))
  return (
    <Loadable query={keys} what={t('keys.what')}>
      {(ks) =>
        ks.length === 0 ? (
          <p className="rounded-lg border border-line bg-s1 p-6 text-center text-caption text-text-3">
            {t('keys.none')}
          </p>
        ) : (
          <ul aria-label={t('keys.label')} className="grid gap-2">
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
                      {k.scope === 'full' ? t('keys.full') : t('keys.read')}
                    </Badge>
                    {whose(k) && (
                      <span className="text-caption text-text-3">
                        {t('keys.whose', { name: whose(k) ?? '' })}
                      </span>
                    )}
                  </p>
                  <p className="text-caption text-text-3">
                    <span className="font-mono text-figure">{k.prefix}…</span> ·{' '}
                    {t('keys.detail', {
                      made: relative(k.createdAt),
                      used: k.lastUsed
                        ? t('keys.lastUsed', { when: seen(k.lastUsed) })
                        : t('keys.neverUsed'),
                    })}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="danger"
                  className="justify-self-start medium:justify-self-end"
                  aria-label={t('keys.revokeLabel', { name: k.name })}
                  onClick={() => setRevoking(k)}
                >
                  {t('keys.revoke')}
                </Button>
              </li>
            ))}
            <ConfirmDialog
              open={!!revoking}
              onOpenChange={(o) => !o && setRevoking(null)}
              title={t('keys.revokeTitle', { name: revoking?.name ?? '' })}
              description={t('keys.revokeBody')}
              confirmLabel={t('keys.revoke')}
              cancelLabel={t('keep')}
              destructive
              onConfirm={() => {
                const k = revoking
                if (k)
                  revoke.run(k.id).then(
                    () => toast({ title: t('keys.revoked', { name: k.name }) }),
                    (e: Error) => toast.error(t('keys.failed'), { description: e.message }),
                  )
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
  const t = useT(messages)
  const [name, setName] = useState('')
  const [scope, setScope] = useState<ApiKey['scope']>('read')
  const [made, setMade] = useState<CreatedKey | null>(null)
  const create = useAction((c, n: string, s: ApiKey['scope']) =>
    c.apiKeys.create({ body: { name: n.trim(), scope: s } }),
  )
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
        title={made ? t('keys.madeTitle') : t('keys.newTitle')}
        description={made ? t('keys.madeBody') : t('keys.newBody')}
        footer={
          made ? (
            <Button variant="primary" onClick={() => close(false)}>
              {t('keys.copied')}
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => close(false)}>
                {t('cancel')}
              </Button>
              <Button
                variant="primary"
                loading={create.pending}
                disabled={!name.trim()}
                onClick={() =>
                  create
                    .run(name, scope)
                    .then(setMade, (e: Error) =>
                      toast.error(t('keys.makeFailed'), { description: e.message }),
                    )
                }
              >
                {t('keys.make')}
              </Button>
            </>
          )
        }
      >
        {made ? (
          <Secret value={made.secret} label={t('keys.copy')} copied={t('keys.keyCopied')} />
        ) : (
          <div className="grid gap-4">
            <Field label={t('keys.name')} hint={t('keys.nameHint')}>
              <Input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label={t('keys.access')}>
              <Select
                value={scope}
                onValueChange={(v) => setScope(v as ApiKey['scope'])}
                options={[
                  { value: 'read', label: t('keys.readOption') },
                  { value: 'full', label: t('keys.fullOption') },
                ]}
              />
            </Field>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

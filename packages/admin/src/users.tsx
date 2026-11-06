'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// A13 Users and devices (docs/product/users-devices.md), ported from the prototype: who can sign
// in and what they can do (role, and a user's permissions and libraries), invites by link, every
// signed-in device with sign-out, and API keys for scripts, shown once. Managing people is the
// owner's; admins see people and devices read-only (ADR 0032). Invite and reset links are always
// shown to copy, and also emailed when the server's mail is set up in Connections (checkpoint 8b).
// Drawn with the library's native renderer since D3 (one-client-platform-d.md).
import type { ApiKey, Device, User } from '@highsea-tv/api-contract'
import { useT } from '@highsea-tv/i18n/react'
import { useAction, useQuery } from '@highsea-tv/sdk/react'
import { breakpoints } from '@highsea-tv/tokens'
import {
  Badge,
  type BadgeTone,
  Button,
  Checkbox,
  ConfirmDialog,
  Dialog,
  Field,
  Icon,
  Input,
  SegmentedControl,
  Select,
  Sheet,
  Table,
  TableBody,
  TableCell,
  TableFrame,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  Tabs,
  Text,
  toast,
  tokens,
  useTheme,
  useWindowAtLeast,
} from '@highsea-tv/ui/native'
import { type ReactNode, useState } from 'react'
import { View } from 'react-native'
import { clientIcon } from './delivery.ts'
import { Loadable } from './loadable.tsx'
import { AreaPage } from './settings.tsx'
import { Muted, RowMenu } from './table-parts.tsx'
import { useRelative } from './time.ts'
import { users as messages } from './users-messages.ts'

const s = tokens.space
const ui = tokens.adminText.ui
const figure = tokens.adminText.figure

type Role = User['role']
type Permission = User['permissions'][number]
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
            <Button variant="primary" icon="add" onPress={() => setInviting(true)}>
              {t('invite')}
            </Button>
          )
        ) : tab === 'keys' ? (
          <Button variant="primary" icon="add" onPress={() => setCreating(true)}>
            {t('newKey')}
          </Button>
        ) : null
      }
    >
      <View style={{ minWidth: 0 }}>
        <Tabs<Tab>
          variant="line"
          aria-label={t('sections')}
          value={tab}
          onValueChange={setTab}
          options={[
            { value: 'users', label: t('tab.people') },
            { value: 'devices', label: t('tab.devices') },
            { value: 'keys', label: t('tab.keys') },
          ]}
        />
        <View
          role="tabpanel"
          aria-label={t(`tab.${TAB_LABEL[tab]}`)}
          style={{ paddingTop: s['5'] }}
        >
          {tab === 'users' ? <People /> : tab === 'devices' ? <Devices /> : <Keys />}
        </View>
      </View>
      {owner && <InviteDialog open={inviting} onOpenChange={setInviting} />}
      <NewKeyDialog open={creating} onOpenChange={setCreating} />
    </AreaPage>
  )
}

const TAB_LABEL = { users: 'people', devices: 'devices', keys: 'keys' } as const

// ---------------------------------------------------------------- people

function Avatar({ user }: { user: Pick<User, 'displayName'> }) {
  const theme = useTheme()
  return (
    <View
      aria-hidden
      style={{
        width: s['8'],
        height: s['8'],
        flexShrink: 0,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: tokens.radius.pill,
        backgroundColor: theme.colors['accent-soft'],
      }}
    >
      <Text size={ui.size} leading={ui.leading} weight={600} color="accent-text">
        {user.displayName.charAt(0)}
      </Text>
    </View>
  )
}

/** A secret link to pass on, with a copy button: an invite or a reset. */
function Secret({ value, label, copied }: { value: string; label: string; copied: string }) {
  const theme = useTheme()
  return (
    <View style={{ gap: s['2'] }}>
      <View
        style={{
          padding: s['3'],
          borderRadius: tokens.radius.md,
          backgroundColor: theme.colors.s2,
        }}
      >
        <Text
          mono
          size={figure.size}
          leading={figure.leading}
          selectable
          style={{ wordBreak: 'break-all' } as object}
        >
          {value}
        </Text>
      </View>
      <Button
        icon="copy"
        onPress={() =>
          navigator.clipboard?.writeText(value).then(
            () => toast({ title: copied }),
            () => {},
          )
        }
      >
        {label}
      </Button>
    </View>
  )
}

/** A line under a dialog's secret: where the link was emailed. */
function Emailed({ to }: { to: string | null | undefined }) {
  const t = useT(messages)
  if (!to) return null
  return (
    <Text variant="caption" color="text-2">
      {t('link.emailed', { email: to })}
    </Text>
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
    <Dialog
      open={!!shown}
      onClose={onClose}
      size="sm"
      title={
        !shown
          ? ''
          : shown.kind === 'invite'
            ? t('link.inviteTitle', { name: shown.name })
            : t('link.resetTitle', { name: shown.name })
      }
      description={
        !shown
          ? undefined
          : shown.kind === 'invite'
            ? t('link.inviteBody', { when: relative(shown.link.expiresAt) })
            : t('link.resetBody', { when: relative(shown.link.expiresAt) })
      }
      footer={
        <Button variant="primary" onPress={onClose}>
          {t('done')}
        </Button>
      }
    >
      {shown && (
        <View style={{ gap: s['3'] }}>
          <Secret value={shown.link.link} label={t('link.copy')} copied={t('link.copied')} />
          <Emailed to={shown.link.emailedTo} />
        </View>
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
              <Text variant="caption" color="text-3">
                {t('people.count', { count: users.length - invited })}
                {invited > 0 && ` · ${t('people.invited', { count: invited })}`}
              </Text>
              {!owner && (
                <Text variant="caption" color="text-3" style={{ marginStart: 'auto' }}>
                  {t('people.readOnly')}
                </Text>
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
                  {owner && <TableHead hidden>{t('people.actions')}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell tall>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: s['2'] + s['0.5'],
                        }}
                      >
                        <Avatar user={u} />
                        <View>
                          <Text size={ui.size} leading={ui.leading} numberOfLines={1}>
                            {u.displayName}
                          </Text>
                          <Text
                            mono
                            size={figure.size}
                            leading={figure.leading}
                            color="text-3"
                            numberOfLines={1}
                          >
                            @{u.username}
                          </Text>
                        </View>
                        {u.invited && <Badge tone="info">{t('people.invitedBadge')}</Badge>}
                        {u.id === me && <Badge tone="accent">{t('people.you')}</Badge>}
                      </View>
                    </TableCell>
                    <TableCell>
                      <Badge tone={roleTone[u.role]}>{t(`role.${u.role}`)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Muted>
                        {u.libraries === 'all' ? t('people.allLibraries') : t('people.movies')}
                      </Muted>
                    </TableCell>
                    <TableCell>
                      <Muted>
                        {u.invited ? '—' : u.twoFactor ? t('people.on') : t('people.off')}
                      </Muted>
                    </TableCell>
                    <TableCell>
                      <Muted>
                        {u.invited
                          ? t('people.notJoined')
                          : u.lastSeen
                            ? seen(u.lastSeen)
                            : t('people.never')}
                      </Muted>
                    </TableCell>
                    {owner && (
                      <TableCell align="end">
                        {manages(u) && (
                          <View
                            style={{
                              flexDirection: 'row',
                              justifyContent: 'flex-end',
                              gap: s['1'],
                            }}
                          >
                            <Button
                              size="sm"
                              icon="edit"
                              accessibilityLabel={t('people.editLabel', { name: u.displayName })}
                              onPress={() => setEditing(u)}
                            >
                              {t('people.edit')}
                            </Button>
                            <RowMenu
                              label={t('people.more', { name: u.displayName })}
                              items={[
                                u.invited
                                  ? {
                                      label: t('people.copyInvite'),
                                      icon: 'copy',
                                      onSelect: () => void showLink('invite', u),
                                    }
                                  : {
                                      label: t('people.reset'),
                                      icon: 'lock',
                                      onSelect: () => void showLink('reset', u),
                                    },
                                ...(u.twoFactor
                                  ? [
                                      {
                                        label: t('people.resetTwoStep'),
                                        icon: 'shield' as const,
                                        onSelect: () => setUnsetting(u),
                                      },
                                    ]
                                  : []),
                                {
                                  label: u.invited ? t('people.cancelInvite') : t('people.remove'),
                                  icon: 'delete',
                                  danger: true,
                                  onSelect: () => setRemoving(u),
                                },
                              ]}
                            />
                          </View>
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
              onClose={() => setUnsetting(null)}
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
              onClose={() => setRemoving(null)}
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
      <Select<Invitable>
        aria-label={t('edit.role')}
        value={value}
        onValueChange={onChange}
        options={roles.map((r) => ({ value: r, label: t(`role.${r}`) }))}
      />
    </Field>
  )
}

/** A group of fields under a legend (the web's fieldset): `role="group"` named by it. */
function FieldGroup({
  legend,
  gap,
  children,
}: {
  legend: string
  gap: number
  children: ReactNode
}) {
  return (
    <View role="group" aria-label={legend} style={{ gap }}>
      <Text
        size={ui.size}
        leading={ui.leading}
        weight={500}
        aria-hidden
        style={{ marginBottom: s['1'] }}
      >
        {legend}
      </Text>
      {children}
    </View>
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
  const theme = useTheme()
  return (
    <FieldGroup legend={t('edit.libraries')} gap={s['2']}>
      <SegmentedControl
        aria-label={t('edit.libraries')}
        size="sm"
        value={value === 'all' ? 'all' : 'some'}
        onValueChange={(v) => onChange(v === 'all' ? 'all' : ['movies'])}
        options={[
          { value: 'all', label: t('edit.allLibraries') },
          { value: 'some', label: t('edit.choose') },
        ]}
      />
      {value !== 'all' && (
        <View
          style={{
            gap: s['2'],
            padding: s['3'],
            borderWidth: 1,
            borderColor: theme.colors.line,
            borderRadius: tokens.radius.md,
            backgroundColor: theme.colors.s2,
          }}
        >
          <Checkbox
            label={t('people.movies')}
            checked={value.includes('movies')}
            onCheckedChange={(c) =>
              onChange(c ? [...value, 'movies'] : value.filter((x) => x !== 'movies'))
            }
          />
          <Text variant="caption" color="text-3">
            {t('edit.more')}
          </Text>
        </View>
      )}
    </FieldGroup>
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
    <Sheet
      open
      onClose={onClose}
      side="right"
      title={user.displayName}
      description={`@${user.username}`}
    >
      <View style={{ gap: s['5'] }}>
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
          <Text variant="caption" color="text-3">
            {t('edit.demote')}
          </Text>
        )}
        {isUser && (
          <FieldGroup legend={t('edit.can')} gap={s['2'] + s['0.5']}>
            {permissions.map((p) => (
              <Checkbox
                key={p}
                label={t(`permission.${p}`)}
                hint={t(`permission.${p}.hint`)}
                checked={draft.permissions.includes(p)}
                onCheckedChange={(c) =>
                  setDraft({
                    ...draft,
                    permissions: c
                      ? [...draft.permissions, p]
                      : draft.permissions.filter((x) => x !== p),
                  })
                }
              />
            ))}
            <Text variant="caption" color="text-3">
              {t('edit.resets')}
            </Text>
          </FieldGroup>
        )}
        {isUser && (
          <LibrariesField
            value={draft.libraries}
            onChange={(libraries) => setDraft({ ...draft, libraries })}
          />
        )}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s['2'] }}>
          <Button
            variant="primary"
            loading={save.pending}
            disabled={Array.isArray(draft.libraries) && !draft.libraries.length}
            onPress={() =>
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
          <Button variant="ghost" onPress={onClose}>
            {t('cancel')}
          </Button>
        </View>
      </View>
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
  const close = () => {
    onOpenChange(false)
    setDraft(blank)
    setSent(null)
    setTried(false)
  }
  const nameError = tried && !draft.displayName.trim() ? t('invite.nameMissing') : undefined
  return (
    <Dialog
      open={open}
      onClose={close}
      size="sm"
      title={sent ? t('invite.sentTitle', { name: sent.name }) : t('invite.title')}
      description={sent ? t('invite.sentBody') : t('invite.body')}
      footer={
        sent ? (
          <Button variant="primary" onPress={close}>
            {t('done')}
          </Button>
        ) : (
          <>
            <Button variant="ghost" onPress={close}>
              {t('cancel')}
            </Button>
            <Button
              variant="primary"
              loading={invite.pending}
              onPress={() => {
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
        <View style={{ gap: s['3'] }}>
          <Secret value={sent.link} label={t('link.copy')} copied={t('link.copied')} />
          <Emailed to={sent.emailedTo} />
        </View>
      ) : (
        <View style={{ gap: s['4'] }}>
          <Field label={t('invite.name')} hint={t('invite.nameHint')} error={nameError}>
            <Input
              value={draft.displayName}
              onChangeText={(displayName) => setDraft({ ...draft, displayName })}
            />
          </Field>
          <Field label={t('invite.email')} hint={t('invite.emailHint')}>
            <Input
              inputMode="email"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              value={draft.email ?? ''}
              onChangeText={(email) => setDraft({ ...draft, email: email || null })}
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
        </View>
      )}
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
              <View style={{ width: 224 }}>
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
                />
              </View>
              <Text variant="caption" color="text-3" style={{ marginStart: 'auto' }}>
                {t('devices.note')}
              </Text>
            </TableToolbar>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('devices.device')}</TableHead>
                  <TableHead>{t('devices.person')}</TableHead>
                  <TableHead>{t('devices.app')}</TableHead>
                  <TableHead>{t('devices.address')}</TableHead>
                  <TableHead>{t('devices.lastSeen')}</TableHead>
                  <TableHead hidden>{t('people.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.length === 0 && (
                  <TableRow>
                    <TableCell span={6} align="center">
                      <Text variant="caption" color="text-3" align="center">
                        {t('devices.none')}
                      </Text>
                    </TableCell>
                  </TableRow>
                )}
                {shown.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: s['2'] + s['0.5'],
                        }}
                      >
                        <Icon name={clientIcon[d.client]} size={16} color="text-3" />
                        <Text size={ui.size} leading={ui.leading} numberOfLines={1}>
                          {d.name}
                        </Text>
                        {d.id === self && <Badge tone="accent">{t('devices.thisBrowser')}</Badge>}
                      </View>
                    </TableCell>
                    <TableCell>
                      <Muted>{name(d.userId)}</Muted>
                    </TableCell>
                    <TableCell>
                      <Muted>
                        {t(`client.${d.client}`)} ·{' '}
                        <Text mono size={figure.size} leading={figure.leading} color="text-2">
                          {d.appVersion}
                        </Text>
                      </Muted>
                    </TableCell>
                    <TableCell>
                      <Text
                        mono
                        size={figure.size}
                        leading={figure.leading}
                        color="text-2"
                        numberOfLines={1}
                      >
                        {d.address}
                      </Text>
                    </TableCell>
                    <TableCell>
                      <Muted>{seen(d.lastSeen)}</Muted>
                    </TableCell>
                    <TableCell align="end">
                      {mayRevoke(d) && (
                        <Button
                          size="sm"
                          icon="sign-out"
                          accessibilityLabel={t('devices.signOutLabel', { name: d.name })}
                          onPress={() => setRevoking(d)}
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
              onClose={() => setRevoking(null)}
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
  const theme = useTheme()
  const medium = useWindowAtLeast(breakpoints.medium)
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
  const card = {
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderRadius: tokens.radius.lg,
    backgroundColor: theme.colors.s1,
  }
  return (
    <Loadable query={keys} what={t('keys.what')}>
      {(ks) =>
        ks.length === 0 ? (
          <View style={[card, { padding: s['6'] }]}>
            <Text variant="caption" color="text-3" align="center">
              {t('keys.none')}
            </Text>
          </View>
        ) : (
          <View role="list" aria-label={t('keys.label')} style={{ gap: s['2'] }}>
            {ks.map((k) => (
              <View
                key={k.id}
                role="listitem"
                style={[
                  card,
                  {
                    gap: s['2'],
                    padding: s['4'],
                    flexDirection: medium ? 'row' : 'column',
                    alignItems: medium ? 'center' : 'stretch',
                  },
                ]}
              >
                <View style={{ flex: medium ? 1 : undefined, minWidth: 0, gap: s['1'] }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: s['2'],
                    }}
                  >
                    <Icon name="key" size={16} color="text-3" />
                    <Text size={ui.size} leading={ui.leading} weight={600}>
                      {k.name}
                    </Text>
                    <Badge tone={k.scope === 'full' ? 'warning' : 'neutral'}>
                      {k.scope === 'full' ? t('keys.full') : t('keys.read')}
                    </Badge>
                    {whose(k) && (
                      <Text variant="caption" color="text-3">
                        {t('keys.whose', { name: whose(k) ?? '' })}
                      </Text>
                    )}
                  </View>
                  <Text variant="caption" color="text-3">
                    <Text mono size={figure.size} leading={figure.leading} color="text-3">
                      {`${k.prefix}…`}
                    </Text>
                    {' · '}
                    {t('keys.detail', {
                      made: relative(k.createdAt),
                      used: k.lastUsed
                        ? t('keys.lastUsed', { when: seen(k.lastUsed) })
                        : t('keys.neverUsed'),
                    })}
                  </Text>
                </View>
                <Button
                  size="sm"
                  variant="danger"
                  accessibilityLabel={t('keys.revokeLabel', { name: k.name })}
                  onPress={() => setRevoking(k)}
                >
                  {t('keys.revoke')}
                </Button>
              </View>
            ))}
            <ConfirmDialog
              open={!!revoking}
              onClose={() => setRevoking(null)}
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
          </View>
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
  const create = useAction((c, n: string, sc: ApiKey['scope']) =>
    c.apiKeys.create({ body: { name: n.trim(), scope: sc } }),
  )
  const close = () => {
    onOpenChange(false)
    setName('')
    setScope('read')
    setMade(null)
  }
  return (
    <Dialog
      open={open}
      onClose={close}
      size="sm"
      title={made ? t('keys.madeTitle') : t('keys.newTitle')}
      description={made ? t('keys.madeBody') : t('keys.newBody')}
      footer={
        made ? (
          <Button variant="primary" onPress={close}>
            {t('keys.copied')}
          </Button>
        ) : (
          <>
            <Button variant="ghost" onPress={close}>
              {t('cancel')}
            </Button>
            <Button
              variant="primary"
              loading={create.pending}
              disabled={!name.trim()}
              onPress={() =>
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
        <View style={{ gap: s['4'] }}>
          <Field label={t('keys.name')} hint={t('keys.nameHint')}>
            <Input value={name} maxLength={60} onChangeText={setName} />
          </Field>
          <Field label={t('keys.access')}>
            <Select<ApiKey['scope']>
              aria-label={t('keys.access')}
              value={scope}
              onValueChange={setScope}
              options={[
                { value: 'read', label: t('keys.readOption') },
                { value: 'full', label: t('keys.fullOption') },
              ]}
            />
          </Field>
        </View>
      )}
    </Dialog>
  )
}

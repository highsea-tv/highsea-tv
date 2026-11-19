'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// The folder picker (HT-91): setup's picker, lifted out so every field that takes a folder on the
// server has it. A dialog with the path as crumbs, Up and the folders inside, opening at the
// field's folder or, when that's empty or gone, where browsing starts. Setup lists through its own
// route, open before there's an owner and only inside the media root; everywhere else lists
// through `GET /api/v1/fs/folders`, staff only, inside the data folder and the folders highsea
// already knows (root folders, downloads), never the config folder.
//
// A NAS share can hold thousands of folders (about 1,300 films in one): the server sorts them by
// name, a filter box narrows them once there are more than a screenful, and at most `SHOWN` rows
// are drawn at once, with a line saying how many more the filter can reach.
import type { FolderListing } from '@highsea-tv/api-contract'
import { useT } from '@highsea-tv/i18n/react'
import type { ApiError, HighseaClient } from '@highsea-tv/sdk'
import { useQuery } from '@highsea-tv/sdk/react'
import { admin, line } from '@highsea-tv/tokens'
import {
  Banner,
  Button,
  Dialog,
  EmptyState,
  Icon,
  Press,
  ScrollView,
  SearchField,
  Skeleton,
  Text,
  tokens,
  useTheme,
} from '@highsea-tv/ui/native'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { View } from 'react-native'
import { folderPicker as messages } from './folder-picker-messages.ts'

const s = tokens.space
const mono = tokens.text.web.mono
/** The list (the web's h-64), and a folder's row (h-9): setup's picker's sizes. */
const LIST_HEIGHT = admin.setup.listHeight
const ROW_HEIGHT = admin.setup.rowHeight
/** Words that wrap anywhere (the web's [overflow-wrap:anywhere]), for paths. */
const ANYWHERE = { overflowWrap: 'anywhere' } as object
/** The filter box shows once a folder holds more than this many folders. */
const FILTER_FROM = 12
/** At most this many rows are drawn; the filter reaches the rest. */
export const SHOWN = 200

/** What the picker draws: one folder's folders. `writable` is null when the source can't say. */
export type PickerListing = Omit<FolderListing, 'writable'> & { writable: boolean | null }

/** Where the picker lists from: a folder's folders, or where browsing starts without a path. */
export type FolderSource = (
  client: HighseaClient,
  path: string | undefined,
) => Promise<PickerListing>

/** After setup: the staff route, which knows the allowed folders. */
export const serverFolders: FolderSource = (c, path) =>
  c.fs.folders({ query: path ? { path } : {} })

/** Why a listing failed, from the server's `details.reason`. */
type Problem = 'missing' | 'unreadable' | 'outside' | 'other'
const problemOf = (error: Error | undefined): Problem => {
  const e = error as ApiError | undefined
  const reason = (e?.details as { reason?: string } | undefined)?.reason
  if (reason === 'missing' || e?.code === 'not-found') return 'missing'
  if (reason === 'unreadable') return 'unreadable'
  if (reason === 'outside' || e?.code === 'forbidden' || e?.code === 'invalid') return 'outside'
  return 'other'
}

const inside = (root: string, p: string) => p === root || p.startsWith(`${root}/`)
const parentOf = (p: string) => p.slice(0, p.lastIndexOf('/')) || '/'

export type FolderPickerProps = {
  open: boolean
  title: string
  /** The field's folder: the picker opens there, or where browsing starts when it's empty or gone. */
  start: string
  onClose: () => void
  onPick: (path: string) => void
  /** Says so when highsea can't write in the folder, for a field it imports or saves into. */
  needsWrite?: boolean
  source?: FolderSource
}

/** The picker: mounted on first opening, so a closed one asks the server nothing. */
export function FolderPicker(props: FolderPickerProps) {
  const [seen, setSeen] = useState(props.open)
  if (props.open && !seen) setSeen(true)
  return seen ? <PickerDialog {...props} /> : null
}

function PickerDialog({
  open,
  title,
  start,
  onClose,
  onPick,
  needsWrite = false,
  source = serverFolders,
}: FolderPickerProps) {
  const t = useT(messages)
  const theme = useTheme()
  const wanted = start.trim() || undefined
  /** The folder asked for; undefined is where browsing starts. */
  const [path, setPath] = useState<string | undefined>(wanted)
  /** True until the field's own folder has answered: if it's gone, the picker starts over. */
  const [opening, setOpening] = useState(true)
  const [gone, setGone] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [last, setLast] = useState<PickerListing | null>(null)
  const list = useQuery(`folders:${path ?? ''}`, (c) => source(c, path))
  const mounted = useRef(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: resets each time the picker opens again
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    if (!open) return
    setOpening(true)
    setGone(null)
    // the same folder again asks afresh: what's on the disk may have changed since
    if (path === wanted) list.refetch()
    else setPath(wanted)
  }, [open])
  const problem = list.status === 'error' ? problemOf(list.error) : null

  // a new folder starts unfiltered
  // biome-ignore lint/correctness/useExhaustiveDependencies: `path` is the trigger
  useEffect(() => {
    setFilter('')
  }, [path])
  useEffect(() => {
    if (list.status === 'success') {
      setLast(list.data)
      setOpening(false)
    }
    // the field's folder isn't there (or isn't allowed): start where browsing starts, and say so
    if (list.status === 'error' && opening && path !== undefined) {
      if (problem === 'missing' || problem === 'outside') {
        setGone(path)
        setPath(undefined)
      }
      setOpening(false)
    }
  }, [list.status, list.data, opening, path, problem])

  const data = list.status === 'success' ? list.data : null
  const root = data?.root ?? last?.root
  const here = data?.path ?? path ?? last?.path
  const below = root && here && inside(root, here) ? here.slice(root.length) : null
  const parts = (below ?? '').split('/').filter(Boolean)
  const crumbs = root
    ? [
        { label: root, to: root },
        ...parts.map((name, i) => ({
          label: name,
          to: `${root === '/' ? '' : root}/${parts.slice(0, i + 1).join('/')}`,
        })),
      ]
    : []
  const up = data
    ? data.parent
    : here && root && here !== root && inside(root, here)
      ? parentOf(here)
      : null

  const folders = useMemo(() => {
    const all = data?.folders ?? []
    const f = filter.trim().toLocaleLowerCase()
    return f ? all.filter((x) => x.name.toLocaleLowerCase().includes(f)) : all
  }, [data, filter])
  const shown = folders.slice(0, SHOWN)
  const crumbText = { size: mono.size, leading: mono.leading, mono: true } as const

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={t('detail')}
      footer={
        <>
          <Button variant="ghost" onPress={onClose}>
            {t('cancel')}
          </Button>
          <Button variant="primary" onPress={() => data && onPick(data.path)} disabled={!data}>
            {t('use')}
          </Button>
        </>
      }
    >
      <View style={{ gap: s['4'] }}>
        {gone && (
          <Text variant="caption" color="text-3" style={ANYWHERE}>
            {t('gone', { path: gone })}
          </Text>
        )}
        <View
          role="navigation"
          aria-label={t('path')}
          style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: s['1'] }}
        >
          {crumbs.map((c, i) => {
            const isLast = i === crumbs.length - 1
            return (
              <View
                key={c.to}
                style={{ flexDirection: 'row', alignItems: 'center', gap: s['1'], minWidth: 0 }}
              >
                {i > 0 && (
                  <Text {...crumbText} color="text-3">
                    /
                  </Text>
                )}
                {isLast ? (
                  <Text {...crumbText} aria-current="location" style={ANYWHERE}>
                    {c.label}
                  </Text>
                ) : (
                  <Press
                    role="button"
                    onPress={() => setPath(c.to)}
                    style={({ hovered }) => ({
                      borderRadius: tokens.radius['2xs'],
                      paddingHorizontal: s['0.5'],
                      backgroundColor: hovered ? theme.colors.s4 : 'transparent',
                    })}
                  >
                    {({ hovered }) => (
                      <Text {...crumbText} color={hovered ? 'text' : 'text-2'} style={ANYWHERE}>
                        {c.label}
                      </Text>
                    )}
                  </Press>
                )}
              </View>
            )
          })}
        </View>
        {data && data.folders.length > FILTER_FROM && (
          <SearchField
            size="sm"
            label={t('filter')}
            placeholder={t('filter')}
            clearLabel={t('clear')}
            value={filter}
            onChangeText={setFilter}
            spellCheck={false}
            autoCapitalize="none"
          />
        )}
        <View
          style={{
            height: LIST_HEIGHT,
            overflow: 'hidden',
            borderWidth: line.thin,
            borderColor: theme.colors.line,
            borderRadius: tokens.radius.md,
            backgroundColor: theme.colors.s2,
          }}
        >
          {list.status === 'loading' ? (
            <View aria-busy aria-label={t('loading')} style={{ gap: s['1'], padding: s['2'] }}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} height={ROW_HEIGHT} />
              ))}
            </View>
          ) : list.status === 'error' ? (
            <View style={{ flex: 1 }}>
              {up && (
                <View style={{ padding: s['1'] }}>
                  <FolderRow icon="chevron-up" label={t('up')} onPress={() => setPath(up)} />
                </View>
              )}
              <EmptyState
                size="sm"
                tone="error"
                icon="error"
                title={t(`problem.${problem ?? 'other'}`)}
              >
                {problem === 'other' || !problem
                  ? list.error.message
                  : t(`problem.${problem}.body`)}
              </EmptyState>
            </View>
          ) : (
            <ScrollView>
              <View role="list" style={{ padding: s['1'] }}>
                {up && (
                  <View role="listitem">
                    <FolderRow icon="chevron-up" label={t('up')} onPress={() => setPath(up)} />
                  </View>
                )}
                {shown.map((f) => (
                  <View key={f.path} role="listitem">
                    <FolderRow icon="folder" label={f.name} onPress={() => setPath(f.path)} />
                  </View>
                ))}
                {(folders.length === 0 || folders.length > SHOWN || (data?.more ?? 0) > 0) && (
                  <View
                    role="listitem"
                    style={{ paddingHorizontal: s['3'], paddingVertical: s['6'] }}
                  >
                    <Text variant="caption" color="text-3" align="center">
                      {folders.length === 0
                        ? filter.trim()
                          ? t('noMatch')
                          : t('empty')
                        : folders.length > SHOWN
                          ? t('cut', { shown: SHOWN, count: folders.length })
                          : t('more', { count: data?.more ?? 0 })}
                    </Text>
                  </View>
                )}
              </View>
            </ScrollView>
          )}
        </View>
        {needsWrite && data?.writable === false && (
          <Banner tone="warning" title={t('readOnly')}>
            {t('readOnlyBody')}
          </Banner>
        )}
      </View>
    </Dialog>
  )
}

function FolderRow({
  icon,
  label,
  onPress,
}: {
  icon: 'folder' | 'chevron-up'
  label: string
  onPress: () => void
}) {
  const theme = useTheme()
  return (
    <Press
      role="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ hovered }) => ({
        height: ROW_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        gap: s['2'] + s['0.5'],
        paddingHorizontal: s['2'] + s['0.5'],
        borderRadius: tokens.radius.sm,
        backgroundColor: hovered ? theme.colors.s4 : 'transparent',
      })}
    >
      <Icon name={icon} size={tokens.icon.size.sm} color="text-3" />
      <Text mono size={mono.size} leading={mono.leading} numberOfLines={1} style={{ flex: 1 }}>
        {label}
      </Text>
      {icon === 'folder' && <Icon name="chevron-right" size={tokens.icon.size.xs} color="text-3" />}
    </Press>
  )
}

/**
 * A folder field's Browse: the button beside the field and the picker it opens, at the field's
 * folder. Picking fills the field; the typed path stays, so one can still be pasted.
 */
type BrowseProps = {
  /** The field's path, where the picker opens. */
  value: string
  onPick: (path: string) => void
  title: string
  needsWrite?: boolean
  source?: FolderSource
  disabled?: boolean
}

export function Browse({ value, onPick, title, needsWrite, source, disabled }: BrowseProps) {
  const t = useT(messages)
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button disabled={disabled} onPress={() => setOpen(true)}>
        {t('browse')}
      </Button>
      <FolderPicker
        open={open}
        title={title}
        start={value}
        needsWrite={needsWrite}
        source={source}
        onClose={() => setOpen(false)}
        onPick={(path) => {
          onPick(path)
          setOpen(false)
        }}
      />
    </>
  )
}

/** A folder field's input with its Browse beside it, as setup lays them out. */
export function WithBrowse({ children, ...browse }: BrowseProps & { children: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', gap: s['2'] }}>
      <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
      <Browse {...browse} />
    </View>
  )
}

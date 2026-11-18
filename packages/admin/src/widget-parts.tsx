'use client'

// SPDX-License-Identifier: AGPL-3.0-only
// The parts every dashboard widget draws with (moved out of widgets.tsx with HT-60, so the newer
// widgets have files of their own): the frame around a query with its loading and error states,
// the empty state that fits a short widget, the "more in" line, and the admin's type sizes.

import { useLocale, useT } from '@highsea-tv/i18n/react'
import type { WidgetKind, WidgetSource } from '@highsea-tv/personalization/widgets'
import { widgetMessages } from '@highsea-tv/personalization/widgets'
import { type Query, useQuery } from '@highsea-tv/sdk/react'
import { admin } from '@highsea-tv/tokens'
import {
  Button,
  EmptyState,
  Press,
  Skeleton,
  SkeletonText,
  Text,
  tokens,
  type WidgetEditorFrameProps,
  WidgetFrame,
} from '@highsea-tv/ui/native'
import { createContext, type ReactNode, useContext } from 'react'
import { View, type ViewStyle } from 'react-native'
import { widgets as messages } from './dashboard-messages.ts'

export type WidgetProps = {
  frame: WidgetEditorFrameProps
  /** The placement's settings, filled from the widget's defaults by the server. */
  settings: Record<string, unknown>
  /** Header actions: Remove, in customize mode. */
  actions?: ReactNode
  /** Opens the widget's settings, where the dashboard can (Weather's "Choose a place"). */
  configure?: () => void
}

const s = tokens.space
const ui = tokens.adminText.ui
const figure = tokens.adminText.figure

/** A list's rows, as react-native-web draws a `listitem` View (an `<li>`), for the clip. */
export const LIST_ROWS = ':scope > li, :scope > [role="listitem"]'

/**
 * Whether this server has a source yet: `undefined` until public info answers. Every widget asks
 * under one key; the SDK keeps each answer per widget, and it's a small public call.
 */
export function useSource(source: WidgetSource): boolean | undefined {
  const info = useQuery('public-info', (c) => c.system.publicInfo())
  return info.status === 'success' ? info.data.sources.includes(source) : undefined
}

/** The admin's ui type, 13. */
export function Ui(props: Omit<Parameters<typeof Text>[0], 'size' | 'leading'>) {
  return <Text size={ui.size} leading={ui.leading} {...props} />
}

/** A figure in mono 12 (the admin's `figure`). */
export function Fig(props: Omit<Parameters<typeof Text>[0], 'size' | 'leading' | 'mono'>) {
  return <Text size={figure.size} leading={figure.leading} mono color="text-3" {...props} />
}

/** A widget's frame, with its data's loading and error states handled. */
export function Widget<T>({
  kind,
  frame,
  actions,
  meta,
  query,
  skeleton,
  children,
}: Omit<WidgetProps, 'settings'> & {
  kind: WidgetKind
  meta?: (data: T) => ReactNode
  query: Query<T>
  skeleton?: ReactNode
  children: (data: T) => ReactNode
}) {
  const t = useT(messages)
  const tw = useT(widgetMessages)
  const locale = useLocale()
  const title = tw(`${kind}.title`)
  return (
    <Short.Provider value={isShort(frame)}>
      <WidgetFrame
        {...frame}
        title={title}
        // while arranging, the header needs its room for the handle and Remove
        meta={query.status === 'success' && meta && !frame.editing ? meta(query.data) : undefined}
        actions={actions}
      >
        {query.status === 'loading' ? (
          // Its own key: without one React hands this View's element to the loaded body's first
          // View, and react-native-web starts observing an element's layout only when it mounts
          // with `onLayout` (its useElementLayout observes once, on mount), so a body that measures
          // its width (the Queue's layout, Recently added's columns) never heard its size and drew
          // for the 1200 fallback at every span (HT-47).
          <View key="loading" aria-busy style={{ gap: s['2'] + s['0.5'] }}>
            {skeleton ?? (
              <>
                <Skeleton width={admin.skeleton.width.sm} height={admin.skeleton.title} />
                <SkeletonText lines={2} />
              </>
            )}
          </View>
        ) : query.status === 'error' ? (
          <Empty
            size="sm"
            tone="error"
            icon="alert"
            level={4}
            title={t('error', { widget: title.toLocaleLowerCase(locale) })}
            action={
              <Button size="sm" onPress={query.refetch}>
                {t('retry')}
              </Button>
            }
          >
            {query.error.message}
          </Empty>
        ) : (
          children(query.data)
        )}
      </WidgetFrame>
    </Short.Provider>
  )
}

/**
 * A widget's empty or error state: in the middle of the body when it fits, from the top when the
 * body has to scroll to show it all (an auto margin takes the free space and none when there is
 * none: https://www.w3.org/TR/css-flexbox-1/#auto-margins), so its button is never cut off.
 */
export function Empty(props: Parameters<typeof EmptyState>[0]) {
  const short = useContext(Short)
  // two rows hold the words and the button, not the disc and its room above and below
  if (short)
    return (
      <View
        role={props.tone === 'error' ? 'alert' : undefined}
        style={{ marginVertical: 'auto', flexShrink: 0, alignItems: 'center', gap: s['1.5'] }}
      >
        <Ui weight={600} align="center" accessibilityRole="header" aria-level={props.level}>
          {props.title}
        </Ui>
        {props.children ? (
          <Text variant="caption" color="text-2" align="center" numberOfLines={2}>
            {props.children}
          </Text>
        ) : null}
        {props.action ? (
          <View
            style={{
              alignSelf: 'stretch',
              flexDirection: 'row',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: s['2'],
              marginTop: s['0.5'],
            }}
          >
            {props.action}
          </View>
        ) : null}
      </View>
    )
  return (
    <View style={{ marginVertical: 'auto', flexShrink: 0 }}>
      <EmptyState {...props} />
    </View>
  )
}

/**
 * Whether the widget is at its shortest (two rows, or three in one column, where the words wrap):
 * its empty state then drops its disc.
 */
export const Short = createContext(false)
export const isShort = (frame: WidgetProps['frame']) =>
  frame.rows !== undefined && (frame.rows <= 2 || (frame.rows === 3 && (frame.span ?? 1) === 1))

/** A widget whose source this server doesn't have yet: its frame and what's true without it. */
export function Static({
  kind,
  frame,
  actions,
  meta,
  children,
}: Omit<WidgetProps, 'settings'> & { kind: WidgetKind; meta?: ReactNode; children: ReactNode }) {
  const tw = useT(widgetMessages)
  return (
    <Short.Provider value={isShort(frame)}>
      <WidgetFrame
        {...frame}
        title={tw(`${kind}.title`)}
        meta={frame.editing ? undefined : meta}
        actions={actions}
      >
        {children}
      </WidgetFrame>
    </Short.Provider>
  )
}

/** The line under a clipped list: "3 more in System". */
export function More({ count, page, path }: { count: number; page: string; path: string }) {
  const t = useT(messages)
  if (!count) return null
  return (
    <Press
      role="link"
      {...({ href: path } as object)}
      style={{ alignSelf: 'flex-start', flexShrink: 0, borderRadius: tokens.radius.sm }}
    >
      {({ hovered }) => (
        <Text
          variant="caption"
          color={hovered ? 'text' : 'text-3'}
          style={hovered ? { textDecorationLine: 'underline' } : undefined}
        >
          {t('more', { count, page })}
        </Text>
      )}
    </Press>
  )
}

/** The box a list fills and is clipped by. */
export const fill: ViewStyle = { minHeight: 0, flex: 1, overflow: 'hidden' }

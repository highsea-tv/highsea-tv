// SPDX-License-Identifier: AGPL-3.0-only
// Dashboard widgets (admin.md#main-area), drawn by the native renderer since D2
// (one-client-platform-d.md) at the web renderer's sizes (web/components/widget.tsx): `s1`, a
// `line` border, `radius-md`, 14 inside, in a 4/2/1-column grid (expanded, medium, compact) with
// a 12 gap. With `rows`, the grid has fixed 84 rows and each widget spans some of them; its body
// fills the height and clips. Edit mode dashes the border and shows the drag handle and resize
// corner; an editor passes its own interactive `handle` and `resize` in their place.
// On the web the grid is CSS grid through react-native-web's style pass-through
// (https://necolas.github.io/react-native-web/docs/styling/, https://drafts.csswg.org/css-grid-2/);
// elsewhere (a phone or TV never draws the admin) widgets stack in one column.
import { line, widget } from '@highsea-tv/tokens'
import type { ComponentRef, ReactNode, Ref } from 'react'
import { Platform, View, type ViewStyle } from 'react-native'
import { useRegularWindow } from './admin.tsx'
import { Icon } from './icon.tsx'
import { Text } from './text.tsx'
import { tokens, useTheme } from './theme.tsx'

const web = Platform.OS === 'web'
const d = tokens.density

/** How many columns the grid has: 4 in a regular window (from 768, the form-factor rule), else 1. */
export function useWidgetColumns(): 1 | 4 {
  return useRegularWindow() ? 4 : 1
}

export type WidgetGridProps = {
  children: ReactNode
  /** Fixed-height rows (84), for widgets that set `rows`. */
  rows?: boolean
  ref?: Ref<ComponentRef<typeof View>>
}

export function WidgetGrid({ children, rows = false, ref }: WidgetGridProps) {
  const cols = useWidgetColumns()
  return (
    <View
      ref={ref}
      style={
        (web
          ? {
              display: 'grid',
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              gridAutoRows: rows ? d.widgetRow : undefined,
              gap: d.widgetGap,
            }
          : { gap: d.widgetGap }) as unknown as ViewStyle
      }
    >
      {children}
    </View>
  )
}

export type WidgetFrameProps = {
  title: ReactNode
  /** The header's end: a live summary or the widget's own health. */
  meta?: ReactNode
  /** Header actions (a menu button). */
  actions?: ReactNode
  /** Columns to span in the 4-column grid. */
  span?: 1 | 2 | 3 | 4
  /** Rows to span in a `WidgetGrid` with `rows`. The body fills the height and clips. */
  rows?: number
  /** Customize mode: the drag handle and resize corner. */
  editing?: boolean
  /** In edit mode, in place of the decorative drag icon (a focusable handle with its own keys). */
  handle?: ReactNode
  /** In edit mode, in place of the decorative resize corner. */
  resize?: ReactNode
  /** An editor's own style over the frame's: a lifted widget's transform. */
  style?: ViewStyle
  /** An editor's hold on the frame. */
  ref?: Ref<ComponentRef<typeof View>>
  /** An editor's mark on the frame (react-native-web writes `dataSet` as `data-*`). */
  dataSet?: Record<string, string>
  children?: ReactNode
}

export function WidgetFrame({
  title,
  meta,
  actions,
  span = 1,
  rows,
  editing = false,
  handle,
  resize,
  style,
  ref,
  dataSet,
  children,
}: WidgetFrameProps) {
  const theme = useTheme()
  const cols = useWidgetColumns()
  const heading = tokens.adminText['widget-title']
  const columns = Math.min(span, cols)
  const place = web
    ? ({
        gridColumn: `span ${columns} / span ${columns}`,
        gridRow: rows ? `span ${rows} / span ${rows}` : undefined,
      } as unknown as ViewStyle)
    : null
  return (
    <View
      ref={ref}
      role="region"
      aria-label={typeof title === 'string' ? title : undefined}
      {...({ dataSet } as object)}
      style={[
        {
          position: 'relative',
          minWidth: 0,
          gap: tokens.space['2'] + tokens.space['0.5'],
          padding: d.widgetPadding,
          borderRadius: tokens.radius.md,
          borderWidth: line.thin,
          borderStyle: editing ? 'dashed' : 'solid',
          borderColor: editing ? theme.colors['line-strong'] : theme.colors.line,
          backgroundColor: theme.colors.s1,
          overflow: rows ? 'hidden' : undefined,
        },
        place,
        style,
      ]}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: tokens.space['2'],
          minHeight: widget.head,
        }}
      >
        {editing
          ? (handle ?? (
              <View style={{ marginLeft: -tokens.space['1'] }}>
                <Icon name="drag" size={tokens.icon.size.sm} color="text-3" />
              </View>
            ))
          : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          {typeof title === 'string' ? (
            <Text
              size={heading.size}
              leading={heading.leading}
              weight={600}
              role="heading"
              aria-level={3}
              numberOfLines={1}
            >
              {title}
            </Text>
          ) : (
            title
          )}
        </View>
        {meta ? (
          <View style={{ minWidth: 0, maxWidth: '50%', alignItems: 'flex-end' }}>
            {typeof meta === 'string' ? (
              <Text size={tokens.adminText.figure.size} leading={1.4} color="text-3" align="right">
                {meta}
              </Text>
            ) : (
              meta
            )}
          </View>
        ) : null}
        {actions}
      </View>
      {rows ? (
        <View
          {...({ dataSet: { widgetBody: '' } } as object)}
          style={{
            flex: 1,
            minHeight: 0,
            minWidth: 0,
            gap: tokens.space['2'] + tokens.space['0.5'],
            overflow: 'hidden',
          }}
        >
          {children}
        </View>
      ) : (
        children
      )}
      {editing
        ? (resize ?? (
            <View
              aria-hidden
              style={{
                position: 'absolute',
                right: tokens.space['1'],
                bottom: tokens.space['1'],
                width: widget.resizeMark,
                height: widget.resizeMark,
                borderRightWidth: line.thick,
                borderBottomWidth: line.thick,
                borderBottomRightRadius: tokens.radius['2xs'],
                borderColor: theme.colors['text-3'],
              }}
            />
          ))
        : null}
    </View>
  )
}

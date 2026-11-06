// SPDX-License-Identifier: AGPL-3.0-only
// The admin's dense data tables (docs/design-language/platforms/admin.md#tables), drawn once in
// the native renderer (one-client-platform-d.md › D2) at the web renderer's sizes
// (web/components/table.tsx): the frame on `s1` with its line, the toolbar, header cells at 11.5
// in `text-3`, rows 40 high that tint to `s2` on hover and focus, numeric cells in mono `text-2`
// at the end, and row actions shown on hover and focus.
// On the web the parts lay out as CSS tables, through react-native-web's style pass-through
// (https://necolas.github.io/react-native-web/docs/styling/), so columns size themselves to
// their content as `<table>` does (https://www.w3.org/TR/CSS22/tables.html#auto-table-layout),
// and carry ARIA's table roles (https://www.w3.org/TR/wai-aria-1.2/#table), which
// react-native-web writes as `role` (https://necolas.github.io/react-native-web/docs/accessibility/).
// Elsewhere (a phone or TV never draws the admin) they fall back to flex rows.
// A body of more than VIRTUAL_FROM rows draws only those near the screen, in the page's own
// scroller (the library's Virtual, TanStack Virtual's core: ./virtual.tsx), with a spacer row
// before and after them; a shorter one draws every row, so the page's find and the server's HTML
// have them all.
import {
  Children,
  type ComponentRef,
  createContext,
  isValidElement,
  type ReactNode,
  type Ref,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react'
import { type LayoutChangeEvent, Platform, View, type ViewStyle } from 'react-native'
import { Text } from './text.tsx'
import { tokens, useTheme } from './theme.tsx'
import { useScrollSourceOrNull, Virtual } from './virtual.tsx'

const s = tokens.space
const web = Platform.OS === 'web'
/** CSS table layout, which React Native's style types don't name. */
const css = (display: string, extra?: object) =>
  (web ? { display, ...extra } : {}) as unknown as ViewStyle

type RowState = { active: boolean; last: boolean }
const RowContext = createContext<RowState>({ active: false, last: false })
const LastContext = createContext(false)
/** A virtual body's measure for the row it holds. */
const MeasureContext = createContext<((e: LayoutChangeEvent) => void) | undefined>(undefined)

/**
 * Bodies longer than this draw only the rows near the screen. The admin's tables page on the
 * server, 50 or 60 rows at a time (Wanted, Subtitles, the library, Activity's history), so a first
 * page draws in full and a body is virtual from its first Show more.
 */
export const VIRTUAL_FROM = 60
/** Rows drawn past each end of the screen. */
const OVERSCAN = 10

/** The card a table sits in: `s1`, a `line` border, corners `lg`. */
export function TableFrame({ children, label }: { children: ReactNode; label?: string }) {
  const theme = useTheme()
  return (
    <View
      role={label ? 'region' : undefined}
      aria-label={label}
      style={{
        minWidth: 0,
        overflow: 'hidden',
        borderRadius: tokens.radius.lg,
        borderWidth: 1,
        borderColor: theme.colors.line,
        backgroundColor: theme.colors.s1,
      }}
    >
      {children}
    </View>
  )
}

/** The frame's header row: title, live summary, filter tabs, actions. */
export function TableToolbar({ children }: { children: ReactNode }) {
  const theme = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: s['3'],
        paddingHorizontal: s['3'] + s['0.5'],
        paddingVertical: s['3'],
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.line,
      }}
    >
      {children}
    </View>
  )
}

export type TableProps = {
  children: ReactNode
  /** The table's name, which also names its scroller when it scrolls sideways. */
  label?: string
  /** The id of a heading that names it. */
  labelledBy?: string
  /** The table's own minimum width, past which it scrolls sideways. */
  minWidth?: number
}

/**
 * When the table is wider than its frame (a phone, or 200% text) it scrolls sideways, and the
 * scroller becomes a tab stop (a region named by the table, when it has a name), so a keyboard
 * can scroll it too (WCAG 2.1.1).
 */
export function Table({ children, label, labelledBy, minWidth }: TableProps) {
  const theme = useTheme()
  const [outer, setOuter] = useState(0)
  const [inner, setInner] = useState(0)
  const scrolls = inner > outer + 1 && outer > 0
  const named = Boolean(label || labelledBy)
  return (
    <View
      onLayout={(e) => setOuter(e.nativeEvent.layout.width)}
      focusable={scrolls || undefined}
      role={scrolls && named ? 'region' : undefined}
      aria-label={scrolls ? label : undefined}
      aria-labelledby={scrolls ? labelledBy : undefined}
      style={[
        { position: 'relative', minWidth: 0 },
        css('block', { overflowX: 'auto', overflowY: 'hidden' }),
        !web ? { overflow: 'hidden' } : null,
      ]}
    >
      <View
        role="table"
        aria-label={label}
        aria-labelledby={labelledBy}
        onLayout={(e) => setInner(e.nativeEvent.layout.width)}
        style={[
          { width: '100%', minWidth, backgroundColor: 'transparent' },
          css('table', { borderCollapse: 'collapse' }),
          { borderColor: theme.colors.line },
        ]}
      >
        {children}
      </View>
    </View>
  )
}

export function TableHeader({ children }: { children: ReactNode }) {
  return (
    <View role="rowgroup" style={css('table-header-group')}>
      {children}
    </View>
  )
}

/** A virtual body's room before and after its drawn rows: a row with no cells. */
const spacerRow = (size: number, ref?: Ref<ComponentRef<typeof View>>) => (
  <View ref={ref} aria-hidden style={[css('table-row'), { height: size }]} />
)

/** The rows. The last row has no line under it: the frame's border closes the table. */
export function TableBody({ children }: { children: ReactNode }) {
  const rows = Children.toArray(children).filter(isValidElement)
  const virtual = useScrollSourceOrNull() !== null && rows.length > VIRTUAL_FROM
  return (
    <View role="rowgroup" style={css('table-row-group')}>
      {virtual ? (
        <Virtual
          count={rows.length}
          estimateSize={() => tokens.density.rowSingle}
          getKey={(i) => rows[i]?.key ?? i}
          overscan={OVERSCAN}
          spacer={spacerRow}
          render={(i, onLayout) => (
            <MeasureContext.Provider value={onLayout}>
              <LastContext.Provider value={i === rows.length - 1}>{rows[i]}</LastContext.Provider>
            </MeasureContext.Provider>
          )}
        />
      ) : (
        rows.map((row, i) => (
          <LastContext.Provider key={row.key ?? i} value={i === rows.length - 1}>
            {row}
          </LastContext.Provider>
        ))
      )}
    </View>
  )
}

export type TableRowProps = {
  children: ReactNode
  /** A picked row, tinted `accent-soft`. */
  selected?: boolean
  /** Its test id. */
  testID?: string
}

/** A row: `s2` on hover and while focus is inside it, `accent-soft` when picked. */
export function TableRow({ children, selected, testID }: TableRowProps) {
  const theme = useTheme()
  const last = useContext(LastContext)
  const measure = useContext(MeasureContext)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const active = hovered || focused
  const state = useMemo(() => ({ active, last }), [active, last])
  // react-native-web forwards pointer and focus events, which bubble as React's do
  // (react-native-web's modules/forwardedProps)
  const events = web
    ? {
        onPointerEnter: () => setHovered(true),
        onPointerLeave: () => setHovered(false),
        onFocus: () => setFocused(true),
        onBlur: () => setFocused(false),
      }
    : {}
  return (
    <RowContext.Provider value={state}>
      <View
        role="row"
        testID={testID}
        onLayout={measure}
        aria-selected={selected || undefined}
        {...events}
        style={[
          css('table-row'),
          !web ? { flexDirection: 'row', alignItems: 'center' } : null,
          {
            backgroundColor: selected
              ? theme.colors['accent-soft']
              : active
                ? theme.colors.s2
                : 'transparent',
          },
          web ? ({ transition: 'background-color 120ms' } as unknown as ViewStyle) : null,
        ]}
      >
        {children}
      </View>
    </RowContext.Provider>
  )
}

type Align = { numeric?: boolean; align?: 'start' | 'end' | 'center' }
const textAlign = ({ numeric, align }: Align) =>
  align === 'center' ? 'center' : align === 'end' || numeric ? 'right' : 'left'
const justify = ({ numeric, align }: Align) =>
  align === 'center' ? 'center' : align === 'end' || numeric ? 'flex-end' : 'flex-start'

export type TableHeadProps = Align & {
  children?: ReactNode
  /** A width for the column, in px or a percentage. */
  width?: number | `${number}%`
  /**
   * A header the table only names for assistive technology (a row's actions): its words are read
   * but not shown, in a visually hidden box (the web renderer's `sr-only`).
   */
  hidden?: boolean
}

/** Header cell: Geist 500 at 11.5 in `text-3`, 36 high, with the line under it. */
export function TableHead({ children, numeric, align, width, hidden }: TableHeadProps) {
  const theme = useTheme()
  const t = tokens.adminText['table-header']
  return (
    <View
      role="columnheader"
      style={[
        css('table-cell', {
          verticalAlign: 'middle',
          whiteSpace: 'nowrap',
          textAlign: textAlign({ numeric, align }),
        }),
        {
          height: 36,
          width,
          paddingHorizontal: s['3'],
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.line,
        },
        !web ? { flex: width ? undefined : 1, justifyContent: 'center' } : null,
      ]}
    >
      {hidden ? (
        typeof children === 'string' ? (
          <View
            pointerEvents="none"
            style={{ position: 'absolute', width: 1, height: 1, margin: -1, overflow: 'hidden' }}
          >
            <Text numberOfLines={1}>{children}</Text>
          </View>
        ) : null
      ) : typeof children === 'string' ? (
        <Text
          size={t.size}
          leading={t.leading}
          weight={500}
          color="text-3"
          align={textAlign({ numeric, align })}
          numberOfLines={1}
        >
          {children}
        </Text>
      ) : (
        <View style={{ flexDirection: 'row', justifyContent: justify({ numeric, align }) }}>
          {children}
        </View>
      )}
    </View>
  )
}

export type TableCellProps = Align & {
  children?: ReactNode
  /** Two lines high (a title cell's row), not one. */
  tall?: boolean
  /** The cell may wrap and is held to this width, in px. */
  maxWidth?: number
  /** Spans this many columns. */
  span?: number
}

/**
 * Body cell, 40 high (60 for a title cell's row). `numeric` cells are mono 12 `text-2`,
 * tabular and end-aligned. Strings are drawn at the admin's 13; anything else lays out in a row.
 */
export function TableCell({ children, numeric, align, tall, maxWidth, span }: TableCellProps) {
  const theme = useTheme()
  const { last } = useContext(RowContext)
  const ui = tokens.adminText.ui
  const figure = tokens.adminText.figure
  const content =
    typeof children === 'string' || typeof children === 'number' ? (
      numeric ? (
        <Text
          size={figure.size}
          leading={figure.leading}
          mono
          color="text-2"
          align={textAlign({ numeric, align })}
          numberOfLines={1}
          style={web ? ({ fontVariantNumeric: 'tabular-nums' } as object) : undefined}
        >
          {children}
        </Text>
      ) : (
        <Text
          size={ui.size}
          leading={ui.leading}
          align={textAlign({ numeric, align })}
          numberOfLines={maxWidth ? undefined : 1}
        >
          {children}
        </Text>
      )
    ) : (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: s['2'],
          justifyContent: justify({ numeric, align }),
          minWidth: 0,
        }}
      >
        {children}
      </View>
    )
  return (
    <View
      role="cell"
      {...(span && web ? ({ 'aria-colspan': span } as object) : null)}
      style={[
        css('table-cell', {
          verticalAlign: 'middle',
          whiteSpace: maxWidth ? 'normal' : 'nowrap',
          textAlign: textAlign({ numeric, align }),
        }),
        {
          height: tall ? tokens.density.row : tokens.density.rowSingle,
          maxWidth,
          paddingHorizontal: s['3'],
          paddingVertical: s['2'],
          borderBottomWidth: last ? 0 : 1,
          borderBottomColor: theme.colors.line,
        },
        !web ? { flex: 1, justifyContent: 'center' } : null,
      ]}
    >
      {content}
    </View>
  )
}

const NO_HOVER = '(hover: none)'
/** The DOM's `matchMedia`, which React Native's types leave out: only the web has it. */
type MatchMedia = (query: string) => {
  readonly matches: boolean
  addEventListener(type: 'change', listener: () => void): void
  removeEventListener(type: 'change', listener: () => void): void
}
const media = () => (globalThis as { matchMedia?: MatchMedia }).matchMedia
const subscribeHover = (change: () => void) => {
  const query = media()?.(NO_HOVER)
  if (!query) return () => {}
  query.addEventListener('change', change)
  return () => query.removeEventListener('change', change)
}

/**
 * Whether the screen has no hover (Media Queries 4's `hover: none`,
 * https://drafts.csswg.org/mediaqueries-4/#hover). The server takes it as hovering, as the
 * admin is drawn with a pointer, and the browser corrects it after hydrating.
 */
function useNoHover(): boolean {
  return useSyncExternalStore(
    subscribeHover,
    () => (web ? (media()?.(NO_HOVER).matches ?? false) : true),
    () => false,
  )
}

/** Row actions: shown on hover and while focus is inside the row. Always also put them in a row menu. */
export function RowActions({ children }: { children: ReactNode }) {
  const { active } = useContext(RowContext)
  // a touch screen has no hover, so they always show there (the web's `@media (hover: none)`)
  const touch = useNoHover()
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: s['1'],
          opacity: active || touch ? 1 : 0,
        },
        web ? ({ transition: 'opacity 120ms' } as unknown as ViewStyle) : null,
      ]}
    >
      {children}
    </View>
  )
}

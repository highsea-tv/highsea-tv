// SPDX-License-Identifier: AGPL-3.0-only
// A menu of actions or choices, and a pointer's popover: the web renderer's Radix DropdownMenu
// and Popover (web/components/menu.tsx, popover.tsx), drawn once here for every form factor.
// - Menu, by the form factor: touch's is a Sheet of choices, as iOS shows an action sheet; a
//   pointer's a dropdown hung from its trigger; the TV's TvMenu over the page, focus kept inside.
// - Popover: a pointer's panel hung from its trigger (Alerts, a film's Audio and subtitles).
// A pointer's menu follows WAI-ARIA's menu button pattern
// (https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/): the trigger says it opens a menu
// (Button's `hasPopup`) and whether it's open (`accessibilityState.expanded`); the menu is
// `role="menu"` named by its title, its items `menuitem` (`menuitemradio` with `checked` for a
// choice); it opens with focus on the choice in force or the first item; Down, Up, Home and End
// move between the items, wrapping; Enter and Space choose one, which closes it; Escape, Tab and a
// press outside close it (a `keepsOpen` item, a check of several, leaves it open), and focus goes back to the trigger, unless the choice leaves the screen
// or takes the trigger away (MenuOption's `closes`). Both float on react-native-web's
// Modal (https://necolas.github.io/react-native-web/docs/modal/), which does the rest: Escape
// asks it to close (its onRequestClose), it keeps Tab inside while open and gives focus back to
// what had it when it closes (its ModalFocusTrap), and it's `aria-modal`. The panel is placed
// under its trigger, measured in the window (https://reactnative.dev/docs/the-new-architecture/layout-measurements),
// flipping above when there's no room below and kept inside the window's edges, as Radix's
// collision padding does: the menu's 6 from its trigger at its end edge, the popover's 8 at its
// start; on `s3` edged in `line-strong` and `radius.md` round over elevation 4 (overlay.ts's
// floatingSurface).
import {
  type ComponentRef,
  Fragment,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import {
  type LayoutRectangle,
  Modal,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native'
import { menuItemRole } from './aria.ts'
import { ControlText } from './control.tsx'
import { focusedElement, holdFocusReturn } from './dom'
import { Icon, type IconName } from './icon.tsx'
import { Press } from './press.tsx'
import { Sheet } from './sheet.tsx'
import { Text } from './text.tsx'
import { tokens, useControl, useTheme } from './theme.tsx'
import { TvMenu } from './tv/cards.tsx'

const { space } = tokens

type Handle = ComponentRef<typeof View>

/** Where a panel hangs: the menu's side offset, alignment and collision padding, and its size. */
const MENU = { offset: 6, edge: 8, minWidth: 224, pad: space['1'] + space['0.5'] }
const POPOVER = { offset: space['2'], edge: space['3'], width: 288, pad: space['4'] }
/** A menu's row: the web's min-h-8, gap-2.5, px-2.5 and py-1.5 (overlay.ts's menuItem). */
const ITEM = {
  height: space['8'],
  gap: space['2'] + space['0.5'],
  padX: space['2'] + space['0.5'],
  padY: space['1'] + space['0.5'],
}
/** Touch's row: touch's 44 target. */
const TOUCH_ITEM = tokens.targets.touch

export type MenuOption = {
  label: string
  /** A line under the label: Restart to update's "highsea 1.0.1 is ready. You have 1.0.0." */
  detail?: string
  icon?: IconName
  onSelect: () => void
  /** The choice in force: checked, and focus starts on it. Makes the items choices (menuitemradio). */
  current?: boolean
  disabled?: boolean
  /**
   * What choosing it does to the menu's trigger, which `onClose` is told: it stays (by default,
   * and focus goes back to it), it goes (`gone`: Remove from Continue watching, where the screen
   * moves focus on), or the screen leaves (`leave`: Go to the film). Focus isn't given back to a
   * trigger that's gone or leaving.
   */
  closes?: Exclude<MenuClose, 'stay'>
  /**
   * A pointer: the heading of the group it's in. Consecutive items with the same group are drawn
   * under one heading, with a line above every group but the first, as the web renderer's
   * MenuLabel and MenuSeparator (`role="group"` named by it).
   */
  group?: string
  /**
   * One of several chosen at once (a tag picker's): a check while it's on, read as
   * `menuitemcheckbox`. Independent of `current`.
   */
  checked?: boolean
  /** Choosing it leaves the menu open, so several can be checked in turn (Radix's prevented `onSelect`). */
  keepsOpen?: boolean
  /** Its label in mono (a select's option of a release group or a folder). */
  mono?: boolean
  /** A destructive action (Delete, Remove), in the danger label colour (the web's MenuItem `danger`). */
  danger?: boolean
}

/**
 * How a menu closed: Escape, Tab, a press outside, Back or a choice that keeps its trigger
 * (`stay`); a choice that takes the trigger away (`gone`); one that leaves the screen (`leave`).
 */
export type MenuClose = 'stay' | 'gone' | 'leave'

export type MenuProps = {
  /** The menu's name: the sheet's and the TV's title, and what a pointer's menu is read as. */
  title: string
  /** The TV: a line under the title. */
  detail?: string | null
  items: readonly MenuOption[]
  open: boolean
  /**
   * Closes it, told how (MenuClose); choosing an item closes it too, before its `onSelect`. Back
   * on the TV is the app's to wire to this.
   */
  onClose: (how: MenuClose) => void
  /** A pointer: the trigger the menu hangs from; without one it's centred in the window. */
  anchor?: RefObject<Handle | null>
  /** The TV: its options in columns (a library's genres, three across). */
  columns?: number
  /**
   * A pointer: which of its edges meets the trigger's (`end` by default, a menu button's), and
   * at least the trigger's width (a select's list, as Radix's `--radix-select-trigger-width`).
   */
  align?: 'start' | 'end'
  matchWidth?: boolean
}

export function Menu(props: MenuProps) {
  const input = useTheme().formFactor.input
  if (input === 'tv') return props.open ? <TvForm {...props} /> : null
  if (input === 'pointer') return <PointerMenu {...props} />
  return <TouchMenu {...props} />
}

const choose = (item: MenuOption, onClose: (how: MenuClose) => void) => () => {
  if (!item.keepsOpen) onClose(item.closes ?? 'stay')
  item.onSelect()
}

/** An item's role: a choice (`current`), a check of several (`checked`) or an action. */
const itemRole = (x: MenuOption, choices: boolean) =>
  menuItemRole(
    choices && x.checked === undefined,
    x.checked ?? !!x.current,
    !!x.disabled,
    x.checked !== undefined,
  )

/** Consecutive items under one group's heading, with each item's index in the menu. */
function groupsOf(items: readonly MenuOption[]) {
  const runs: { group?: string; at: number[] }[] = []
  items.forEach((x, i) => {
    const last = runs[runs.length - 1]
    if (last && last.group === x.group) last.at.push(i)
    else runs.push({ group: x.group, at: [i] })
  })
  return runs
}

/**
 * Holds back the focus a Modal gives back as it closes (./dom.web.ts's holdFocusReturn) when the
 * close takes the trigger away or leaves the screen: `close` tells `onClose` how, and `dismissed`,
 * the Modal's `onDismiss`, lets focus go again. What had focus is taken as the Modal opens, in a
 * layout effect, before the Modal's own passive effect takes the same element.
 */
function useFocusReturn(open: boolean, onClose: (how: MenuClose) => void) {
  const opener = useRef<unknown>(null)
  const release = useRef<(() => void) | null>(null)
  const dismissed = () => {
    release.current?.()
    release.current = null
  }
  useLayoutEffect(() => {
    if (open) opener.current = focusedElement()
  }, [open])
  // never left held past the menu
  useEffect(() => () => release.current?.(), [])
  const close = (how: MenuClose = 'stay') => {
    if (how !== 'stay' && !release.current) release.current = holdFocusReturn(opener.current)
    onClose(how)
  }
  return { close, dismissed }
}

function TvForm({ title, detail, items, onClose, columns }: MenuProps) {
  return (
    <TvMenu
      title={title}
      detail={detail}
      columns={columns}
      options={items
        .filter((x) => !x.disabled)
        .map((x) => ({
          label: x.label,
          icon: x.icon,
          current: x.current,
          onPress: choose(x, onClose),
        }))}
    />
  )
}

function TouchMenu({ title, items, open, onClose: told }: MenuProps) {
  const theme = useTheme()
  const m = useControl('md')
  const choices = items.some((x) => x.current !== undefined)
  // on the web the Sheet is react-native-web's Modal too, which gives focus back as it closes
  const { close: onClose, dismissed } = useFocusReturn(open, told)
  return (
    <Sheet open={open} onClose={() => onClose('stay')} onDismiss={dismissed} title={title}>
      <View accessibilityRole="menu" accessibilityLabel={title}>
        {items.map((x, i) => (
          <Press
            // labels may repeat (two servers of one name); the order is the menu's own
            // biome-ignore lint/suspicious/noArrayIndexKey: a menu's items are fixed while it's open
            key={i}
            onPress={choose(x, onClose)}
            disabled={x.disabled}
            {...itemRole(x, choices)}
            style={{
              minHeight: TOUCH_ITEM,
              flexDirection: 'row',
              alignItems: 'center',
              gap: space['3'],
              opacity: x.disabled ? tokens.controls.disabledOpacity : 1,
            }}
          >
            {x.icon ? <Icon name={x.icon} color={x.danger ? 'badge-danger' : 'text-2'} /> : null}
            <View style={{ flex: 1 }}>
              <ControlText
                m={m}
                weight={400}
                color={theme.colors[x.danger ? 'badge-danger' : 'text']}
              >
                {x.label}
              </ControlText>
              {x.detail ? (
                <Text variant="caption" color="text-3">
                  {x.detail}
                </Text>
              ) : null}
            </View>
            {x.current || x.checked ? <Icon name="check" color="accent-text" /> : null}
          </Press>
        ))}
      </View>
    </Sheet>
  )
}

function PointerMenu({
  title,
  items,
  open,
  onClose: told,
  anchor,
  align = 'end',
  matchWidth,
}: MenuProps) {
  const theme = useTheme()
  const { close: onClose, dismissed } = useFocusReturn(open, told)
  const m = useControl('sm')
  const refs = useRef<(Handle | null)[]>([])
  const choices = items.some((x) => x.current !== undefined)
  const enabled = items.map((x, i) => (x.disabled ? -1 : i)).filter((i) => i >= 0)
  const start = items.findIndex((x) => x.current && !x.disabled)
  const focusAt = (i: number) => (refs.current[i] as { focus?: () => void } | null)?.focus?.()
  const move = (key: string, from: number) => {
    const at = enabled.indexOf(from)
    const to =
      key === 'Home'
        ? 0
        : key === 'End'
          ? enabled.length - 1
          : (at + (key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length
    focusAt(enabled[to] ?? 0)
  }
  const item = (i: number) => {
    const x = items[i] as MenuOption
    return (
      <Press
        // an item's index in the menu: labels may repeat, and a menu's items are fixed while it's open
        key={i}
        ref={(el) => {
          refs.current[i] = el
        }}
        onPress={choose(x, onClose)}
        disabled={x.disabled}
        ring={false}
        {...itemRole(x, choices)}
        onKeyDown={(e) => {
          const key = e.nativeEvent.key
          // Space chooses an item as Enter does: Press presses on its release for a menu's
          // roles (./dom.web.ts), so it isn't handled here too
          if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End') {
            e.preventDefault()
            move(key, i)
          } else if (key === 'Tab') {
            e.preventDefault()
            onClose('stay')
          }
        }}
        style={(s) => ({
          minHeight: ITEM.height,
          flexDirection: 'row',
          alignItems: 'center',
          gap: ITEM.gap,
          paddingHorizontal: ITEM.padX,
          paddingVertical: ITEM.padY,
          borderRadius: tokens.radius.sm,
          backgroundColor: s.hovered || s.focused ? theme.colors.s4 : 'transparent',
          opacity: x.disabled ? tokens.controls.disabledOpacity : 1,
        })}
      >
        {(s) => {
          const color = x.danger ? 'badge-danger' : s.hovered || s.focused ? 'text' : 'text-2'
          return (
            <>
              {x.icon ? <Icon name={x.icon} size={m.icon} color={color} /> : null}
              <View style={{ flex: 1 }}>
                <ControlText m={m} weight={400} mono={x.mono} color={theme.colors[color]} lines={1}>
                  {x.label}
                </ControlText>
                {/* the prototype's MenuItem's second line, text-caption text-text-3 */}
                {x.detail ? (
                  <Text variant="caption" color="text-3">
                    {x.detail}
                  </Text>
                ) : null}
              </View>
              {x.current || x.checked ? (
                <Icon name="check" size={m.icon} color={x.checked ? 'accent-text' : 'text'} />
              ) : null}
            </>
          )
        }}
      </Press>
    )
  }
  return (
    <Anchored
      open={open}
      onClose={onClose}
      onDismiss={dismissed}
      anchor={anchor}
      place={MENU}
      align={align}
      matchWidth={matchWidth}
      onShown={() => focusAt(start >= 0 ? start : (enabled[0] ?? 0))}
      style={{ minWidth: MENU.minWidth, padding: MENU.pad }}
      label={title}
      role="menu"
    >
      {groupsOf(items).map((run, r) =>
        run.group === undefined ? (
          // a line above a run without a heading too, after another run (a picker's Manage tags)
          <Fragment key={`-${run.at[0]}`}>
            {r > 0 ? <MenuLine /> : null}
            {run.at.map(item)}
          </Fragment>
        ) : (
          <View key={`${run.group}-${run.at[0]}`} role="group" aria-label={run.group}>
            {r > 0 ? <MenuLine /> : null}
            <View
              style={{
                paddingHorizontal: ITEM.padX,
                paddingTop: space['2'],
                paddingBottom: space['1'],
              }}
            >
              <Text variant="label" mono color="text-3" aria-hidden>
                {run.group}
              </Text>
            </View>
            {run.at.map(item)}
          </View>
        ),
      )}
    </Anchored>
  )
}

/** Between groups: the web renderer's MenuSeparator, a `line` hairline 4 in and 6 clear. */
function MenuLine() {
  const theme = useTheme()
  return (
    <View
      aria-hidden
      style={{
        height: 1,
        marginHorizontal: space['1'],
        marginVertical: space['1'] + space['0.5'],
        backgroundColor: theme.colors.line,
      }}
    />
  )
}

export type PopoverProps = {
  /** What it's read as (`role="dialog"`). */
  title: string
  open: boolean
  onClose: () => void
  /** The trigger it hangs from. */
  anchor: RefObject<Handle | null>
  children: ReactNode
  /** Its width, in points (288 by default, the web's w-72). */
  width?: number
  /**
   * Which of its edges meets the trigger's: `start` by default, or `end`, as Alerts' panel hangs
   * from the top bar's end (web/shell.tsx's align="end").
   */
  align?: 'start' | 'end'
  /** Its 16 inset (by default); false for a panel whose list runs to its edges, as Alerts'. */
  padded?: boolean
}

/**
 * A panel hung from a pointer's trigger, its start edge at the trigger's or its end (`align`;
 * Alerts, Audio and subtitles). Focus moves to its first control as it opens; Escape and a press outside close it,
 * and focus goes back to the trigger (react-native-web's Modal). Touch and the TV show what it
 * holds another way (a Sheet, a dialog of their own), so it draws nothing there.
 */
export function Popover({
  title,
  open,
  onClose,
  anchor,
  children,
  width,
  align = 'start',
  padded = true,
}: PopoverProps) {
  if (useTheme().formFactor.input !== 'pointer') return null
  return (
    <Anchored
      open={open}
      onClose={onClose}
      anchor={anchor}
      place={POPOVER}
      align={align}
      style={{ width: width ?? POPOVER.width, padding: padded ? POPOVER.pad : 0 }}
      label={title}
      role="dialog"
    >
      {children}
    </Anchored>
  )
}

/**
 * A floating panel over a transparent Modal, placed by its trigger once both are measured: under
 * it, or above when it doesn't fit below, held `edge` inside the window; centred in the window
 * when there's no trigger. Drawn unseen until then, so it never shows in the wrong place.
 */
function Anchored({
  open,
  onClose,
  onDismiss,
  anchor,
  place,
  align,
  onShown,
  style,
  label,
  role,
  matchWidth,
  children,
}: {
  open: boolean
  onClose: () => void
  /** Once the Modal has gone, its content unmounted. */
  onDismiss?: () => void
  anchor?: RefObject<Handle | null>
  place: { offset: number; edge: number }
  align: 'start' | 'end'
  onShown?: () => void
  style: { minWidth?: number; width?: number; padding: number }
  label: string
  role: 'menu' | 'dialog'
  /** At least the trigger's width. */
  matchWidth?: boolean
  children: ReactNode
}) {
  const theme = useTheme()
  const window = useWindowDimensions()
  const [trigger, setTrigger] = useState<LayoutRectangle | null>(null)
  const [panel, setPanel] = useState<{ width: number; height: number } | null>(null)
  const shown = useRef(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: the window's size is a trigger, not a value read
  useEffect(() => {
    if (!open) {
      setTrigger(null)
      setPanel(null)
      shown.current = false
      return
    }
    anchor?.current?.measureInWindow((x, y, width, height) => setTrigger({ x, y, width, height }))
    // measured again when the window changes, since the trigger moves with the layout
  }, [open, anchor, window.width, window.height])
  // with no trigger to hang from, it's centred in the window once its own size is known, so a
  // menu opened without one is never an unseen Modal taking the page's clicks and keys
  const free = !anchor?.current
  const ready = panel && (trigger || free)
  useEffect(() => {
    if (ready && !shown.current) {
      shown.current = true
      onShown?.()
    }
  }, [ready, onShown])
  let left = place.edge
  let top = place.edge
  // never taller than the room it has: a long menu scrolls inside the window rather than running
  // off it, as Radix's content does with its available height (the web renderer's,
  // https://www.radix-ui.com/primitives/docs/components/dropdown-menu#constrain-the-contentsub-content-size)
  let room = window.height - place.edge * 2
  if (panel && !trigger && free) {
    left = Math.max(place.edge, (window.width - panel.width) / 2)
    top = Math.max(place.edge, (window.height - panel.height) / 2)
  } else if (trigger && panel) {
    const x = align === 'end' ? trigger.x + trigger.width - panel.width : trigger.x
    left = Math.max(place.edge, Math.min(x, window.width - place.edge - panel.width))
    const below = trigger.y + trigger.height + place.offset
    const roomBelow = window.height - place.edge - below
    const roomAbove = trigger.y - place.offset - place.edge
    // below when it fits there, or when there's more room below than above
    const under = panel.height <= roomBelow || roomBelow >= roomAbove
    room = Math.max(0, under ? roomBelow : roomAbove)
    top = under ? below : trigger.y - place.offset - Math.min(panel.height, room)
  }
  return (
    <Modal
      visible={open}
      transparent
      animationType="none"
      onRequestClose={onClose}
      onDismiss={onDismiss}
    >
      {/* the panel comes first, so the Modal's focus trap finds its items before the backdrop */}
      <View
        role={role}
        aria-label={label}
        onLayout={(e) =>
          setPanel({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })
        }
        style={{
          position: 'absolute',
          left,
          top,
          zIndex: 1,
          maxWidth: window.width - place.edge * 2,
          maxHeight: room,
          opacity: ready ? 1 : 0,
          borderRadius: tokens.radius.md,
          borderWidth: 1,
          borderColor: theme.colors['line-strong'],
          backgroundColor: theme.colors.s3,
          boxShadow: tokens.elevation[4].boxShadow,
          ...style,
          ...(matchWidth && trigger
            ? { minWidth: Math.max(style.minWidth ?? 0, trigger.width) }
            : null),
        }}
      >
        {/* its own height while it fits, scrolling once the room is less */}
        <ScrollView style={{ flexGrow: 0, flexShrink: 1 }}>{children}</ScrollView>
      </View>
      {/* a press outside closes it; never a focus stop of its own */}
      <Pressable
        onPress={onClose}
        focusable={false}
        accessible={false}
        importantForAccessibility="no"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
    </Modal>
  )
}

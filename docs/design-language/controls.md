# Controls

- **Status:** design system 1.1, approved by the owner on 2026-11-01 ([the plan](../plans/design-system-1-1.md)).
- **In code:** [`packages/tokens/src/controls.ts`](../../packages/tokens/src/controls.ts), the `--control-*` variables in the tokens' CSS, and `nativeTokens.controls`. The form factor is in [`packages/tokens/src/form-factor.ts`](../../packages/tokens/src/form-factor.ts).

A control is anything a person presses or types into: a button, an icon button, a text field, a select, a text area, a search field, a segmented control, tabs, a chip, a checkbox, a radio and a switch. Every control in every app is specified once, here, and drawn by one component in `@highsea-tv/ui`. Apps differ in layout and size because their screens and inputs differ. They never differ because a screen drew a control of its own.

## The spec

Two sizes, in px with a pointer:

| | Height | Side padding | Field padding | Gap | Icon | Text |
| --- | --- | --- | --- | --- | --- | --- |
| **md** (the default) | 36 | 16 | 12 | 8 | 16 | 14, `form` |
| **sm** (dense places) | 30 | 12 | 10 | 6 | 14 | 13, `ui` |

- **Inputs and selects are 36,** the same as buttons, so a field and its button line up.
- **`sm` is for dense places only:** a table's row, a card, a widget's header. It's never in a row with `md`.
- **The corner is `radius-sm`** (8) for every control on every platform: icon buttons, segmented controls and tabs included.
- **A segmented control** is a track (`s2`) with a 3px inset and a thumb (`control-selected`) in the same corner, less the inset.

## One rule per platform

Each platform's values come from the spec by its rule, never from numbers of its own.

| Platform | Where | Geometry | Text | Hit area |
| --- | --- | --- | --- | --- |
| **Pointer** | The admin, the web client and the desktop app with a mouse | As specified | 14 and 13 (`adminText.form`, `ui`) | None: 36 and 30 already pass WCAG 2.5.8 |
| **Touch** | The phone, and the web on a coarse pointer | As specified | 16 (`mobileText.body`), so iOS never zooms into a field | 44 (`targets.touch`), invisible |
| **TV** | Apple TV and Android TV | 1.75 times, in screen units (1u is 19.2px at 1080p) | The TV's `button` (1.1u) and `pill` | None; the TV's icons never go under 1.4u |

- **Touch keeps the drawn size.** An invisible box around each control reaches 44 without changing its size or the layout: `Pressable`'s `hitSlop` in React Native, an `::after` box under `@media (pointer: coarse)` in the web renderer, and in the native renderer on the web, where react-native-web drops `hitSlop`, a transparent layer reaching past the control by the same insets.
- **Controls in a row keep at least an 8px gap** (`--control-row-gap`), so the 44 hit areas of 36 controls never overlap.
- **On the web,** the tokens set the pointer's values on `:root` and touch's under `@media (pointer: coarse)`. Any element can set a platform with `data-platform="pointer"`, `"touch"` or `"tv"`. The prototypes' phone and TV frames do this, so they draw the library's real components at the phone's and the TV's rules.
- **In React Native,** the rule is the form factor's input (below): the TV's on a TV, touch's on a phone and on the web with a coarse pointer, and the pointer's on the web with a mouse.

## The form factor

A screen's layout and its controls' rule come from one form factor: its input (pointer, touch or TV, the platforms above) joined with a width class.

| Width class | Where |
| --- | --- |
| **Compact** | A phone upright, and a window narrower than 768 |
| **Regular** | A phone on its side, a tablet, and a window 768 or wider |
| **TV** | A TV, whatever its width |

- **These aren't [spacing and layout](spacing-layout.md#breakpoints)'s breakpoints.** The rule's names are Apple's size classes, split at 768 by the [plan](../plans/one-client-platform.md). Spacing and layout's `compact` is below 600 (`breakpoints` in the tokens).
- **An iPad runs the phone app in an iPhone's window** (`supportsTablet: false`), so it's compact or regular touch as that window is.
- **It's defined once,** beside the control spec: the width class from 768, the form factors by name (`compact-touch`, `regular-pointer`, `tv` and the others) and the layouts the platform guides state, by their tokens. A form factor no guide describes has no layout of its own yet.
- **In React Native,** `ThemeProvider` resolves it once and `useFormFactor()` reads it. The input is the TV's on a TV, touch on iOS and Android, and on the web a pointer unless the primary pointer is coarse (`COARSE_POINTER`, which the tokens' CSS uses too), followed as it changes. The width class follows the window. A page rendered on the server is drawn regular with a pointer, and the browser corrects it after hydrating.
- **`ThemeProvider`'s `formFactor`** sets the input whatever the device, as the prototypes' frames do. Each frame is an iframe with its own window, so the phone's frame passes `touch`, the TV's `tv` and the web's nothing, and the width class follows the frame. An address's `?ff=` can carry an input or a whole form factor's name. An inner `ThemeProvider` without one keeps its outer one's.
- **A screen asks the rule, never the OS.** It lays out by `useFormFactor()`, and its controls draw by the rule's input, so one screen is right on every device and in every frame.

## Rules

- **Controls in one row share one size:** one height, one corner and one text size. A TV Play button larger than the buttons beside it is wrong, and so is a field taller than its button.
- **One shape.** `radius-sm` is a control's shape. Pills are kept for what isn't pressed as a control (badges and the TV's announcement pill) and for chips, which are pills at the control's height.
- **The media players' own controls** (play and pause, skip, the scrubber's buttons and volume) may stay round. They sit over the picture rather than in a row of controls.
- **What isn't a control in a row:** a list's items (a song, a server, a settings option), tiles, and the keys of an on-screen keyboard or PIN pad. They're marked `data-item`, and the players' own controls sit in `data-player-controls`, so the sweeps' row check leaves them out. A switch keeps its own track, and an avatar is round.
- **One look per kind.** There's one segmented control, one tab style for each place (segmented in a toolbar, a line under a page's title) and one chip.
- **Screens never pass a size of their own.** A component takes its size from the spec and the platform, and its colours from the roles below.

## Looks

Each state is a set of colour roles, the same on every platform, so a control follows any theme.

| Look | Fill | Edge | Label | Hover |
| --- | --- | --- | --- | --- |
| **Primary** | `accent-fill` | | `on-accent`, 600 | |
| **Secondary** | `s2` | `line-strong` | `text` | `s3` |
| **Ghost** | | | `text-2` | `s2`, `text` |
| **Danger** | `danger-fill` | | `on-danger`, 600 | |
| **Danger ghost** | | | `danger` | `s2` |
| **Overlay** (over artwork) | `control-overlay` (`text` at 12%) | | `text` | `control-overlay-hover` (18%) |
| **Field** | `s1` | `control-edge` | `text`, placeholder `text-3` | |
| **Field, focused** | `s1` | `focus` | | |
| **Field, invalid** | `s1` | `danger` | | |
| **Segmented track** | `s2` | | `text-2` | `text` |
| **Chosen segment, tab or chip** | `control-selected` | | `text`, 600 | |
| **Chip** | `s2` | `line-strong` | `text-2` | `text` |
| **Switch, off and on** | `control-edge`, then `accent-fill` | | | |

- **Disabled** controls keep their look at 45% opacity.
- **Pressed** controls scale to 0.97 ([motion](motion.md)); on the TV, focus scales buttons to 1.07 instead.
- **Focus** is the ring ([color](color.md), [accessibility](accessibility.md)) on the web and the TV's own ring on the TV.

## Contrast

The roles that mark a control are checked at 3:1 (WCAG 2.2's 1.4.11, non-text contrast) in every theme:

- **`control-edge`,** a field's edge, against `bg` through `s3`;
- **`control-selected`,** a chosen segment, against its track;
- **the focus ring** against every surface;
- **a chosen segment's label** on `control-selected`, at Lc 45 and 4.5:1.

`control-edge` and `control-selected` are derived, as the badge roles are: from `line-strong` and `s4`, lightened only as far as 3:1 needs. A theme author's own colours stay as they are. A custom accent's focus ring is lightened the same way.

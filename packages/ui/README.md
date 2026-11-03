# @highsea-tv/ui

highsea's one component library (ADR 0060). Its React Native renderer (`src/native`) is the one drawing of each component: on the phone and the TV, and on the web through react-native-web, for every client and its prototype (one-client-platform.md). What react-native-web leaves to the page, the renderer does once, in `Press` and `ScrollView`: a pointer's hover (the looks' hover roles), the keyboard's focus ring on the web only (`:focus-visible`; the phone keeps the system's own) and Space on checkboxes, radios, switches and tabs, touch's 44 hit area as a layer (react-native-web drops `hitSlop`), and the web's scrollbar drawn over a scroller. `Text` takes its type scale by the input: the web's with a pointer, the phone's on touch, the TV's on the TV. Where the web needs other code, the module is a platform pair (`name.web.ts` beside `name.ts`; apps/client/README.md › Platform files). `src/shared/parity.ts` lists what's drawn twice and why.

The web renderer (`src/web`) below stays for the admin, the guides and the prototypes until part D replaces it: the server's admin app, the web and desktop clients, and the TV web builds (webOS, Tizen). Built on Radix, Tailwind v4 and `motion/react`. The values come from [`@highsea-tv/tokens`](../tokens/README.md); the rules they follow are in [`docs/design-language/`](../../docs/design-language/README.md).

## Setup

The app needs React 19 and Tailwind 4 (for example `@tailwindcss/vite`). Its stylesheet imports one file:

```css
@import "@highsea-tv/ui/styles.css";
```

That brings in Tailwind, the token theme, the Geist fonts and the component animations, and tells Tailwind to scan this package. Tailwind finds the app's own files by itself. The token theme **replaces** Tailwind's defaults, so only highsea's roles and scales exist (`bg-s1`, `text-title`, `medium:`); see the [tokens README](../tokens/README.md#using-the-tailwind-theme).

Wrap the app once:

```tsx
import { UIProvider } from '@highsea-tv/ui'

<UIProvider sound={{ enabled: false }}>
  <App />
</UIProvider>
```

`UIProvider` makes motion follow the OS reduced-motion setting, shares one tooltip delay, mounts the toast stack and provides UI sound (off unless `sound.enabled`; [sound.md](../../docs/design-language/sound.md#defaults)).

## Components

| Group | Components |
| --- | --- |
| Actions | `Button` (primary, secondary, ghost, danger; `icon`, `loading`, `asChild`) |
| Forms | `Field` (label, hint and error wired to the control; `inline` puts a Switch or Checkbox before its label), `Input`, `Textarea`, `Select`, `Switch`, `Checkbox`, `SegmentedControl` |
| Overlays | `Dialog`, `ConfirmDialog`, `Sheet` (bottom, left, right), `Popover`, `Menu`, `Tooltip`, `toast()` with `Toaster` |
| Data | `Table` (scrolls sideways when it must, and is then a tab stop named by its `aria-label`) with `TableFrame`, `TableToolbar`, `TitleCell`, `RowActions`; `Badge`, `QualityTag`, `Progress`, `Skeleton`, `Tabs` |
| Media | `Poster`, `BackdropHero`, `CarouselRow`, `Rating` |
| Shell | `Sidebar` with `NavGroup`, `NavItem`, `ServerCard`; `CommandPalette` (`onSearchChange` for results the caller looks up); `WidgetFrame` (an editor passes its own `handle` and `resize` in edit mode), `Stat`; `Banner`; `StatusBar` with `StatusItem` |
| Setup | `Stepper` (a wizard's steps beside the form; collapses to "Step 3 of 8" and a bar below `expanded`), `QrCode` (a real QR code as SVG, dark on light, with the quiet zone; renders on the server too) |
| Customize | `WidgetEditor` (Customize mode for the dashboard's grid: drag a handle to move, a corner to resize, or Space, the arrows and Shift from the keyboard; built on dnd-kit), `SortableList` (a list reordered the same way), `Sparkline` (a decorative live-rate graph); `useClip` and `useWidth` fit a widget's content to its size. Their announcements are English unless the app passes `messages` |
| Page | `PageHeader` (title, search, actions), `SearchTrigger` (opens the palette, with the ⌘K hint), `EmptyState` (nothing yet, nothing matches, or an `error` with a retry) |
| Brand | `Mark` (switches to the small cut below 24px, follows the theme accent), `Lockup` (live text) |
| Icons | `Icon` by semantic name (`<Icon name="downloads" />`): the Lucide subset plus highsea's [custom glyphs](../../design/assets/icons/README.md) |

**React Server Components:** modules that use client-only APIs (state, effects, context, Radix and Motion hooks) start with `"use client"`, as [Next.js advises library authors](https://nextjs.org/docs/app/getting-started/server-and-client-components#third-party-components); the rest (`cn`, `Badge`, `Skeleton`, `Icon`, `QrCode`, `Sparkline`, the brand mark) render on the server too. Vite ignores the directive.

Every component is keyboard-complete and has one focus ring (`focus`, 2px, 2px offset). Status is never shown by color alone: badges carry a dot and a label, progress shows its value. Under reduced motion, scale and slide go away and short fades stay ([motion.md](../../docs/design-language/motion.md)).

## Sound

`useSound()` returns `play(event)` for the events in [sound.md](../../docs/design-language/sound.md). The player synthesizes the token sound pack with Web Audio, so it matches the WAV files native clients play. It starts on the first play (after a user gesture), throttles `navigate` and lets `notify` play over other sounds. Without `UIProvider` or `SoundProvider`, `play` does nothing.

## TV and spatial focus

The spatial focus engine lives in `src/native/tv/spatial/` (`@highsea-tv/ui/focus`): the model's scoring (`spatial.ts`) and the DOM navigator on it (`navigator.ts`). It has two users. The TV prototype's root runs it through the web renderer's `useSpatialNavigation`, on the markup below. The native renderer's TV parts run it in a browser: `Focusable` and the TV's parts are written once against the engine pair `src/native/tv/engine.tsx` (react-native-tvos's own focus on tvOS and Android TV: `hasTVPreferredFocus`, `requestTVFocus`, `TVFocusGuideView`, `useTVEventHandler`, a scroll view's `scrollSnapOffset`) and `engine.web.tsx` (the same names on the navigator: stops and guides mark themselves through react-native-web's `dataSet`, and one navigator on the document moves focus while any stop is mounted). What a stop draws on focus is `Focusable`'s on every platform. `useRemote` gives the remote's presses on both: in a browser the arrows, Enter (`select`), Escape and Backspace (`menu`, Back) and the media key (`playPause`). On top of the reference board's markup, the library's stops add `data-trap` (a guide's `trapFocus*`), `data-guide` (its `destinations`, read through the navigator's `destinations` option) and `data-kept` (a TvPage's Kept part, landed as a whole).

Set `data-platform="tv"` on the root for the TV focus appearance ([tv.md](../../docs/design-language/platforms/tv.md#focus-appearance)): posters lift to 1.05 and buttons to their TV scale, and the ring becomes a 0.2u outline in `text`, flush with the item. D-pad navigation uses `useSpatialNavigation(ref)` on a root element with this markup:

| Attribute | Meaning |
| --- | --- |
| `data-focusable` | An item focus can land on (it also needs a `tabindex`) |
| `data-group="id"` | A row or region; the last focused item is remembered per group |
| `data-isolate` | A region entered only through a focus guide (a nav rail) |
| `data-go-up` / `-down` / `-left` / `-right="group"` | A focus guide on an ancestor |
| `data-scroll="x"` or `"y"` | A track that moves by transform to keep focus in view |
| `data-keep="0.3"` | Where in the viewport the track holds focus (default 0.5) |
| `data-center` | Don't clamp the track at its ends |
| `data-initial` | Where focus starts |

The scoring is the reference board's ([tv.md](../../docs/design-language/platforms/tv.md#spatial-focus-model)): a candidate must be ahead, left and right need vertical overlap, and up and down also accept a 45° cone. Arrow keys inside text fields are left alone. On web, `CarouselRow` uses a roving tab stop instead, so a row is one Tab stop and the arrows move within it.

## Scripts and tests

- `bun run build` turns `design/assets/icons/*.svg` into `src/icons/glyphs.ts`. `bun run check` fails when it is stale.
- `bun test` (from the repo root or here) runs:
  - **behavior:** components in happy-dom with Testing Library;
  - **accessibility:** axe-core (WCAG 2.2 A and AA) on every component and every open overlay. Contrast is checked exactly by the token tests instead;
  - **stylesheet:** renders everything, then asks the Tailwind compiler whether each class exists. Tailwind silently drops unknown classes, and the token theme removes the defaults, so this catches `text-white` or `leading-tight` before they ship;
  - **sound and focus:** the audio graph and envelopes against a recording fake `AudioContext`; the spatial scoring.

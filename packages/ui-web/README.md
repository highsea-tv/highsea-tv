# @highsea/ui-web

highsea's React components for the web: the server's admin app, the web and desktop clients, and the TV web builds (webOS, Tizen). Built on Radix, Tailwind v4 and `motion/react`. The values come from [`@highsea/tokens`](../tokens/README.md); the rules they follow are in [`docs/design-language/`](../../docs/design-language/README.md).

## Setup

The app needs React 19 and Tailwind 4 (for example `@tailwindcss/vite`). Its stylesheet imports one file:

```css
@import "@highsea/ui-web/styles.css";
```

That brings in Tailwind, the token theme, the Geist fonts and the component animations, and tells Tailwind to scan this package. Tailwind finds the app's own files by itself. The token theme **replaces** Tailwind's defaults, so only highsea's roles and scales exist (`bg-s1`, `text-title`, `medium:`); see the [tokens README](../tokens/README.md#using-the-tailwind-theme).

Wrap the app once:

```tsx
import { UIProvider } from '@highsea/ui-web'

<UIProvider sound={{ enabled: false }}>
  <App />
</UIProvider>
```

`UIProvider` makes motion follow the OS reduced-motion setting, shares one tooltip delay, mounts the toast stack and provides UI sound (off unless `sound.enabled`; [sound.md](../../docs/design-language/sound.md#defaults)).

## Components

| Group | Components |
| --- | --- |
| Actions | `Button` (primary, secondary, ghost, danger; `icon`, `loading`, `asChild`), `Kbd` |
| Forms | `Field` (label, hint and error wired to the control; `inline` puts a Switch or Checkbox before its label), `Input`, `Textarea`, `Select`, `Switch`, `Checkbox`, `SegmentedControl`, `RatingInput` |
| Overlays | `Dialog`, `ConfirmDialog`, `Sheet` (bottom, left, right), `Popover`, `Menu`, `Tooltip`, `toast()` with `Toaster` |
| Data | `Table` (scrolls sideways when it must, and is then a tab stop named by its `aria-label`) with `TableFrame`, `TableToolbar`, `TitleCell`, `RowActions`; `Badge`, `QualityTag`, `Progress`, `Skeleton`, `Tabs` |
| Media | `Poster`, `BackdropHero`, `CarouselRow`, `Rating` |
| Shell | `Sidebar` with `NavGroup`, `NavItem`, `ServerCard`; `CommandPalette`; `WidgetGrid`, `WidgetFrame` (an editor passes its own `handle` and `resize` in edit mode), `Stat`; `Banner`; `StatusBar` with `StatusItem` |
| Page | `PageHeader` (title, search, actions), `SearchTrigger` (opens the palette, with the ⌘K hint), `EmptyState` (nothing yet, nothing matches, or an `error` with a retry) |
| Brand | `Mark` (switches to the small cut below 24px, follows the theme accent), `Lockup` (live text) |
| Icons | `Icon` by semantic name (`<Icon name="downloads" />`): the Lucide subset plus highsea's [custom glyphs](../../design/assets/icons/README.md) |

**React Server Components:** modules that use client-only APIs (state, effects, context, Radix and Motion hooks) start with `"use client"`, as [Next.js advises library authors](https://nextjs.org/docs/app/getting-started/server-and-client-components#third-party-components); the rest (`cn`, `Badge`, `Kbd`, `Skeleton`, `Icon`, the brand mark) render on the server too. Vite ignores the directive.

Every component is keyboard-complete and has one focus ring (`focus`, 2px, 2px offset). Status is never shown by color alone: badges carry a dot and a label, progress shows its value. Under reduced motion, scale and slide go away and short fades stay ([motion.md](../../docs/design-language/motion.md)).

## Sound

`useSound()` returns `play(event)` for the events in [sound.md](../../docs/design-language/sound.md). The player synthesizes the token sound pack with Web Audio, so it matches the WAV files native clients play. It starts on the first play (after a user gesture), throttles `navigate` and lets `notify` play over other sounds. Without `UIProvider` or `SoundProvider`, `play` does nothing.

## TV and spatial focus

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

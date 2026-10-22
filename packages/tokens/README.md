# @highsea-tv/tokens

The single source for highsea's design values: color roles and themes, type, spacing, radii, elevation, blur, density, focus, motion and sound. The rules for *using* them are in [`docs/design-language/`](../../docs/design-language/README.md). Locked values come from [`docs/brand/direction.md`](../../docs/brand/direction.md).

## Outputs

| Import | For | Contents |
| --- | --- | --- |
| `@highsea-tv/tokens` | TypeScript (web, server, tooling) | All values, the theme engine, contrast audit and sound-pack tools |
| `@highsea-tv/tokens/native` | React Native (Expo, react-native-tvos) | `nativeTokens`: numbers, hex colors with alpha, raw spring parameters, `boxShadow` strings |
| `@highsea-tv/tokens/tailwind.css` | Tailwind v4 apps | An `@theme` that **replaces** Tailwind's defaults, plus one block per built-in theme |
| `@highsea-tv/tokens/tokens.css` | CSS without Tailwind | The same variables as plain custom properties |

The CSS in `generated/` is committed. After changing a value, run `bun run build` here. `bun run check` (and the test suite) fails when the files are stale.

## Using the Tailwind theme

```css
@import "tailwindcss";
@import "@highsea-tv/tokens/tailwind.css";
```

Tailwind's palette, shadows, radii, breakpoints and animations are cleared. Only highsea roles and scales generate utilities, so `bg-blue-500`, `font-bold`, `shadow-lg` and `md:` don't exist. Components reference roles, never raw values.

| Docs name | CSS variable | Utility example |
| --- | --- | --- |
| Color role `s1`, `text-2`, `accent-fill`… | `--color-s1` … | `bg-s1`, `text-text-2`, `bg-accent-fill text-on-accent` |
| Badge colors (derived) | `--color-badge-success`, `--color-badge-success-bg` | `text-badge-success bg-badge-success-bg` |
| `space-3` | `--spacing` (4px base) | `p-3`, `gap-0.5` |
| `radius-sm`, `radius-md`, `radius-lg`, `radius-xl`, `radius-poster` | `--radius-*` | `rounded-md`, `rounded-poster`, `rounded-full` (pill) |
| Elevation levels 2–4 | `--shadow-2` … `--shadow-4` | `shadow-3` |
| Blur recipes | `--blur-bar`, `--blur-pill`, `--blur-badge`, `--blur-scrim` | `backdrop-blur-bar` |
| Breakpoints | `--breakpoint-medium`, `-expanded`, `-wide` | `medium:`, `expanded:`, `wide:` (compact is the default) |
| Text styles | `--text-display` … `--text-widget-title` | `text-title`, `text-figure font-mono` |
| `spring.base`, `spring.quick` | `--ease-spring`, `--ease-spring-quick` with `--duration-spring`, `--duration-spring-quick` | `ease-spring duration-(--duration-spring)` |
| Durations, stagger | `--duration-color`, `-fade-out`, `-dwell`, `-pulse`, `--stagger` | |
| Admin density | `--size-control`, `--size-input`, `--size-row`, `--size-sidebar`… | `h-(--size-control)` |
| Focus | `--focus-ring-width`, `--focus-ring-offset`, `--tv-focus-shadow` | |
| TV screen units | `--tv-*` in `cqw` (`1u` = `1cqw`) | `text-(length:--tv-text-hero-title)` |

Under `prefers-reduced-motion`, spring durations drop to 1ms and the stagger to 0. Components still remove translation and scale themselves (see [motion › reduced motion](../../docs/design-language/motion.md#reduced-motion)).

## Themes

Set `data-theme` on any element: `default` (also `:root`), `oled` or `high-contrast`. Each theme writes every variable, so themes nest.

A custom theme is a partial override of a built-in one:

```ts
import { createTheme, encodeTheme, nearestPassing, themeCss } from '@highsea-tv/tokens'

const { theme, audit } = createTheme({ base: 'oled', accent: '#8fbfb7', name: 'Harbor' })
audit.pass // every pairing in the contrast policy, measured as rendered
themeCss(theme, '[data-theme="harbor"]') // CSS for the web
encodeTheme({ base: 'oled', accent: '#8fbfb7' }) // 'hs1.…' share code; decodeTheme() validates
nearestPassing(input, 'text-3') // the closest value that makes a failing theme pass
```

- Setting only `accent` generates `accent-2`, `accent-text`, `accent-fill`, `on-accent` and `focus`, each one Lc above its minimum.
- Status colors (`success`, `warning`, `danger`, `info`, `danger-fill`, `on-danger`) can't be themed.
- `toNativeTheme(theme)` (from `/native`) converts any resolved theme for React Native.

## Sound packs

```ts
import { checkSoundPack, defaultSoundPack } from '@highsea-tv/tokens'

checkSoundPack(pack) // validates the shape, renders every event offline, checks length, peak, glide and room rules
```

The offline renderer mirrors the Web Audio graph (oscillators, biquads, envelopes, room bus), so the catalog CI can check packs without a browser. It matches the browser's measurements of the default pack within 2 ms.

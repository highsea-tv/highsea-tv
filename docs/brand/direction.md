# highsea.tv — Official Brand Direction: Abyss Neutral (Bone)

- **Status:** Locked, v1.0, signed off by the owner on 2026-10-16. Recorded in [ADR 0013](../adr/0013-brand-direction-abyss-neutral.md).
- **Reference board:** [`design/explorations/a2-abyss-neutral.html`](../../design/explorations/a2-abyss-neutral.html). It is the visual source of truth until `@highsea/tokens` exists. After that, the tokens package is the source and this document describes it.
- **Scope:** identity, color, type, shape, focus, layouts, motion and sound. The full design-language docs (`docs/design-language/`) expand on this and must not contradict it. Any change to what is listed here needs a new owner sign-off.

## Summary

This is direction A ("Abyss") with the neon removed. Surfaces are neutral graphite, with no glows, and a single warm off-white accent ("Bone"). The chrome stays neutral so the artwork carries the color. The theme is nautical, not piratical. Sounds are dry felt-and-wood taps with almost no tail.

**What changed from A, and why.** The owner found A too "neon" and "sci-fi." To fix that, the refinement:
- removed the blue tint from every neutral;
- removed all accent glows;
- replaced the luminous teal accent with Bone;
- muted the placeholder artwork;
- replaced the sonar sound family with tactile sounds.

The structure, type and motion stayed as they were in A.

## Identity

- **Mark:** a disc over the horizon, cut by two swells. It reads as a porthole, a sunrise on open water, or a status light. It is filled with a vertical gradient from `--accent` to `--accent-2` (Bone to its darker sibling).
- **Wordmark:** lowercase `highsea` in Geist SemiBold, tracked −0.045em. The `.tv` is part of the lockup, set in `--text-3` at weight 500. It is quiet, but always present.
- **Server first:** clients lead with the *server's* name and identity (for example "Harbor"). highsea is the hull, not the cargo.

## Color

Dark-first and neutral. All values were measured live on the reference board, using APCA Lc with the WCAG 2 ratio alongside. The contrast policy is in [brief §7.1](brief.md#71-contrast-policy).

| Token | Value | Role |
| --- | --- | --- |
| `--bg` | `#0b0b0c` | App background |
| `--s1` | `#121214` | Surface 1 (cards, panels) |
| `--s2` | `#18181b` | Surface 2 |
| `--s3` | `#1f1f22` | Surface 3 |
| `--s4` | `#28282c` | Surface 4 (highest elevation) |
| `--line` | `rgb(255 255 255 / 0.07)` | Hairlines |
| `--line-strong` | `rgb(255 255 255 / 0.13)` | Borders, dividers |
| `--text` | `#ededee` | Primary text: Lc 96 on `--s1` |
| `--text-2` | `#c7c7cb` | Secondary text: Lc 72 |
| `--text-3` | `#a2a2a7` | Tertiary text (metadata ≥ 12px only): Lc 52 |
| `--accent` | `#d6cfc2` | Bone: brand accent, selection, active state |
| `--accent-2` | `#8c8678` | Darker Bone: mark gradient, secondary data series |
| `--accent-text` | `#d6cfc2` | Accent as text: Lc 78 |
| `--accent-fill` | `#ebe6dc` | Primary button and toggle fill |
| `--on-accent` | `#0b0b0c` | Label on accent fill: Lc 91 |
| `--accent-soft` | Accent at 13% | Tinted backgrounds (selected rows, chips) |
| `--success` | `#7cc4a0` | Status |
| `--warning` | `#dcb06a` | Status |
| `--danger` | `#e88787` | Status (text and icons) |
| `--danger-fill` | `#a23a3a` | Destructive button fill |
| `--on-danger` | `#ffffff` | Label on danger fill: Lc 87 |
| `--info` | `#8fb0d6` | Status |

**Rules**
- **No glows.** Shadows are dark and only express elevation. Nothing emits light.
- **One accent.** The chrome stays neutral. Bone marks the active destination, selection and primary actions only.
- **Status badges** mix the status color into `--text` (72%; danger 52%) on a tinted background. They measure Lc 68–69, against a target of 60.
- **Placeholder artwork** is muted (about 38% saturation), so placeholders never out-shout real posters.

## Typography

- **Families:**
  - Geist for display and UI;
  - Geist Mono for figures, sizes, rates and release names.
- **Display** is Geist SemiBold (600), tracked −0.035em.
- **Numbers in data** use tabular figures.

| Style | Size / line height | Notes |
| --- | --- | --- |
| Display | 40 / 1.05 | 600, −0.035em |
| Heading | 28 / 1.15 | 600, −0.035em |
| Title | 19 | 600, −0.01em |
| Body | 15 / 1.6 | 400, `--text-2` |
| Caption | 12.5 | `--text-3` |
| Mono | 13 | Geist Mono, tabular |

The TV uses the same styles scaled for 10-foot viewing. The design-language docs define those sizes.

## Shape

- **Radii:**
  - 8 (small controls);
  - 12 (default);
  - 16 (large cards);
  - 28 (sheets, device-level containers);
  - posters 10.
- **Icons:** the Lucide base set at stroke width 1.75.

## Focus

- **TV focus** is a 3px `--text` ring (`#ededee`) with a soft dark drop shadow, and buttons scale to 1.07 and posters to 1.09. There is no colored halo.
- **Keyboard focus** on web and desktop uses the same ring language.
- Focus is carried by ring, scale and motion, never by color alone.

## Layouts

| Surface | Layout | Description |
| --- | --- | --- |
| TV home | **Hero + rows** | A full-bleed hero for the focused title that crossfades as focus moves, then horizontal rows. Spatial D-pad focus with per-row memory. |
| Phone home | **Tabs + carousel** | A bottom tab bar, the owner's announcement card, a featured carousel and poster rows. The accent marks only the active tab. |
| Admin dashboard | **Sidebar + widgets** | Sidebar navigation and a free-form widget grid above the queue. Every card is a widget the owner can rearrange, resize or remove. |

## Motion

- **Spring:** stiffness 120, damping 20. Calm and physical, barely overshooting; things settle like a buoy, not a bounce.
- **Entrance:** stagger 45ms, rise 14px, scale from 0.98.
- **Reduced motion:** cross-fades only, with no travel or scale.

## Sound

**Character: felt and wood.** Each sound combines a tiny noise transient (the "tap") with a low-passed triangle tone (the warm body). Sounds never pitch-slide. There is no echo, except for a 45ms room reflection on Notify and Arrival only.

**Defaults:** sound is on (subtle) in TV clients, and off in admin.

| Event | Sound | Audible length |
| --- | --- | --- |
| Navigate | Soft felt tick | ≈ 17 ms |
| Select | Firm wood "tock" | 38 ms |
| Back | Lower, softer tock | 44 ms |
| Success | Two felt-piano notes, a rising major third (C5 → E5) | 265 ms |
| Error | Two muted low thuds | 178 ms |
| Notify | Soft two-note chime (E5 → B5) in a small room | 356 ms |
| Arrival (app launch) | Warm low swell, then C–E–G felt notes | 1.0 s |

Audible length is measured offline to −40 dB below the sound's peak. The exact synthesis parameters live in the reference board and move into `@highsea/tokens` as sound tokens.

## Considered and not chosen

- **B · Signal, C · Nocturne:** strong options, but less aligned with the calm, cinematic brief. Their layouts remain available as reference in the explorations.
- **D · Jolly Roger:** an open pirate theme. It was declined for app-store, TV-platform and partner risk. Pirate flavor is out of scope for the official brand.
- **A · Abyss as originally drawn:** too neon and sci-fi. Superseded by this refinement.
- **Accent candidates Sea glass and Slate:** Bone was chosen. It is the most neutral option and lets artwork carry the color.

All explorations stay in `design/explorations/` as a historical record.

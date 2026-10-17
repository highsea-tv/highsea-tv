# Color

Color values are listed in [direction.md › Color](../brand/direction.md#color). This document defines what each role means, how roles combine, and the contrast rules every theme must pass.

## Semantic roles

Components reference **roles**, never raw values. A theme is a set of values for these roles.

| Group | Roles | Use |
| --- | --- | --- |
| Canvas | `bg` | The app background; scrims over artwork fade to it |
| Surfaces | `s1`–`s4` | Elevation by tone: cards and panels on `s1`, raised controls `s2`–`s3`, popovers `s4`. See [elevation](elevation.md) |
| Lines | `line`, `line-strong` | Hairlines between rows; borders on controls, dividers between regions |
| Text | `text`, `text-2`, `text-3` | Primary (titles, values), secondary (body), tertiary (metadata ≥ 12px only) |
| Accent | `accent`, `accent-2`, `accent-soft` | Brand accent; its darker sibling; a 13% tint for selected backgrounds |
| Accent pairs | `accent-text`; `accent-fill` + `on-accent` | Accent used as text on `bg`/`s1`; solid fill with its label color |
| Status | `success`, `warning`, `danger`, `info` | State only, never decoration |
| Danger pair | `danger-fill` + `on-danger` | Destructive buttons |
| Focus | `focus` | Focus ring on web and admin. The TV ring is `text`; see [TV](platforms/tv.md#focus-appearance) |

### Fill and text tokens are separate

The accent never doubles as a fill under arbitrary text. Every filled control has its own fill token and a matching label token (`accent-fill` + `on-accent`, `danger-fill` + `on-danger`). Accent used as text has its own token (`accent-text`). This means:

- a theme can change the accent without breaking button labels;
- the contrast audit can check each pairing on its own.

v0.1 of the explorations failed here: labels sat directly on a bright accent and were hard to read.

## The accent

Bone is a warm off-white. It marks:

- the **active destination** (nav item, tab);
- **selection** (chosen row, chip, toggle on);
- the **primary action** (one per view, as `accent-fill`);
- **in-progress state** (the downloading bar and badge).

It does **not** mark headings, decoration or icons at rest.

Because Bone is close to white, the accent never carries focus on its own. Focus uses a ring, scale and motion (see [principles](principles.md#3-focus-is-never-in-doubt)).

## Status colors

| Role | Meaning | Examples |
| --- | --- | --- |
| `success` | Done, healthy, or working as intended | Seeding, imported, indexer healthy, subtitle synced |
| `warning` | Needs attention but isn't broken | Stalled, cutoff unmet, backing off, low disk |
| `danger` | Failed, or destructive | Download failed, indexer down, delete |
| `info` | Neutral process or information | Importing, renaming, scheduled |
| `accent` | Actively progressing | Downloading |
| *(none)* | Waiting, inactive | Queued: a plain `s3` badge with `text-2` |

**Status is never color alone.** Badges always pair a dot with a text label, and progress bars sit beside a percentage. See [accessibility](accessibility.md).

**Badge recipe:**
- a pill on a tinted background;
- a dot in the status color;
- a label in the status color mixed into `text`, at 72% (52% for danger).

The mix keeps hues recognizable while holding Lc ≥ 60. Measured on the reference board: Lc 68–69.

## Data visualization

- **Series order:** `accent`, `accent-2`, `info`, `warning`. For example, storage by media type is Movies, TV, Music, Downloads. Add `success` and `danger` only when the series *means* that state.
- **Charts:**
  - lines at 1.5–2px;
  - area fills fade from the series color at about 30% to transparent;
  - a secondary series is drawn dashed in `text-3`.

  These follow the board's network chart.
- **Gridlines:** use `line`. Axis labels use the mono caption style in `text-3`.

## Contrast policy

*(Moved here from brief §7.1, unchanged.)*

Every theme, built-in or custom, must pass these checks against its rendered colors. Translucent fills and gradients are measured as rendered, and each gradient stop is checked.

| Role | APCA Lc minimum | Also |
| --- | --- | --- |
| Primary text (titles, values) | 75 (90 preferred) | WCAG 2 ≥ 4.5:1 |
| Secondary text | 70 | |
| Tertiary text (metadata, captions) | 50 | Never used for anything the user must read to act |
| Accent used as text | 60 | |
| Button labels (primary, destructive) | 75 | Weight ≥ 600; on-fill color is its own token |
| Badges | 60 | |

- **Method:** APCA (0.0.98G) is the gate, with the WCAG 2 ratio reported alongside. Measure each pairing over the backdrop it actually sits on. The reference board's audit does this live.
- **Default theme results:**
  - text Lc 96;
  - text-2 72;
  - text-3 52;
  - accent text 78;
  - primary button 91;
  - destructive button 87;
  - badges 68–69.

## Built-in themes

The theme engine (`@highsea/tokens`) ships three built-in themes. All three pass the contrast policy.

| Theme | Rule |
| --- | --- |
| **Default** | The locked Abyss Neutral (Bone) values |
| **OLED black** | `bg` is `#000000`. Surfaces step up from about `#0b0b0c` so cards still separate. Everything else is unchanged |
| **High contrast** | `text-2` and `text-3` meet Lc 75. `line-strong` is about 30% white. Badges mix at 85% toward `text`. Focus rings are 1.5× wider |

## Custom themes and server branding

- **Owner overrides:** the server owner can set an accent and a logo, which clients inherit. A theme is a partial override of the roles above.
- **Validation:** custom themes are checked against the contrast policy before saving. On failure, the editor offers the nearest passing value for the role, found by moving toward `text` or toward `bg`.
- **Generated values:** the accent pairs (`accent-text`, `accent-fill`, `on-accent`) are generated from a chosen accent, unless they are overridden explicitly.
- **Status colors are not themeable.** Their meanings must stay stable across servers.

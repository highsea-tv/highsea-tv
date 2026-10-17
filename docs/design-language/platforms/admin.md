# Admin

The server admin (`apps/server`) is a pro tool used daily for years. It is deliberately dense but calm: mono figures, quiet borders, and status color only where state matters.

## Dashboard: Sidebar + widgets

This layout is locked in [direction.md](../../brand/direction.md#layouts).

### Sidebar

- 216px wide on `s1`, with a `line` border on the right.
- **Lockup:** the highsea mark and wordmark at the top. When server branding is set, the server's name and mark lead instead.
- **Nav groups,** separated by hairlines:
  1. Dashboard, Discover, Movies, Activity, Downloads;
  2. Indexers, Subtitles, Curation;
  3. Settings, System.

  Later media types (TV, Music, Books…) join group 1.
- **Nav item:**
  - a 16px icon and a 13px label, with 7 × 10px padding and `radius-sm`;
  - an optional count on the right in mono `text-3` (for example, Movies 412, Activity 5).
- **Active item:** a subtle `rgb(255 255 255 / 0.06)` background, `text` label, and the icon in `accent`.
- **Server card,** pinned to the bottom: a status dot, the server name, and the version with connected-client count.

### Main area

- **Padding:** 24px (the board uses 22 × 26px).
- **Top row:** the page title (Heading), a search field with a `⌘K` hint that opens the command palette, and secondary actions such as Customize.
- **Widget grid:**
  - 4 columns with a 12px gap; widgets span 1 or 2 columns;
  - the default arrangement is Network (2), Storage, Indexers, Subtitles, Upcoming (2), Announcement;
  - widgets use `s1`, a `line` border, `radius-md`, and 14px padding.
- **Queue:** full width below the widgets, in a card with a header (title, live summary, filter tabs) and the queue table.

### Customizing

**Customize** enters an edit mode:
- widgets show drag handles and resize corners, and snap to the grid;
- an "Add widget" panel lists the available widgets.

Layouts are saved per user, and owners can set role defaults (see the roadmap's personalization section). The interaction details are designed in Phase 2.

## Density

| Element | Size |
| --- | --- |
| Base text | 13px |
| Table row | About 60px with a two-line title cell (title + release name); 40px for single-line rows |
| Buttons | 36px default, 30px small |
| Inputs | 38px |
| Badges | 22px |

Comfortable spacing comes from grouping, not from padding. Whitespace separates regions, while rows within a region stay tight.

## Tables

- **Columns:**
  - headers are Geist 500 at 11.5px in `text-3`;
  - numeric columns are mono 12px in `text-2`, with tabular figures and right alignment.
- **Title cell:** the title in `text`, with the release name below in mono 11px `text-3`, truncated (see [typography](../typography.md#line-length-and-truncation)).
- **Progress:** a bar (accent while downloading, success when complete, warning when stalled) beside a mono percentage.
- **Status:** a badge per the [status color table](../color.md#status-colors).
- **Narrow widths:** low-priority columns hide first (upload rate, then ETA). Tables never squeeze text into wrapping.
- **Row actions:** appear on hover and focus, and are always reachable from a row menu.

## Status and live data

- **Updates without motion:** live values (speeds, progress, ETAs) update in place. Bars animate their width with `duration.color`; numbers change without animation.
- **Server health:** shown in two places only, the sidebar's server card and the System page. Widgets show their own domain's health (for example, indexers backing off).
- **Status bar:** a thin status bar at the bottom shows server, version, connected clients, resources and background jobs. It comes from the archived Signal layout and is designed in Phase 2.

## Responsive

| Breakpoint | Behavior |
| --- | --- |
| expanded and wide (≥ 1024) | Full sidebar; 4-column widget grid |
| medium (600–1023) | Sidebar collapses to a 64px icon rail with tooltips; 2-column widget grid |
| compact (< 600) | The sidebar becomes a menu sheet behind a top-bar button; 1-column widgets; tables become stacked rows |

## Sound

Admin sound is off by default (see [sound › defaults](../sound.md#defaults)). When enabled, admin uses the same pack with all event volumes reduced by 6 dB.

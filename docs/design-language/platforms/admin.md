# Admin

The server admin is a pro tool used daily for years. Its screens are `@highsea-tv/admin` (`packages/admin`), drawn only with the library's React Native parts through react-native-web, with Next.js in `apps/server` as their host; the prototype's `#/admin/…` draws the same screens over the mock ([ADR 0061](../../adr/0061-one-client-platform.md)). It is deliberately dense but calm: mono figures, quiet borders, and status color only where state matters.

## Dashboard: Sidebar + widgets

This layout is locked in [direction.md](../../brand/direction.md#layouts).

### Sidebar

- 216px wide on `s1`, with a `line` border on the right.
- **Lockup:** the highsea mark and wordmark at the top. When server branding is set, the server's name and mark lead instead.
- **Nav groups,** separated by hairlines:
  1. Dashboard, Discover, Movies, Wanted, Activity, Downloads (Wanted joined in Phase 2, [wanted.md](../../product/wanted.md));
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
  - 4 columns with a 12px gap; widgets span 1 to 4 columns, each within its own range ([dashboard.md](../../product/dashboard.md); approved by the owner on 2026-10-20);
  - the default arrangement is Network (2), Storage, Indexers, Subtitles, Upcoming (2), Announcement, then the Queue (4);
  - widgets use `s1`, a `line` border, `radius-md`, and 14px padding.
- **Queue:** a widget like the others, 4 wide by default, with a header (title, live summary, filter tabs) and the queue table. It can be moved, resized or removed ([dashboard.md](../../product/dashboard.md); approved by the owner on 2026-10-20).

### Customizing

**Customize** enters an edit mode:
- widgets show drag handles and resize corners, and snap to the grid;
- an "Add widget" panel lists the available widgets.

Layouts are saved per user, and owners can set role defaults (see the roadmap's personalization section). The editor is the library's `WidgetEditor` ([dashboard.md](../../product/dashboard.md)).

## Density

| Element | Size |
| --- | --- |
| Base text | 13px |
| Table row | About 60px with a two-line title cell (title + release name); 40px for single-line rows |
| Controls | 36px default, 30px small, inputs and selects included ([controls](../controls.md)) |
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
- **Status bar:** a thin status bar at the bottom shows server, version, connected clients, resources and background jobs, its items hidden by width as the window narrows. It comes from the archived Signal layout ([admin-shell.md](../../product/admin-shell.md)).

## Responsive

The admin lays out by the clients' one rule ([spacing-layout › Width classes](../spacing-layout.md#width-classes)), as D1 built it: there's no icon rail and no middle step.

| Width class | Behavior |
| --- | --- |
| regular (≥ 768) | Full sidebar; 4-column widget grid; forms and settings in their columns; Settings' areas beside an area's page from 1136 and a menu above it below that ([Width classes](../spacing-layout.md#width-classes)) |
| compact (< 768) | The sidebar becomes a menu sheet behind a top-bar button; 1-column widgets; tables become stacked rows |

## Sheets and toasts

- **Side sheets float off the edge,** as the TV's side dialog does: the detail, account and menu sheets stand `space-6` (24) from the window's top, bottom and outer edge, `radius-xl` at every corner, `s3` at level 4 ([elevation](../elevation.md)). A narrow window keeps `space-8` (32) of scrim beside the sheet, past that gap. The owner's change of 2026-11-17 (HT-44), to a layout that was locked.
- **Toasts show above every sheet and dialog,** so a change saved in one is confirmed where it was made. The stack keeps its own `space-6` gap, so a toast lines up with a sheet's edge.
- **Toasts stand clear of the status bar,** as far above it as they stand from the window's end edge (`space-6`, `space-4` compact). The admin passes the bar's height to the library's `Toaster` (`bottomInset`), so the clients, with no bar, are unchanged. The owner's change of 2026-11-19 (HT-105).

## Media pages' hero

A film's, a show's and a collection's page open on the clients' hero (the owner's change of 2026-11-19, HT-105, in place of the summary card): the library's `TitleBackdrop`, its side and foot fades, runs from the main area's top edge to edge, behind the page's top row (title, search, actions) and under it, and fades into the page above the tabs. The words sit low on the left, within the 65ch measure: the logo, or the name in display type when there's none, then the facts, badges, synopsis and the library line (path, **Monitored**). A scrim at the top keeps the top row readable over bright art; in a compact window the art darkens under the words, which have no faded side there. The block is at least 24rem tall, 60% of the window in a regular one and never more than the art's 16:9, 16rem compact. With no backdrop there's no art: the words sit on the page under the top row and the name isn't drawn twice. The poster isn't shown, as on the clients. Announcements stay above the art.

## Sound

Admin sound is off by default (see [sound › defaults](../sound.md#defaults)). When enabled, admin uses the same pack with all event volumes reduced by 6 dB.

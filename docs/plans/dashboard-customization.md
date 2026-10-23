# Follow-up plan: dashboard customization on Homarr's level

- **Status:** Requested by the owner on 2026-10-20. Not scheduled: it follows Phase 3, and is planned in detail when it's started. Nothing here changes milestone 1.
- **Gate:** the owner approves a prototype of the new customize mode before it's built, as for any locked layout.
- **Owner's direction (2026-10-20):** the dashboard's customization and widgets should be as customizable as [Homarr](https://github.com/homarr-labs/homarr)'s boards, and customize mode should show a visible grid.
- **Replaces, once built:** the dashboard's flow layout ([dashboard.md › Decisions](../product/dashboard.md#decisions): "Order is the layout", one instance per widget, no settings UI). The registry, layouts API and role defaults built in Phase 3 checkpoint 3 are the base it grows from.

## What Homarr does

Researched on 2026-10-20 against Homarr **v2.6.0** (released 2026-10-15). Its v2.0.0 release says "Board editing has been rebuilt" on dnd-kit, the library highsea's `WidgetEditor` already uses. Sources: the [v2.0.0 release notes](https://github.com/homarr-labs/homarr/releases/tag/v2.0.0), the [boards documentation](https://homarr.dev/docs/management/boards), the [keyboard shortcuts](https://homarr.dev/docs/advanced/keyboard-shortcuts), and the source at tag `v2.6.0` (paths below are relative to [the repository](https://github.com/homarr-labs/homarr/tree/v2.6.0)).

- **Edit mode:**
  - A header button or `Mod+E` toggles it. Saving the board persists the layout.
  - Items snap to whole cells. The drop preview shows where the item will land.
  - Each item has a menu: Edit item, Move / resize, Duplicate, Remove (confirmed) (`apps/nextjs/src/components/board/items/item-menu.tsx`).
  - Resize handles sit on all eight edges and corners, shown on hover or focus (`…/sections/grid/grid-editor.css`).
  - `Ctrl`/`Cmd` selects several items. A toolbar then copies, pastes, moves or deletes them.
- **Placement is free, not a flow.**
  - Items sit at x and y, and gaps are kept: the move engine "pins the active item and pushes only actual collisions. Intentional empty rows remain untouched" (`…/grid/dnd/engine.ts`).
  - Dropping onto an item of the same size swaps them; otherwise the colliding items are pushed down.
  - Resize works on both axes, in whole cells. Each widget has a default size when added (`packages/definitions/src/widget.ts`).
  - A Move / resize dialog takes exact coordinates and a target section. It's also the fallback on touch screens.
- **Layouts per breakpoint.**
  - A board has several layouts, each with a name, a column count (1–24), a breakpoint, and optional side rails of 0–3 columns.
  - Positions are stored per layout. A new board has Mobile (3 columns) and Base (the chosen count, from 768px). "Reset from Base" regenerates a layout from Base.
  - Cells are square: 200 × 200 logical px with a 12px gap, and the canvas scales to the width (`apps/nextjs/src/components/board/layout/constants.ts`).
- **Sections:** nestable **Containers** with a title, an optional label, and options to be collapsible, scrollable, bordered, and to "open all" the apps inside. Whether a Container is collapsed is remembered per person.
- **Item settings:**
  - An edit dialog with the widget's own options, the integrations it reads from, a live preview, and width and height fields.
  - Advanced options: title, border color, custom CSS classes (`packages/widgets/src/modals/widget-edit-modal.tsx`).
- **Many instances:** any widget can be added more than once, duplicated, and copied between boards.
- **Boards:**
  - Many boards, each with View, Modify and Full access per user or group.
  - A home board per person, falling back to the group's, then everyone's, then the server's.
  - Board appearance: colors, opacity, background image, item radius, logo, favicon and custom CSS.
- **Keyboard:**
  - Enter or Space picks a tile up; arrows move it one cell; Shift and the arrows resize it; Escape cancels.
  - Escape also cancels a pointer drag.
  - Announcements go to a live region.
- **What Homarr doesn't do: draw a grid.** In edit mode it draws a dashed drop placeholder, a resize outline and a ring around the target canvas, but no cell lines. Homarr 1.x used a GridStack fork; whether that drew cells wasn't confirmed.

## What highsea takes

The owner's bar is "as customizable as Homarr". Each item says how it lands in highsea's dashboard.

| Homarr | highsea | Notes |
| --- | --- | --- |
| Free x/y placement, gaps kept, swap or push on collision | **Adopt** | Replaces "order is the layout". Reading and keyboard order follow position: top to bottom, then left to right. |
| Resize both axes, in cells, from any edge or corner | **Adopt** | Each widget keeps a minimum size its content needs (Homarr has none); the registry's ranges become minimums plus a sensible maximum. |
| Move / resize dialog with exact numbers | **Adopt** | Also the touch fallback, as in Homarr. |
| Layouts per breakpoint, each with its own positions; reset from the base layout | **Adopt** | Builds on the approved decision that columns follow the main area's width ([dashboard.md › Decisions](../product/dashboard.md#decisions)). |
| Containers: titled, collapsible (state per person), nestable | **Adopt** | |
| Item settings dialog with live preview | **Adopt** | The registry's settings schemas (Phase 3) generate the form. Answers dashboard.md's open question on where settings are edited. |
| Many instances, duplicate, multi-select, copy and paste | **Adopt** | Answers the open question on multiple instances. Placements already carry their own `id`. |
| Several boards, access per user or group, home board fallback | **Adapt** | highsea's dashboard is per person with role defaults. Shared boards and role-level access are worth weighing against that model when the phase is planned. |
| Board appearance: background, colors, opacity, radius | **Adapt** | Within the design system: themes and the brand accent (Appearance) stay the way color is set. A background image and widget opacity are candidates. |
| Custom CSS, per item and per board | **Open** | Conflicts with design system v1.0 being locked. The owner decides. |
| Apps and bookmarks as widgets | **Open** | Homarr is an app launcher; highsea's widgets show its own data. The owner decides whether launcher tiles belong. |
| Integrations per widget | **Adapt** | A widget picks its source among the server's own (a library, a download client) rather than outside services. |

## What highsea adds: a visible grid

The owner asked for a visible grid while customizing.
- **While editing,** the grid draws every cell of the current layout as a quiet outline (`line` at low opacity), so where an item can go is visible before it's dragged.
- **During a drag,** the cells the item would cover tint with `accent-soft`. They turn `danger` when the drop isn't allowed, as Homarr's invalid-drop ring does.
- **Under reduced motion,** nothing animates. In high contrast, the cell outlines use `line-strong`.
- **Outside edit mode** the grid isn't drawn.

## Carried over from Phase 3

These hold, and the follow-up keeps them:
- draft until Done, so Cancel is a full undo;
- reset forgets rather than copies;
- staff widgets are filtered on the server;
- every move and resize is possible by keyboard, with live announcements;
- widgets lay out by their own size (container measurement).

## To settle when the phase is planned

- **When it runs:** right after Phase 3's sign-off, or alongside Phase 4's clients.
- **Boards:** one dashboard per person with role defaults (today), or shared boards with access levels (Homarr)?
- **Custom CSS and launcher tiles:** in or out (see the table above).
- **Saved layouts:** how existing ones convert. Positions follow from today's order and sizes, so no one's dashboard changes when the new editor arrives.
- **Prototype:** the new customize mode is prototyped in `design/prototypes` and approved by the owner before it's built (standing rule: locked layouts change only with approval).

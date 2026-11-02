// SPDX-License-Identifier: AGPL-3.0-only
// Which components each renderer has (design system 1.1, part B). Every component is in both, by
// the same name, unless it's listed below with the reason one platform has none.
// test/parity.test.ts reads both renderers' exports and holds them to this.
import { CONTROLS } from '@highsea-tv/tokens'

/** Drawn by both renderers, from one props type. */
export const BOTH = [
  ...CONTROLS,
  'Badge',
  'Banner',
  'Disclosure',
  'EmptyState',
  'Icon',
  'MultiSelect',
  'Poster',
  'ProgressBar',
  'QrCode',
  'TitleCell',
] as const

/** Only on the web, and why no phone or TV screen needs it. */
export const WEB_ONLY: Record<string, string> = {
  // the admin's furniture: the admin is a browser app only (ADR 0032), so no phone or TV draws it
  Sidebar:
    "The admin's and the web client's navigation; the phone and TV have tab bars and the TV's rail",
  NavGroup: "Part of the web's Sidebar",
  NavItem: "Part of the web's Sidebar",
  ServerCard: "The web Sidebar's footer",
  PageHeader: "The admin's page title bar; native screens take the platform's navigation header",
  PageScrollbar:
    'Drawn over the page where the browser hides its own; native views scroll natively',
  SearchTrigger: "Opens the web's CommandPalette",
  CommandPalette: 'A keyboard-first command menu (cmdk); phones and TVs have no keyboard shortcuts',
  Kbd: 'Shows a keyboard shortcut; phones and TVs have none',
  ModKey: "Names the platform's modifier key in a shortcut; phones and TVs have none",
  Table: 'Dense data tables are the admin’s, which is browser only; native lists use Row',
  TableFrame: "Part of the web's Table",
  TableToolbar: "Part of the web's Table",
  TableHeader: "Part of the web's Table",
  TableBody: "Part of the web's Table",
  TableRow: "Part of the web's Table",
  TableHead: "Part of the web's Table",
  TableCell: "Part of the web's Table",
  RowActions: "A web Table row's hover actions; touch has no hover",
  WidgetGrid: "The admin dashboard's grid (ADR 0028), browser only",
  WidgetFrame: "The admin dashboard's widget, browser only",
  WidgetEditor: "Edits the admin dashboard's layout, browser only",
  Stat: 'A figure in an admin widget, browser only',
  Sparkline: 'A chart in an admin widget, browser only',
  StatusBar: "The admin's status bar, browser only",
  StatusItem: "Part of the admin's StatusBar",
  SortableList: 'Drag to reorder in the admin (dnd-kit, DOM only)',
  Stepper: "The admin's setup steps, browser only",
  Skeleton:
    "A loading placeholder in the web's layouts; native screens show the platform's activity indicator",
  SkeletonText: "Part of the web's Skeleton",
  // web primitives that React Native draws another way, or the platform draws itself
  Label:
    "A <label> for a control; native fields take their label as Field's prop and accessibilityLabel",
  RadioGroup:
    "The web's group around Radio (Radix); native screens choose one with SegmentedControl or rows",
  SelectItem: "Custom content in the web's Select; the native Select takes options",
  SelectGroup: "Custom content in the web's Select",
  SelectSeparator: "Custom content in the web's Select",
  TabsList: "Radix's Tabs parts; native Tabs take their options as a prop",
  TabsTrigger: "Radix's Tabs parts",
  TabsContent: "Radix's Tabs parts",
  DialogTrigger: "Radix's Dialog parts; the native Dialog is opened by its own prop",
  DialogClose: "Radix's Dialog parts",
  DialogContent: "Radix's Dialog parts",
  ConfirmDialog: "The admin's confirmation; native screens use the platform's alert",
  SheetTrigger: "Radix's Sheet parts; the native Sheet is opened by its own prop",
  SheetClose: "Radix's Sheet parts",
  SheetContent: "Radix's Sheet parts",
  Menu: "A dropdown menu; native screens use the platform's context menu or a Sheet",
  MenuTrigger: "Part of the web's Menu",
  MenuGroup: "Part of the web's Menu",
  MenuContent: "Part of the web's Menu",
  MenuItem: "Part of the web's Menu",
  MenuCheckboxItem: "Part of the web's Menu",
  MenuLabel: "Part of the web's Menu",
  MenuSeparator: "Part of the web's Menu",
  Popover: 'A floating panel anchored to a pointer target; touch screens use a Sheet',
  PopoverTrigger: "Part of the web's Popover",
  PopoverClose: "Part of the web's Popover",
  PopoverAnchor: "Part of the web's Popover",
  PopoverContent: "Part of the web's Popover",
  Tooltip: 'Shown on hover and keyboard focus; touch and the TV have no hover',
  TooltipProvider: "The web's Tooltip delay",
  Toaster: "The web's toast stack (motion); native apps show the platform's own notices",
  Lockup:
    "The wordmark beside the mark, on the web's sidebar and sign-in; native apps show the Mark",
  BackdropHero: "The web client's hero; the TV draws its own with TvTile and the phone a Poster",
  CarouselRow: "The web's poster rows with arrow keys; native rows are the platform's FlatList",
  Rating: "The admin's star rating, browser only",
  RatingInput: "The admin's star rating, browser only",
  Progress: 'The old name of ProgressBar, kept until part C moves the apps',
  // the web's roots
  UIProvider:
    "The web's root (motion, tooltips, toasts, sound); native apps' root is ThemeProvider",
  SoundProvider: "The web's UI sound (Web Audio); native sound comes with 4.5b",
  PlatformScope:
    "Sets a platform for the web's CSS variables (data-platform); React Native knows its platform",
}

/** Only in React Native, and why the web has no counterpart. */
export const NATIVE_ONLY: Record<string, string> = {
  Avatar: 'The phone’s profile picture by initials; the web draws people in its own account menu.',
  Press:
    'React Native’s press feedback (scale, haptic, hit area); the web gets it from CSS and the DOM.',
  Row: 'The phone’s edge-to-edge row of posters in a FlatList; the web has CarouselRow.',
  Text: 'React Native draws text only inside <Text>; the web styles its elements with the tokens’ classes.',
  ThemeProvider:
    'Passes the resolved theme and the platform’s rule down; on the web the tokens’ CSS variables do.',
  SwitchRow: 'A settings row with a switch and a hint, as iOS lays one out.',
  TvKey: 'A key on the TV’s on-screen keyboard; the web has the device’s keyboard.',
  TvMessage: 'A message that fills the TV’s screen with its actions.',
  StopScope: 'Names the TV’s focus stops for the D-pad walk (apps/tv/uitest).',
  Focusable: 'A stop for tvOS’s and Android TV’s focus engine; the web uses its own spatial focus.',
  KEEP: 'Where focus lands in a TV row or grid (tv.md › Focus).',
  HERO_DWELL_MS: 'How long the TV’s hero waits on a focused tile before it changes.',
  TRACK_SPRING: 'The TV row’s scroll spring as focus moves.',
  WIDE_WIDTH: 'The TV’s wide tile, in screen units.',
  TvTile: 'A TV tile with its focus lift and ring; the web has Poster.',
  TvRow: 'A TV row that keeps the focused tile in place; the web has CarouselRow.',
  // the TV's pages, on the TV's rule (tv.md); the web's screens draw theirs from the DOM's layout
  TvHead: 'The TV’s head of destinations, Alerts and the account; the web has its top bar.',
  TvHeadStop: 'One of the TV head’s focus stops.',
  TvPage: 'A TV page that scrolls by focus, keeping the focused stop in place.',
  Kept: 'Marks a TV page’s part as where its scroll keeps focus.',
  TvGrid: 'A TV grid of tiles that keeps its column as focus moves between rows.',
  TvWords: 'A TV page’s heading and words over its first row.',
  TvAmbient: 'The TV page’s blurred backdrop from the focused art; the web has none.',
  TvLetterRail: 'The TV library’s A to Z rail for the remote; the web scrolls by pointer.',
  TvFilmRow: 'A TV row of films whose focused card widens into its backdrop and actions.',
  TvFeaturedCard: 'Home’s featured card on the TV, a focus stop that lifts slightly.',
  TvMenu: 'A TV menu that keeps focus inside it until Back; the web has DropdownMenu.',
  TvConfirm: 'A TV confirmation with Cancel first and focus kept in it; the web has Dialog.',
  TvNoticeCard: 'An announcement as a TV focus stop, on the Alerts page; the web has Banner.',
  TvBackdrop: 'A title’s full-bleed art behind the TV’s first screen, faded where the words stand.',
  TvRoundAction: 'An icon action beside Play whose name shows on focus, as the Apple TV app’s do.',
  TvPersonTile: 'A person’s round portrait as a TV focus stop.',
  TvInfoCard: 'A card of facts at a TV page’s foot, a focus stop so the page scrolls to it.',
  TvProgressLine: 'Where a title’s resume stands under its TV hero.',
  TvSideDialog: 'A TV dialog at the screen’s right that keeps focus until Back; the web has Sheet.',
}

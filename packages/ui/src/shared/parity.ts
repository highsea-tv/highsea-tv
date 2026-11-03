// SPDX-License-Identifier: AGPL-3.0-only
// The renderers' exceptions (one-client-platform.md › Part A): the native renderer (src/native) is
// the one drawing of each component, on the phone, the TV and, through react-native-web, the web.
// A component is drawn twice only where it's listed here with its reason:
// - BOTH: drawn by both renderers, because the web renderer (src/web) stays for the admin, the
//   guides and the prototypes until part D replaces it, or drawn per platform in a pair of
//   platform files (`name.web.tsx` beside `name.tsx`);
// - WEB_ONLY and NATIVE_ONLY: what only one renderer has, and why the other needs none.
// test/parity.test.ts and scripts/one-place.ts read both renderers and hold them to these lists,
// and fail when a list drifts from what's drawn.

/** Drawn twice, by name, with the reason. */
export const BOTH: Record<string, string> = {
  Badge:
    "The web renderer's is drawn by the admin, apps/web and the prototypes until part D moves them onto this one",
  Banner:
    "The web renderer's is drawn by the admin, apps/web and the prototypes until part D moves them onto this one",
  Button:
    "The web renderer's is drawn by the admin, apps/web and the prototypes until part D moves them onto this one",
  Checkbox:
    "The web renderer's is drawn by the admin and the prototypes until part D moves them onto this one",
  Chip: "The web renderer's is drawn by the admin, apps/web and the prototypes until part D moves them onto this one",
  Dialog:
    "The web renderer's is drawn by the admin, apps/web and the prototypes until part D moves them onto this one",
  Disclosure:
    "The web renderer's is drawn by apps/web and the prototypes until part D moves them onto this one",
  EmptyState:
    "The web renderer's is drawn by the admin, apps/web and the prototypes until part D moves them onto this one",
  Field:
    "The web renderer's is drawn by the admin, apps/web and the prototypes until part D moves them onto this one",
  Icon: "The web renderer's is drawn by the admin, apps/web and the prototypes until part D moves them onto this one",
  Input:
    "The web renderer's is drawn by the admin, apps/web and the prototypes until part D moves them onto this one",
  Lockup:
    "The web renderer's is drawn by the admin, the guides, apps/web and the prototypes until part D moves them onto this one",
  Mark: "The web renderer's is drawn by the admin, apps/web and the prototypes until part D moves them onto this one",
  MultiSelect:
    "The web renderer's is drawn by no app, only its own tests and fixtures, and goes with src/web in part D",
  Poster:
    "The web renderer's is drawn by the admin, apps/web and the prototypes until part D moves them onto this one",
  ProgressBar:
    "The web renderer's is drawn by no app, only its own tests and fixtures, and goes with src/web in part D",
  QrCode: "The web renderer's is drawn by the admin until part D moves them onto this one",
  QualityTag:
    "The web renderer's is drawn by the admin, apps/web and the prototypes until part D moves them onto this one",
  Radio:
    "The web renderer's is drawn by the admin, apps/web and the prototypes until part D moves them onto this one",
  Rating:
    "The web renderer's is drawn by the admin, apps/web and the prototypes until part D moves them onto this one",
  SearchField:
    "The web renderer's is drawn by no app, only its own tests and fixtures, and goes with src/web in part D",
  SegmentedControl:
    "The web renderer's is drawn by the admin and the prototypes until part D moves them onto this one",
  Select:
    "The web renderer's is drawn by the admin, apps/web and the prototypes until part D moves them onto this one",
  Sheet:
    "The web renderer's is drawn by the admin and the prototypes until part D moves them onto this one",
  SortableList:
    "The web renderer's is drawn by the admin, apps/web and the prototypes until part D moves them onto this one",
  Switch:
    "The web renderer's is drawn by the admin, apps/web and the prototypes until part D moves them onto this one",
  Tabs: "The web renderer's is drawn by the admin and the prototypes until part D moves them onto this one",
  Textarea:
    "The web renderer's is drawn by the admin and the prototypes until part D moves them onto this one",
  TitleCell:
    "The web renderer's is drawn by the admin and the prototypes until part D moves them onto this one",
  // platform files behind a component: the web draws what react-native-web doesn't
  Scrollbar:
    'ScrollView’s own bar, drawn only on the web (scrollbar.web.tsx) where the browser’s takes a column; the phone and the TV keep the platform’s indicator',
  // the TV's focus engine (tv/engine.tsx and tv/engine.web.tsx), behind Focusable and the TV's parts
  FocusGuide:
    'A region that steers TV focus: react-native-tvos’s TVFocusGuideView on the TVs, and on the web, which has none, marks the spatial focus engine reads (one-client-platform.md › A, question 5)',
  TvScroll:
    'A TV scroller that follows focus: a ScrollView landing each stop by its scrollSnapOffset on the TVs, and on the web a track the spatial focus engine moves, since react-native-web has neither prop. The track moves by transform behind a clipped view, so on the web a pointer’s wheel or drag doesn’t scroll a TvPage or a TvRow: only focus moves them, as on the TVs, which have no pointer',
}

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
    "The document's own bar, for the web renderer's pages, which scroll the document; the native renderer's screens scroll in a ScrollView, which draws the same bar from the same measures on the web (Scrollbar)",
  SearchTrigger: "Opens the web's CommandPalette",
  CommandPalette: 'A keyboard-first command menu (cmdk); phones and TVs have no keyboard shortcuts',
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
  WidgetFrame: "The admin dashboard's widget, browser only",
  WidgetEditor: "Edits the admin dashboard's layout, browser only",
  Stat: 'A figure in an admin widget, browser only',
  Sparkline: 'A chart in an admin widget, browser only',
  StatusBar: "The admin's status bar, browser only",
  StatusItem: "Part of the admin's StatusBar",
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
  TabsList: "Radix's Tabs parts; native Tabs take their options as a prop",
  TabsTrigger: "Radix's Tabs parts",
  TabsContent: "Radix's Tabs parts",
  DialogContent: "Radix's Dialog parts; the native Dialog is opened by its own prop",
  ConfirmDialog: "The admin's confirmation; native screens use the platform's alert",
  SheetClose: "Radix's Sheet parts; the native Sheet is opened and closed by its own props",
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
  BackdropHero: "The web client's hero; the TV draws its own with TvTile and the phone a Poster",
  CarouselRow: "The web's poster rows with arrow keys; native rows are the platform's FlatList",
  Progress: 'The old name of ProgressBar, kept until part C moves the apps',
  // the web's roots
  UIProvider:
    "The web's root (motion, tooltips, toasts, sound); native apps' root is ThemeProvider",
  SoundProvider: "The web's UI sound (Web Audio); native sound comes with 4.5b",
  PlatformScope:
    "Sets a platform for the web's CSS variables (data-platform); React Native's is ThemeProvider's formFactor",
}

/** Only in React Native, and why the web has no counterpart. */
export const NATIVE_ONLY: Record<string, string> = {
  Avatar: 'The phone’s profile picture by initials; the web draws people in its own account menu.',
  Press:
    'React Native’s press feedback (scale, haptic, hit area); the web gets it from CSS and the DOM.',
  ScrollView:
    'React Native’s scroller with the web’s bar drawn over it on the web; the web renderer’s pages scroll the document, under PageScrollbar.',
  Row: 'The phone’s edge-to-edge row of posters in a FlatList; the web has CarouselRow.',
  Text: 'React Native draws text only inside <Text>; the web styles its elements with the tokens’ classes.',
  ThemeProvider:
    'Passes the resolved theme and the platform’s rule down; on the web the tokens’ CSS variables do.',
  SwitchRow: 'A switch with its words and hint, the old shape of Switch kept for settings rows.',
  // the phone's page parts (touch.tsx), as the TV's are below; the web draws its pages from the DOM
  NamedAction: 'An icon in a circle with its name under it, a title’s actions on the phone.',
  PersonTile: 'A person’s round portrait with their role, a title’s Cast and crew on the phone.',
  FactsCard: 'A card of facts at a phone page’s foot; the web lays out its own as a grid.',
  LetterIndex:
    'The phone’s A to Z index by touch, as iOS’s section index; the web’s list scrolls by pointer.',
  TvKey: 'A key on the TV’s on-screen keyboard; the web has the device’s keyboard.',
  TvMessage: 'A message that fills the TV’s screen with its actions.',
  StopScope: 'Names the TV’s focus stops for the D-pad walk (apps/tv/uitest).',
  Focusable:
    'A TV focus stop, drawn once: tvOS’s and Android TV’s focus engines move it, and in a browser the spatial focus engine (tv/engine.web.tsx); the web renderer’s screens mark their stops for the prototype’s.',
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

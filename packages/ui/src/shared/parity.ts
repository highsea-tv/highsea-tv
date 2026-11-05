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
    "The web renderer's is drawn by the admin, apps/web and the prototypes until part D moves them onto this one. The native one's `look: 'line'` (a playlist's rows, B3) is what the web's takes as classes",
  Switch:
    "The web renderer's is drawn by the admin, apps/web and the prototypes until part D moves them onto this one",
  Tabs: "The web renderer's is drawn by the admin and the prototypes until part D moves them onto this one",
  Textarea:
    "The web renderer's is drawn by the admin and the prototypes until part D moves them onto this one",
  TitleCell:
    "The web renderer's is drawn by the admin and the prototypes until part D moves them onto this one",
  Menu: "A menu of actions or choices: the web renderer's (Radix) is drawn by the admin and the prototypes until part D; this one is a Sheet by touch, a dropdown hung from its trigger with a pointer (WAI-ARIA's menu button pattern on react-native-web's Modal) and TvMenu on the TV",
  Popover:
    "A panel hung from a pointer's trigger: the web renderer's (Radix) is drawn by the admin and the prototypes until part D; this one is the pointer's only, on react-native-web's Modal, since touch and the TV show the same content in a Sheet or a dialog",
  Skeleton:
    "A loading placeholder: the web renderer's is drawn by the admin and the prototypes until part D; this one draws the same shimmer at every form factor",
  SkeletonText: "Lines of Skeleton, as the web renderer's, until part D",
  // platform files behind a component: the web draws what react-native-web doesn't
  Scrollbar:
    'ScrollView’s own bar, drawn only on the web (scrollbar.web.tsx) where the browser’s takes a column; the phone and the TV keep the platform’s indicator',
  Embed:
    'StillFrame’s player, an embedded page: an <iframe> on the web and in the desktop app (embed.web.tsx), and a react-native-webview WebView on the phone, which has no iframe (embed.tsx)',
  // the TV's focus engine (tv/engine.tsx and tv/engine.web.tsx), behind Focusable and the TV's parts
  FocusGuide:
    'A region that steers TV focus: react-native-tvos’s TVFocusGuideView on the TVs, and on the web, which has none, marks the spatial focus engine reads (one-client-platform.md › A, question 5)',
  TvScroll:
    'A TV scroller that follows focus: a ScrollView landing each stop by its scrollSnapOffset on the TVs, and on the web a track the spatial focus engine moves, since react-native-web has neither prop. The track moves by transform behind a clipped view, so on the web a pointer’s wheel or drag doesn’t scroll a TvPage or a Row on the TV’s rule: only focus moves them, as on the TVs, which have no pointer',
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
  MenuTrigger: "Part of the web's Menu",
  MenuGroup: "Part of the web's Menu",
  MenuContent: "Part of the web's Menu",
  MenuItem: "Part of the web's Menu",
  MenuCheckboxItem: "Part of the web's Menu",
  MenuLabel: "Part of the web's Menu",
  MenuSeparator: "Part of the web's Menu",
  PopoverTrigger: "Part of the web's Popover",
  PopoverClose: "Part of the web's Popover",
  PopoverAnchor: "Part of the web's Popover",
  PopoverContent: "Part of the web's Popover",
  Tooltip: 'Shown on hover and keyboard focus; touch and the TV have no hover',
  TooltipProvider: "The web's Tooltip delay",
  Toaster:
    "The web renderer's toast stack (motion), the admin's and the prototypes' until part D; the one client draws Toast where its screen stands, and the app takes it away",
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
  UNCHOSEN_ALPHA:
    'An unchosen destination’s strength in the one client’s top bar and the TV’s head (the prototypes’ `text-text/65`); the web renderer draws no bar, and the admin writes the class itself.',
  RADIO:
    'A radio’s role per platform for the one client: `radio` on the web, a button with the selected trait on iOS and tvOS, which give `radio` no trait. The admin’s web renderer is DOM-only, where its SegmentedControl writes the radio role itself.',
  radioState:
    'A radio’s state for that role: `checked` on the web, `selected` on iOS and tvOS; the admin’s SegmentedControl sets its own aria-checked.',
  Avatar:
    'A person’s or a profile’s circle by initials, in the profile’s colour; the web draws people in its own account menu.',
  Press:
    'React Native’s press feedback (scale, haptic, hit area); the web gets it from CSS and the DOM.',
  ScrollView:
    'React Native’s scroller with the web’s bar drawn over it on the web; the web renderer’s pages scroll the document, under PageScrollbar.',
  Row: 'A titled row that scrolls sideways, at every form factor: edge to edge by touch, paged by its arrows with a pointer, kept in place by focus on the TV. The web renderer’s CarouselRow is the admin’s and the prototypes’ until part D.',
  FilmRow:
    'Home’s row of films, at every form factor: the card and its strip of posters with a pointer and on the TV, a Row of Posters by touch. The web renderer has none: apps/web draws its own until part C replaces it with apps/client.',
  HiddenHeading:
    'A heading only screen readers read, at its aria-level; the web renderer’s pages use the sr-only class on their own h1 until part C replaces apps/web with apps/client.',
  SectionHeading:
    'A section’s title with its suffix or count, which Row, FilmRow and Search’s sections share; the web renderer’s pages and CarouselRow write their own h2 until part C replaces apps/web with apps/client.',
  Text: 'React Native draws text only inside <Text>; the web styles its elements with the tokens’ classes.',
  ThemeProvider:
    'Passes the resolved theme and the platform’s rule down; on the web the tokens’ CSS variables do.',
  SwitchRow: 'A switch with its words and hint, the old shape of Switch kept for settings rows.',
  // a title page's parts (page-parts.tsx), at every form factor; the web renderer's pages lay theirs
  // out from the DOM until part D
  NamedAction:
    'A title’s secondary action named by its icon: a circle with its name under it by touch, an icon button with its name in a tooltip with a pointer, and under it on focus on the TV.',
  PersonTile:
    'A person’s round portrait with their role, a title’s Cast and crew: the photo grows under a pointer, and it’s a focus stop on the TV. Its `result` layout is Search’s person: a 72 column with the name on two lines by touch, a chip of the photo, name and credits with a pointer, and a button with the photo on the TV.',
  FactsCard:
    'A card of facts at a title page’s foot, the web’s a step roomier, and a focus stop on the TV so the page scrolls to it.',
  StillFrame:
    'A still-shaped frame for what plays in place, a trailer’s player in its dialog, or the still with a note where nothing plays; the web renderer’s pages draw theirs from the DOM until part D.',
  EpisodeRow:
    'A season’s episode on a show’s page by touch and with a pointer: the still with its progress, its words, and Mark as watched beside them; the web renderer has no show pages, and the TV lists episodes as stills in a Row.',
  LetterIndex:
    'A library’s A to Z index: iOS’s section index by touch, a column of letter buttons with a pointer, the remote’s rail on the TV.',
  // the music player's (one-client-platform-b.md › B3); the web renderer's pages have none, since
  // only apps/client plays music
  Waveform:
    'The music player’s scrubber as the song’s loudness, moving at the playhead while it plays: the web’s music bar, the phone’s Now playing, and the TV’s inside its focus stop.',
  PlayingBars: 'The playing mark beside what’s playing, still while paused.',
  Slider:
    'A 0 to 1 slider by press, drag, the arrow keys and VoiceOver’s adjust, for the music player’s volume; the admin has no slider.',
  RadioMark:
    'The radio’s mark alone, for a card that is itself the radio (Settings’ theme cards), so no control nests in another; the web renderer’s cards are Radix’s radios.',
  TvKey: 'A key on the TV’s on-screen keyboard; the web has the device’s keyboard.',
  TvMessage: 'A message that fills the TV’s screen with its actions.',
  StopScope: 'Names the TV’s focus stops for the D-pad walk (scripts/sweeps/tv.ts).',
  Focusable:
    'A TV focus stop, drawn once: tvOS’s and Android TV’s focus engines move it, and in a browser the spatial focus engine (tv/engine.web.tsx); the web renderer’s screens mark their stops for the prototype’s.',
  // the values a screen lays out beside the parts by; the web renderer's pages have them as classes
  KEEP: 'Where focus lands in a TV row or grid (tv.md › Focus).',
  LIFT: 'How far a TV focus stop lifts, by what it is, for a screen drawing a stop of its own.',
  AT_REST: 'A press target’s state with nothing on it, which the TV’s controls draw by.',
  MAX_FONT_MULTIPLIER: 'How far React Native’s text grows with the system’s text size: 200%.',
  FEATURED_SHARE: 'The phone’s featured card’s share of its row, for Home’s Row.',
  FEATURED_GAP: 'The gap between the phone’s featured cards, for Home’s Row.',
  LETTER_INDEX_WIDTH: 'The touch letter index’s column, which a list beside it leaves room for.',
  POINTER_LETTER: 'A pointer’s letter index’s column, which a grid beside it leaves room for.',
  RAIL_WIDTH: 'The TV’s letter rail’s column, which a grid beside it leaves room for.',
  ROUND_ACTION_ROOM: 'The room under a row of the TV’s actions for the name shown on focus.',
  TV_STAR: 'The TV’s rating star, in units, for a screen’s line beside a Rating.',
  BACKDROP_HEIGHT: 'The TV’s title art’s height, one 16:9 screen, which the page’s words sit over.',
  TV_HEAD_HEIGHT: 'The TV head’s height, which a page under it starts below.',
  TV_ROW_GAP: 'The gap between a TV page’s rows, for a screen stacking its own.',
  PHONE_SECTION_TITLE:
    'The phone’s section title’s 17, which a screen’s own heading beside SectionHeading matches.',
  HERO_DWELL_MS: 'How long the TV’s hero waits on a focused tile before it changes.',
  TRACK_SPRING: 'The TV row’s scroll spring as focus moves.',
  WIDE_WIDTH: 'The TV’s wide tile, in screen units.',
  TvTile: 'Poster’s TV form, a focus stop with its lift and ring, which Poster draws on the TV.',
  // the TV's pages, on the TV's rule (tv.md); the web's screens draw theirs from the DOM's layout
  TvHead: 'The TV’s head of destinations, Alerts and the account; the web has its top bar.',
  TvHeadStop: 'One of the TV head’s focus stops.',
  TvPage: 'A TV page that scrolls by focus, keeping the focused stop in place.',
  Kept: 'Marks a TV page’s part as where its scroll keeps focus.',
  TvGrid: 'A TV grid of tiles that keeps its column as focus moves between rows.',
  TvWords: 'A TV page’s heading and words over its first row.',
  TvAmbient: 'The TV page’s blurred backdrop from the focused art; the web has none.',
  TvMenu:
    'Menu’s TV form, a menu over the page that keeps focus inside it until Back, which Menu draws on the TV and a TV screen may draw on its own.',
  TvConfirm: 'A TV confirmation with Cancel first and focus kept in it; the web has Dialog.',
  FeaturedCard:
    'Home’s featured card at every form factor: a 4:5 card by touch, a banner with its actions and Pager with a pointer, a focus stop that lifts slightly on the TV. The web renderer’s BackdropHero is apps/web’s until part C.',
  Bloom:
    'The glow behind Home’s featured card in the art’s colour, with a pointer and on the TV; the web renderer’s Home has none until part C.',
  Pager:
    'The pointer’s featured card’s pages: its arrows and dots, the current one `aria-current`; touch swipes and the TV moves focus.',
  InlineText:
    'Inline markdown’s runs as nested Text, links pressed by touch or a pointer and only words on the TV; the web renderer’s pages write their own spans.',
  NoticeCard:
    'An announcement in Alerts’ list: a row by touch and with a pointer, a focus stop on the TV; the web renderer has Banner.',
  Certification:
    'A title’s certification in its edged box, the TV’s on its pill rule; the web renderer’s pages draw theirs from the DOM until part D.',
  PersonPortrait:
    'A person page’s round portrait at each form factor’s size, with the TV’s focus shadow; the web renderer’s pages draw theirs until part D.',
  TitleBackdrop:
    'A title’s art behind its page: in flow at 16:9 by touch, behind the words with a pointer and on the TV, faded where the words stand.',
  Toast:
    'A short notice on its own surface, the TV’s over rows; the web renderer’s Toaster is the admin’s stack.',
  FeaturedCardSkeleton:
    'FeaturedCard while Home loads, at each form factor’s size; the web renderer’s Home draws its own from Skeleton until part C.',
  RowSkeleton:
    'A Row while it loads, its title over posters or stills at the row’s width; the web renderer’s pages draw theirs from Skeleton until part C.',
  FilmRowSkeleton:
    'FilmRow while Home loads, at the sizes the row will have; the web renderer’s Home draws its own from Skeleton until part C.',
  PosterSkeleton:
    'A poster’s placeholder as Poster lays one out, the TV’s at TvTile’s measures; the web renderer’s pages draw theirs from Skeleton until part C.',
  TvAcknowledge:
    'An announcement the TV asks to have acknowledged, over the page with focus held on its one action.',
  TvRadioGroup:
    'A TV list of choices, one in force, as the player’s Audio and subtitles; the web has RadioGroup.',
  TvProgressLine: 'Where a title’s resume stands under its TV hero.',
  TvSideDialog: 'A TV dialog at the screen’s right that keeps focus until Back; the web has Sheet.',
}

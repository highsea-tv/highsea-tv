// SPDX-License-Identifier: AGPL-3.0-only
// One Icon component for the Lucide subset and the custom glyphs:
// docs/design-language/iconography.md
import {
  Activity,
  Archive,
  ArrowLeft,
  ArrowRight,
  Bell,
  Book,
  Bookmark,
  Calendar,
  Captions,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  CircleCheck,
  CircleX,
  Clapperboard,
  Clock,
  Command,
  Compass,
  Copy,
  CornerDownLeft,
  createLucideIcon,
  Download,
  Ellipsis,
  ExternalLink,
  Eye,
  FileInput,
  Film,
  Folder,
  Funnel,
  Gauge,
  Globe,
  GripVertical,
  HardDrive,
  Headphones,
  House,
  Inbox,
  Info,
  KeyRound,
  Laptop,
  LayoutDashboard,
  LayoutGrid,
  Library,
  List,
  LoaderCircle,
  Lock,
  LogOut,
  type LucideIcon,
  type LucideProps,
  Megaphone,
  Menu,
  Minus,
  MonitorPlay,
  Music,
  Palette,
  PanelLeft,
  Pause,
  Pencil,
  PictureInPicture2,
  Play,
  Plus,
  Podcast,
  Puzzle,
  Radar,
  RefreshCw,
  RotateCcw,
  ScrollText,
  Search,
  Server,
  Settings,
  Shield,
  Smartphone,
  Sparkles,
  Star,
  Trash2,
  TriangleAlert,
  Tv,
  Upload,
  User,
  Users,
  Volume2,
  VolumeX,
  Wifi,
  X,
} from 'lucide-react'
import { glyphs } from './glyphs.ts'

const custom = Object.fromEntries(
  Object.entries(glyphs).map(([name, node]) => [name, createLucideIcon(name, node)]),
) as Record<keyof typeof glyphs, LucideIcon>

/** Every icon the system ships, by name. Add Lucide icons here as product needs them. */
export const icons = {
  // navigation and destinations
  home: House,
  search: Search,
  library: Library,
  grid: LayoutGrid,
  dashboard: LayoutDashboard,
  discover: Compass,
  activity: Activity,
  downloads: Download,
  download: Download,
  storage: HardDrive,
  upload: Upload,
  settings: Settings,
  system: Server,
  server: Server,
  user: User,
  users: Users,
  curation: Sparkles,
  subtitles: Captions,
  indexers: Radar,
  calendar: Calendar,
  inbox: Inbox,
  menu: Menu,
  sidebar: PanelLeft,
  // media types
  movie: Film,
  series: Tv,
  music: Music,
  book: Book,
  audiobook: Headphones,
  podcast: Podcast,
  'online-video': MonitorPlay,
  trailer: Clapperboard,
  // actions
  play: Play,
  pause: Pause,
  'picture-in-picture': PictureInPicture2,
  add: Plus,
  remove: Minus,
  edit: Pencil,
  delete: Trash2,
  copy: Copy,
  refresh: RefreshCw,
  replay: RotateCcw,
  filter: Funnel,
  more: Ellipsis,
  close: X,
  check: Check,
  bookmark: Bookmark,
  external: ExternalLink,
  view: Eye,
  'sign-out': LogOut,
  drag: GripVertical,
  'arrow-left': ArrowLeft,
  'arrow-right': ArrowRight,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'chevron-up': ChevronUp,
  'chevron-down': ChevronDown,
  // status and feedback
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  error: CircleX,
  alert: CircleAlert,
  loading: LoaderCircle,
  announcement: Megaphone,
  notification: Bell,
  speed: Gauge,
  clock: Clock,
  star: Star,
  lock: Lock,
  shield: Shield,
  network: Wifi,
  globe: Globe,
  folder: Folder,
  plugin: Puzzle,
  list: List,
  sound: Volume2,
  mute: VolumeX,
  command: Command,
  enter: CornerDownLeft,
  // people, devices and the server (checkpoint 4)
  palette: Palette,
  key: KeyRound,
  tv: Tv,
  phone: Smartphone,
  laptop: Laptop,
  logs: ScrollText,
  backup: Archive,
  import: FileInput,
  // custom glyphs (design/assets/icons)
  indexer: custom.indexer,
  seeding: custom.seeding,
  'subtitle-sync': custom['subtitle-sync'],
  catalog: custom.catalog,
} satisfies Record<string, LucideIcon>

export type IconName = keyof typeof icons

export type IconProps = LucideProps & {
  name: IconName
  /** 16 inline with small text, 20 in buttons and inputs (default), 24 in toolbars and tab bars. */
  size?: number
  /** Names the icon for assistive tech. Without it the icon is decorative and hidden. */
  label?: string
}

export function Icon({ name, size = 20, strokeWidth = 1.75, label, ...props }: IconProps) {
  const Glyph = icons[name]
  return (
    <Glyph
      size={size}
      strokeWidth={strokeWidth}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
      focusable="false"
      {...props}
    />
  )
}

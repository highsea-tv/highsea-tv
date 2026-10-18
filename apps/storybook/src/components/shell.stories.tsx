// SPDX-License-Identifier: AGPL-3.0-only
import {
  Badge,
  Banner,
  Button,
  type CommandGroup,
  CommandPalette,
  EmptyState,
  Kbd,
  Lockup,
  modKey,
  NavGroup,
  NavItem,
  PageHeader,
  Progress,
  SearchTrigger,
  ServerCard,
  Sidebar,
  type SidebarMode,
  SkeletonText,
  Stat,
  StatusBar,
  StatusItem,
  toast,
  useCommandPaletteShortcut,
  WidgetFrame,
  WidgetGrid,
} from '@highsea/ui-web'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useCallback, useState } from 'react'

const meta = {
  title: 'Shell/Admin',
  parameters: { layout: 'fullscreen' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const pages = [
  ['dashboard', 'Dashboard'],
  ['discover', 'Discover'],
  ['movie', 'Movies', 412],
  ['activity', 'Activity', 5],
  ['downloads', 'Downloads'],
] as const

function Nav({
  mode,
  active,
  onNavigate,
}: {
  mode?: SidebarMode
  active: string
  onNavigate: (p: string) => void
}) {
  return (
    <Sidebar
      mode={mode}
      header={<Lockup />}
      footer={
        <ServerCard
          name="Harbor"
          detail="v1.0 · 4 clients"
          onClick={() => toast({ title: 'Server details' })}
        />
      }
    >
      <NavGroup>
        {pages.map(([icon, label, count]) => (
          <NavItem
            key={label}
            icon={icon}
            label={label}
            count={count}
            active={active === label}
            onClick={() => onNavigate(label)}
          />
        ))}
      </NavGroup>
      <NavGroup>
        <NavItem
          icon="indexer"
          label="Indexers"
          active={active === 'Indexers'}
          onClick={() => onNavigate('Indexers')}
        />
        <NavItem
          icon="settings"
          label="Settings"
          active={active === 'Settings'}
          onClick={() => onNavigate('Settings')}
        />
      </NavGroup>
    </Sidebar>
  )
}

export const SidebarStory: Story = {
  name: 'Sidebar',
  render: function Render() {
    const [active, setActive] = useState('Dashboard')
    return (
      <div className="flex h-[640px] gap-8 bg-bg">
        <Nav mode="full" active={active} onNavigate={setActive} />
        <Nav mode="rail" active={active} onNavigate={setActive} />
      </div>
    )
  },
}

const groups = (go: (label: string) => void): CommandGroup[] => [
  {
    heading: 'Go to',
    items: [
      {
        id: 'movies',
        label: 'Movies',
        icon: 'movie',
        shortcut: 'G M',
        onSelect: () => go('Movies'),
      },
      {
        id: 'downloads',
        label: 'Downloads',
        icon: 'downloads',
        keywords: ['torrents', 'queue'],
        hint: '3 active',
        onSelect: () => go('Downloads'),
      },
      {
        id: 'settings',
        label: 'Settings',
        icon: 'settings',
        shortcut: ',',
        onSelect: () => go('Settings'),
      },
    ],
  },
  {
    heading: 'Actions',
    items: [
      {
        id: 'add',
        label: 'Add a movie',
        icon: 'add',
        onSelect: () => toast({ title: 'Add a movie' }),
      },
      {
        id: 'pause',
        label: 'Pause all downloads',
        icon: 'pause',
        onSelect: () => toast({ title: 'Paused' }),
      },
      {
        id: 'indexer',
        label: 'Add an indexer',
        icon: 'indexer',
        keywords: ['tracker'],
        onSelect: () => toast({ title: 'Catalog' }),
      },
    ],
  },
]

export const Palette: Story = {
  name: 'Command palette',
  render: function Render() {
    const [open, setOpen] = useState(false)
    const toggle = useCallback(() => setOpen((o) => !o), [])
    useCommandPaletteShortcut(toggle)
    return (
      <div className="grid min-h-[480px] place-items-center">
        <Button icon="search" onClick={toggle}>
          Search or jump to… <Kbd>{modKey()}K</Kbd>
        </Button>
        <CommandPalette
          open={open}
          onOpenChange={setOpen}
          groups={groups((p) => toast({ title: `Go to ${p}` }))}
        />
      </div>
    )
  },
}

export const Widgets: Story = {
  render: function Render() {
    const [editing, setEditing] = useState(false)
    return (
      <div className="grid gap-4 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-heading">Dashboard</h1>
          <Button
            variant={editing ? 'primary' : 'secondary'}
            icon="edit"
            onClick={() => setEditing((e) => !e)}
          >
            {editing ? 'Done' : 'Customize'}
          </Button>
        </div>
        <WidgetGrid>
          <WidgetFrame
            title="Network"
            span={2}
            meta={<Badge tone="success">Live</Badge>}
            editing={editing}
          >
            <div className="flex gap-10">
              <Stat value="18.4" unit="MB/s" caption="down" />
              <Stat value="2.1" unit="MB/s" caption="up" />
            </div>
          </WidgetFrame>
          <WidgetFrame title="Storage" editing={editing}>
            <Stat value="71" unit="%" caption="of 8 TB used" />
            <Progress value={71} tone="neutral" size="md" aria-label="Disk used" />
          </WidgetFrame>
          <WidgetFrame title="Indexers" meta="6 of 6" editing={editing}>
            <Stat value="6" caption="healthy" />
          </WidgetFrame>
          <WidgetFrame title="Recently added" span={2} editing={editing}>
            <ul className="grid gap-2 text-ui text-text-2">
              <li>Sintel (2010)</li>
              <li>Spring (2019)</li>
              <li>Charge (2022)</li>
            </ul>
          </WidgetFrame>
          <WidgetFrame title="Subtitle queue" span={2} meta="loading" editing={editing}>
            <SkeletonText lines={3} />
          </WidgetFrame>
        </WidgetGrid>
      </div>
    )
  },
}

export const PageFurniture: Story = {
  name: 'Page header and empty states',
  parameters: {
    docs: {
      description: {
        story:
          'Every admin page starts with `PageHeader`: the title, the search that opens the palette, then actions with the primary last. Below medium the search folds to an icon. `EmptyState` stands in for content that isn’t there; the `error` tone is announced and always offers a retry.',
      },
    },
  },
  render: () => (
    <div className="grid gap-6 bg-bg p-6">
      <PageHeader
        title="Dashboard"
        search={<SearchTrigger onClick={() => toast({ title: 'Opens the command palette' })} />}
        actions={<Button icon="grid">Customize</Button>}
      />
      <PageHeader
        title="Dashboard"
        description="Drag a widget by its handle to move it, or by its corner to resize it. Nothing is saved until you press Done."
        actions={
          <>
            <Button icon="add">Add widget</Button>
            <Button variant="ghost">Cancel</Button>
            <Button variant="primary" icon="check">
              Done
            </Button>
          </>
        }
      />
      <div className="grid gap-4 medium:grid-cols-3">
        <WidgetFrame title="Queue">
          <EmptyState size="sm" icon="downloads" title="The queue is empty">
            Movies you add show here while they download and import.
          </EmptyState>
        </WidgetFrame>
        <WidgetFrame title="Indexers">
          <EmptyState
            size="sm"
            icon="indexer"
            title="No indexers yet"
            action={
              <Button size="sm" variant="primary">
                Add indexers
              </Button>
            }
          />
        </WidgetFrame>
        <WidgetFrame title="Storage">
          <EmptyState
            size="sm"
            tone="error"
            title="Couldn’t load storage"
            action={<Button size="sm">Try again</Button>}
          >
            Harbor isn’t responding. It may be restarting.
          </EmptyState>
        </WidgetFrame>
      </div>
      <EmptyState icon="lock" title="Only owners and admins can open Downloads">
        Ask the server’s owner if you need access.
      </EmptyState>
    </div>
  ),
}

export const StatusBarStory: Story = {
  name: 'Status bar',
  parameters: {
    docs: {
      description: {
        story:
          'One thin row under the content column. Values update in place without motion or announcements. Resources hide below expanded; the jobs summary holds the end.',
      },
    },
  },
  render: () => (
    <div className="grid gap-4 bg-bg p-6">
      <StatusBar>
        <StatusItem dot="success">Harbor</StatusItem>
        <StatusItem hideBelow="medium">v1.0.0</StatusItem>
        <StatusItem hideBelow="medium">4 clients</StatusItem>
        <StatusItem hideBelow="expanded">CPU 12%</StatusItem>
        <StatusItem hideBelow="expanded">RAM 1.2 GB</StatusItem>
        <StatusItem hideBelow="expanded">6.2 TB free</StatusItem>
        <StatusItem end>2 jobs running · RSS sync in 9m</StatusItem>
      </StatusBar>
      <StatusBar aria-label="Server status, disconnected">
        <StatusItem dot="danger">Not connected</StatusItem>
        <StatusItem end>Retrying every few seconds</StatusItem>
      </StatusBar>
    </div>
  ),
}

export const AdminShell: Story = {
  name: 'Admin shell',
  parameters: {
    docs: {
      description: {
        story:
          'The full sidebar at expanded and wide, the icon rail at medium. Resize the canvas to see it switch.',
      },
    },
  },
  render: function Render() {
    const [active, setActive] = useState('Dashboard')
    const [open, setOpen] = useState(false)
    const [banner, setBanner] = useState(true)
    const toggle = useCallback(() => setOpen((o) => !o), [])
    useCommandPaletteShortcut(toggle)
    return (
      // the viewport is the frame: the sidebar holds still and the content column scrolls
      <div className="flex h-screen bg-bg">
        <Nav active={active} onNavigate={setActive} />
        <div className="grid min-w-0 flex-1 content-start overflow-y-auto">
          <header className="flex items-center gap-3 border-line border-b px-6 py-3">
            <h1 className="text-title">{active}</h1>
            <span className="flex-1" />
            <Button variant="ghost" icon="search" onClick={toggle}>
              Search <Kbd>{modKey()}K</Kbd>
            </Button>
            <Button variant="primary" icon="add">
              Add movie
            </Button>
          </header>
          <main className="grid gap-6 p-6">
            {banner && (
              <Banner title="Server maintenance tonight" onDismiss={() => setBanner(false)}>
                Streams pause for about ten minutes after 2 am.
              </Banner>
            )}
            <WidgetGrid>
              <WidgetFrame title="Network" span={2}>
                <Stat value="18.4" unit="MB/s" caption="down" />
              </WidgetFrame>
              <WidgetFrame title="Storage" span={2}>
                <Progress value={71} tone="neutral" size="md" showValue aria-label="Disk used" />
              </WidgetFrame>
            </WidgetGrid>
          </main>
        </div>
        <CommandPalette open={open} onOpenChange={setOpen} groups={groups(setActive)} />
      </div>
    )
  },
}

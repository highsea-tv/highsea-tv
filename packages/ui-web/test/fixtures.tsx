// SPDX-License-Identifier: AGPL-3.0-only
// Every component in its main states, for the stylesheet and accessibility checks.
import {
  BackdropHero,
  Badge,
  Banner,
  Button,
  CarouselRow,
  Checkbox,
  CommandPalette,
  ConfirmDialog,
  Dialog,
  DialogContent,
  Field,
  Icon,
  Input,
  Kbd,
  Lockup,
  Mark,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  NavGroup,
  NavItem,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Poster,
  Progress,
  QualityTag,
  Rating,
  RatingInput,
  RowActions,
  SegmentedControl,
  Select,
  SelectGroup,
  SelectItem,
  SelectSeparator,
  ServerCard,
  Sheet,
  SheetContent,
  Sidebar,
  Skeleton,
  SkeletonText,
  Stat,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableFrame,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  TitleCell,
  Toaster,
  Tooltip,
  toast,
  UIProvider,
  WidgetFrame,
  WidgetGrid,
} from '../src/index.ts'

export function KitchenSink({ rail = false }: { rail?: boolean }) {
  return (
    <UIProvider toaster={false}>
      <div className="flex">
        <Sidebar
          mode={rail ? 'rail' : 'full'}
          header={<Lockup />}
          footer={<ServerCard name="Harbor" detail="v1.0 · 4 clients" />}
        >
          <NavGroup>
            <NavItem icon="dashboard" label="Dashboard" href="/" active />
            <NavItem icon="discover" label="Discover" href="/discover" />
            <NavItem icon="movie" label="Movies" href="/movies" count={412} />
          </NavGroup>
          <NavGroup>
            <NavItem icon="indexer" label="Indexers" href="/indexers" />
            <NavItem icon="settings" label="Settings" onClick={() => {}} />
          </NavGroup>
        </Sidebar>
        <main className="grid gap-6 p-6">
          <h1 className="text-heading">Kitchen sink</h1>
          <Banner title="Server maintenance tonight" onDismiss={() => {}}>
            Streams pause for about ten minutes after 2 am.
          </Banner>
          <Banner variant="card" tone="warning" title="Disk almost full" onAcknowledge={() => {}} />

          <div className="flex flex-wrap gap-2">
            <Button variant="primary" icon="add">
              Add movie
            </Button>
            <Button>Details</Button>
            <Button variant="ghost" size="sm" iconEnd="chevron-right">
              More
            </Button>
            <Button variant="danger">Delete</Button>
            <Button iconOnly icon="more" aria-label="More actions" />
            <Button loading>Saving</Button>
            <Button asChild variant="secondary">
              <a href="/settings">Settings</a>
            </Button>
          </div>

          <div className="grid gap-4">
            <Field label="Server name" hint="Shown to everyone who connects.">
              <Input defaultValue="Harbor" />
            </Field>
            <Field label="Search" error="Type at least two characters.">
              <Input icon="search" end={<Kbd>⌘K</Kbd>} />
            </Field>
            <Field label="Notes">
              <Textarea />
            </Field>
            <Field label="Quality profile">
              <Select
                defaultValue="hd"
                options={[
                  { value: 'hd', label: 'HD-1080p' },
                  { value: 'uhd', label: 'Ultra-HD' },
                ]}
              />
            </Field>
            <Field label="Start on boot">
              <Switch defaultChecked />
            </Field>
            <Field label="Monitored">
              <Checkbox defaultChecked />
            </Field>
            <SegmentedControl
              aria-label="View"
              options={[
                { value: 'grid', label: 'Grid', icon: 'grid' },
                { value: 'list', label: 'List', icon: 'list' },
              ]}
            />
            <SegmentedControl
              size="sm"
              aria-label="Range"
              options={[
                { value: '1h', label: '1h' },
                { value: '24h', label: '24h' },
              ]}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge>Queued</Badge>
            <Badge tone="accent">Downloading</Badge>
            <Badge tone="success">Seeding</Badge>
            <Badge tone="warning">Stalled</Badge>
            <Badge tone="danger">Failed</Badge>
            <Badge tone="info">Importing</Badge>
            <Badge dot={false}>12</Badge>
            <QualityTag>4K</QualityTag>
          </div>

          <Tabs defaultValue="queue">
            <TabsList aria-label="Activity">
              <TabsTrigger value="queue" count={5}>
                Queue
              </TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
            <TabsContent value="queue">Queue</TabsContent>
            <TabsContent value="history">History</TabsContent>
          </Tabs>
          <Tabs variant="line" defaultValue="files">
            <TabsList aria-label="Movie">
              <TabsTrigger value="files">Files</TabsTrigger>
              <TabsTrigger value="subtitles">Subtitles</TabsTrigger>
            </TabsList>
            <TabsContent value="files">Files</TabsContent>
            <TabsContent value="subtitles">Subtitles</TabsContent>
          </Tabs>

          <TableFrame>
            <TableToolbar>
              <b>Queue</b>
            </TableToolbar>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead numeric>Speed</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TitleCell title="Sintel" detail="Sintel.2010.2160p.WEB-DL.DDP5.1.H.265-GRP" />
                  <TableCell>
                    <Badge tone="accent">Downloading</Badge>
                  </TableCell>
                  <TableCell>
                    <Progress value={42.5} showValue aria-label="Sintel progress" />
                  </TableCell>
                  <TableCell numeric>18.4 MB/s</TableCell>
                  <TableCell>
                    <RowActions>
                      <Button size="sm" variant="ghost" iconOnly icon="pause" aria-label="Pause" />
                    </RowActions>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TitleCell title="Spring" />
                  <TableCell>
                    <Badge tone="warning">Stalled</Badge>
                  </TableCell>
                  <TableCell>
                    <Progress value={null} tone="warning" aria-label="Spring progress" />
                  </TableCell>
                  <TableCell numeric>0 B/s</TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </TableFrame>

          <WidgetGrid>
            <WidgetFrame title="Network" span={2} meta="live">
              <Stat value="18.4" unit="MB/s" caption="down" />
            </WidgetFrame>
            <WidgetFrame title="Storage" editing>
              <Progress value={71} size="md" tone="neutral" showValue aria-label="Disk used" />
            </WidgetFrame>
            <WidgetFrame title="Loading">
              <Skeleton className="h-6 w-24" />
              <SkeletonText />
            </WidgetFrame>
          </WidgetGrid>

          <BackdropHero
            item={{
              id: 'sintel',
              title: 'Sintel',
              eyebrow: 'Featured',
              meta: <QualityTag>4K</QualityTag>,
              synopsis: 'A lonely young woman searches for a baby dragon.',
            }}
            actions={
              <>
                <Button variant="primary" icon="play">
                  Play
                </Button>
                <Button>Details</Button>
              </>
            }
          />

          <CarouselRow
            title="Recently added"
            suffix="by Harbor"
            action={<a href="/new">See all</a>}
          >
            <Poster title="Sintel" href="/m/1" quality={['4K']} />
            <Poster title="Spring" href="/m/2" showTitle caption="2019" />
            <Poster
              title="Cosmos Laundromat"
              onClick={() => {}}
              aspect="still"
              progress={40}
              actions={
                <Button size="sm" iconOnly icon="play" aria-label="Play Cosmos Laundromat" />
              }
            />
            <Poster title="Big Buck Bunny" aspect="book" />
          </CarouselRow>

          <div className="flex items-center gap-4">
            <Rating value={3.5} showValue />
            <RatingInput aria-label="Your rating" defaultValue={4} />
            <Mark size={16} label="highsea" />
            <Mark size={32} paint="mono" />
            <Icon name="seeding" label="Seeding" />
          </div>

          <Popover defaultOpen>
            <PopoverTrigger asChild>
              <Button>Filters</Button>
            </PopoverTrigger>
            <PopoverContent aria-label="Filters">Popover body</PopoverContent>
          </Popover>

          <Menu defaultOpen modal={false}>
            <MenuTrigger asChild>
              <Button iconOnly icon="more" aria-label="Row menu" />
            </MenuTrigger>
            <MenuContent>
              <MenuLabel>Sintel</MenuLabel>
              <MenuItem icon="refresh" shortcut="R">
                Search again
              </MenuItem>
              <MenuSeparator />
              <MenuItem icon="delete" danger>
                Remove
              </MenuItem>
            </MenuContent>
          </Menu>
        </main>
      </div>
    </UIProvider>
  )
}

/** Overlays, one per render: each is open, so their portaled content is in the document. */
export const overlays = {
  dialog: () => (
    <Dialog defaultOpen>
      <DialogContent
        title="Remove Sintel?"
        description="The file stays on disk."
        footer={<Button variant="danger">Remove</Button>}
      >
        <p className="text-body text-text-2">Body copy.</p>
      </DialogContent>
    </Dialog>
  ),
  confirm: () => (
    <ConfirmDialog
      open
      title="Delete Sintel?"
      description="This deletes the file from disk. It can't be undone."
      confirmLabel="Delete"
      destructive
      onConfirm={() => {}}
    />
  ),
  sheetBottom: () => (
    <Sheet defaultOpen>
      <SheetContent title="Filters" description="Narrow the library.">
        Body
      </SheetContent>
    </Sheet>
  ),
  sheetLeft: () => (
    <Sheet defaultOpen>
      <SheetContent side="left" title="Menu" hideTitle>
        <Sidebar mode="full">
          <NavGroup>
            <NavItem icon="home" label="Home" href="/" active />
          </NavGroup>
        </Sidebar>
      </SheetContent>
    </Sheet>
  ),
  sheetRight: () => (
    <Sheet defaultOpen>
      <SheetContent side="right" title="Details" footer={<Button>Close</Button>}>
        Body
      </SheetContent>
    </Sheet>
  ),
  popover: () => (
    <Popover defaultOpen>
      <PopoverTrigger asChild>
        <Button>Filters</Button>
      </PopoverTrigger>
      <PopoverContent aria-label="Filters">Popover body</PopoverContent>
    </Popover>
  ),
  menu: () => (
    <Menu defaultOpen>
      <MenuTrigger asChild>
        <Button iconOnly icon="more" aria-label="Row menu" />
      </MenuTrigger>
      <MenuContent>
        <MenuLabel>Sintel</MenuLabel>
        <MenuItem icon="refresh" shortcut="R">
          Search again
        </MenuItem>
        <MenuSeparator />
        <MenuItem icon="delete" danger>
          Remove
        </MenuItem>
      </MenuContent>
    </Menu>
  ),
  select: () => (
    <Select defaultOpen defaultValue="hd" aria-label="Quality profile">
      <SelectGroup label="Profiles">
        <SelectItem value="hd">HD-1080p</SelectItem>
        <SelectItem value="uhd">Ultra-HD</SelectItem>
      </SelectGroup>
      <SelectSeparator />
      <SelectItem value="any">Any</SelectItem>
    </Select>
  ),
  tooltip: () => (
    <Tooltip content="Search" shortcut="/" open>
      <Button iconOnly icon="search" aria-label="Search" />
    </Tooltip>
  ),
  palette: () => (
    <CommandPalette
      open
      onOpenChange={() => {}}
      groups={[
        {
          heading: 'Go to',
          items: [
            { id: 'movies', label: 'Movies', icon: 'movie', onSelect: () => {} },
            {
              id: 'downloads',
              label: 'Downloads',
              icon: 'downloads',
              shortcut: 'G D',
              hint: '3 active',
              onSelect: () => {},
            },
          ],
        },
      ]}
    />
  ),
  toast: () => {
    toast.success('Added Sintel', { description: 'Searching for a release now.' })
    toast({ title: 'Grab failed', tone: 'danger', action: { label: 'Retry', onClick: () => {} } })
    toast({ title: 'Heads up', tone: 'warning' })
    return <Toaster />
  },
}

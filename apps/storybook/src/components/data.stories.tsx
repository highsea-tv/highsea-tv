// SPDX-License-Identifier: AGPL-3.0-only
import { posterArt } from '@highsea-tv/fixtures'
import {
  Badge,
  Button,
  Progress,
  QualityTag,
  RowActions,
  SegmentedControl,
  Skeleton,
  SkeletonText,
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
  TitleCell,
} from '@highsea-tv/ui-web'
import type { Meta, StoryObj } from '@storybook/react-vite'

const meta = { title: 'Components/Data display' } satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

type Row = {
  title: string
  release: string
  status: [tone: 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'neutral', label: string]
  progress: number | null
  speed: string
  eta: string
}

const queue: Row[] = [
  {
    title: 'Sintel',
    release: 'Sintel.2010.2160p.WEB-DL.DDP5.1.H.265-GRP',
    status: ['accent', 'Downloading'],
    progress: 42.5,
    speed: '18.4 MB/s',
    eta: '3m 12s',
  },
  {
    title: 'Spring',
    release: 'Spring.2019.1080p.BluRay.x264-GRP',
    status: ['warning', 'Stalled'],
    progress: null,
    speed: '0 B/s',
    eta: '—',
  },
  {
    title: 'Tears of Steel',
    release: 'Tears.of.Steel.2012.2160p.UHD.BluRay.x265-GRP',
    status: ['info', 'Importing'],
    progress: 100,
    speed: '—',
    eta: '—',
  },
  {
    title: 'Cosmos Laundromat',
    release: 'Cosmos.Laundromat.2015.1080p.WEB-DL-GRP',
    status: ['success', 'Seeding'],
    progress: 100,
    speed: '2.1 MB/s',
    eta: 'ratio 1.4',
  },
  {
    title: 'Elephants Dream',
    release: 'Elephants.Dream.2006.720p.HDTV-GRP',
    status: ['danger', 'Failed'],
    progress: 12,
    speed: '—',
    eta: '—',
  },
]

const tone = (s: Row['status'][0]) =>
  s === 'warning' ? 'warning' : s === 'danger' ? 'danger' : s === 'success' ? 'success' : 'accent'

export const QueueTable: Story = {
  name: 'Table',
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div className="p-6">
      <TableFrame>
        <TableToolbar>
          <span className="text-widget-title">Queue</span>
          <Badge dot={false}>{queue.length}</Badge>
          <span className="flex-1" />
          <SegmentedControl
            size="sm"
            aria-label="Show"
            defaultValue="all"
            options={[
              { value: 'all', label: 'All' },
              { value: 'active', label: 'Active' },
            ]}
          />
        </TableToolbar>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-48">Progress</TableHead>
              <TableHead numeric>Speed</TableHead>
              <TableHead numeric>ETA</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {queue.map((r) => (
              <TableRow key={r.title}>
                <TitleCell title={r.title} detail={r.release} art={posterArt(r.title)} />
                <TableCell>
                  <Badge tone={r.status[0]}>{r.status[1]}</Badge>
                </TableCell>
                <TableCell>
                  <Progress
                    value={r.progress}
                    tone={tone(r.status[0])}
                    showValue
                    aria-label={`${r.title} progress`}
                  />
                </TableCell>
                <TableCell numeric>{r.speed}</TableCell>
                <TableCell numeric>{r.eta}</TableCell>
                <TableCell>
                  <RowActions>
                    <Button
                      size="sm"
                      variant="ghost"
                      iconOnly
                      icon="pause"
                      aria-label={`Pause ${r.title}`}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      iconOnly
                      icon="delete"
                      aria-label={`Remove ${r.title}`}
                    />
                  </RowActions>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableFrame>
    </div>
  ),
}

export const Badges: Story = {
  render: () => (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        <Badge>Queued</Badge>
        <Badge tone="accent">Downloading</Badge>
        <Badge tone="success">Seeding</Badge>
        <Badge tone="warning">Stalled</Badge>
        <Badge tone="danger">Failed</Badge>
        <Badge tone="info">Importing</Badge>
        <Badge dot={false}>12</Badge>
      </div>
      <div className="flex flex-wrap gap-2">
        <QualityTag>4K</QualityTag>
        <QualityTag>HDR</QualityTag>
        <QualityTag>DV</QualityTag>
        <QualityTag>1080p</QualityTag>
        <QualityTag>CC</QualityTag>
      </div>
    </div>
  ),
}

export const ProgressStory: Story = {
  name: 'Progress',
  render: () => (
    <div className="grid max-w-md gap-5">
      <Progress value={42} showValue aria-label="Download" />
      <Progress value={71} tone="neutral" size="md" showValue aria-label="Disk used" />
      <Progress value={100} tone="success" showValue aria-label="Verified" />
      <Progress value={88} tone="warning" showValue aria-label="Disk almost full" />
      <Progress value={12} tone="danger" showValue aria-label="Failed at" />
      <Progress value={null} aria-label="Waiting for peers" />
    </div>
  ),
}

export const SkeletonStory: Story = {
  name: 'Skeleton',
  render: () => (
    <div className="grid max-w-sm gap-3">
      <Skeleton className="h-6 w-40" />
      <SkeletonText lines={3} />
      <div className="flex gap-3">
        <Skeleton className="aspect-2/3 w-24 rounded-poster" />
        <Skeleton className="aspect-2/3 w-24 rounded-poster" />
        <Skeleton className="aspect-2/3 w-24 rounded-poster" />
      </div>
    </div>
  ),
}

export const TabsStory: Story = {
  name: 'Tabs',
  render: () => (
    <div className="grid gap-8">
      <Tabs defaultValue="queue">
        <TabsList aria-label="Activity">
          <TabsTrigger value="queue" count={5}>
            Queue
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="blocklist">Blocklist</TabsTrigger>
        </TabsList>
        <TabsContent value="queue" className="pt-4 text-text-2">
          Five items downloading.
        </TabsContent>
        <TabsContent value="history" className="pt-4 text-text-2">
          Everything grabbed, imported and deleted.
        </TabsContent>
        <TabsContent value="blocklist" className="pt-4 text-text-2">
          Releases that won't be grabbed again.
        </TabsContent>
      </Tabs>
      <Tabs variant="line" defaultValue="files">
        <TabsList aria-label="Movie">
          <TabsTrigger value="files">Files</TabsTrigger>
          <TabsTrigger value="subtitles" count={3}>
            Subtitles
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="files" className="pt-4 text-text-2">
          Sintel (2010).mkv · 2160p · 4.2 GB
        </TabsContent>
        <TabsContent value="subtitles" className="pt-4 text-text-2">
          English, English (forced), Dutch
        </TabsContent>
        <TabsContent value="history" className="pt-4 text-text-2">
          Grabbed, imported.
        </TabsContent>
      </Tabs>
    </div>
  ),
}

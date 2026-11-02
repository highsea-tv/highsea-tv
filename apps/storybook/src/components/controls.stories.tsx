// SPDX-License-Identifier: AGPL-3.0-only
// Every control on design system 1.1's spec (docs/design-language/controls.md), md and sm in one
// row each, for each platform's rule and each built-in theme. Controls in a row share one height,
// one corner and one text size; the platform and theme change only what their rules allow.
import { builtInThemes, type ControlPlatform, type ControlSize } from '@highsea-tv/tokens'
import {
  Button,
  Checkbox,
  Chip,
  Disclosure,
  Input,
  MultiSelect,
  PlatformScope,
  Radio,
  RadioGroup,
  SearchField,
  SegmentedControl,
  Select,
  Switch,
  Table,
  TableBody,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TitleCell,
} from '@highsea-tv/ui'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Page, Section } from '../foundations/page.tsx'

const meta = { title: 'Components/Controls', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta
type Story = StoryObj<typeof meta>

const genres = [
  { value: 'drama', label: 'Drama' },
  { value: 'comedy', label: 'Comedy' },
  { value: 'horror', label: 'Horror' },
]

/** One row of every control at one size. */
function Row({ size, name }: { size: ControlSize; name: string }) {
  return (
    <div className="flex flex-wrap items-center gap-(--control-row-gap)">
      <Button variant="primary" size={size} icon="play">
        Play
      </Button>
      <Button size={size}>Details</Button>
      <Button variant="ghost" size={size}>
        Cancel
      </Button>
      <Button variant="danger" size={size}>
        Delete
      </Button>
      <Button size={size} iconOnly icon="more" aria-label={`More, ${name}`} />
      <Input size={size} aria-label={`Name, ${name}`} placeholder="Server name" className="w-40" />
      <Select
        size={size}
        aria-label={`Quality, ${name}`}
        defaultValue="hd"
        options={[
          { value: 'hd', label: 'HD-1080p' },
          { value: 'uhd', label: 'Ultra-HD' },
        ]}
        className="w-36"
      />
      <SearchField size={size} label={`Search, ${name}`} className="w-48" />
      <MultiSelect
        size={size}
        aria-label={`Genres, ${name}`}
        placeholder="Any genre"
        defaultValue={['drama']}
        options={genres}
        className="w-40"
      />
      <SegmentedControl
        size={size}
        aria-label={`View, ${name}`}
        options={[
          { value: 'grid', label: 'Grid', icon: 'grid' },
          { value: 'list', label: 'List', icon: 'list' },
        ]}
      />
      <Tabs size={size} defaultValue="all">
        <TabsList aria-label={`Status, ${name}`}>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="missing">Missing</TabsTrigger>
        </TabsList>
        <TabsContent value="all" className="sr-only">
          All
        </TabsContent>
        <TabsContent value="missing" className="sr-only">
          Missing
        </TabsContent>
      </Tabs>
      <Chip size={size} selected>
        All
      </Chip>
      <Chip size={size} selected={false}>
        Movies
      </Chip>
    </div>
  )
}

/** The toggles and the rows, which take the control's text but have their own box. */
function Toggles({ name }: { name: string }) {
  return (
    <div className="flex flex-wrap items-center gap-6">
      <Checkbox label="Search on add" defaultChecked />
      <Switch label="Seed after import" defaultChecked />
      <RadioGroup aria-label={`Upgrade, ${name}`} defaultValue="always" className="flex gap-4">
        <Radio value="always" label="Always" />
        <Radio value="never" label="Never" />
      </RadioGroup>
      <div className="w-64">
        <Disclosure title="Advanced" detail="3 settings">
          <p className="text-text-2 text-ui">Shown when open.</p>
        </Disclosure>
      </div>
    </div>
  )
}

function Controls({ name }: { name: string }) {
  return (
    <div className="grid gap-4">
      <Row size="md" name={`${name}, md`} />
      <Row size="sm" name={`${name}, sm`} />
      <Toggles name={name} />
      {/* over artwork: the overlay look */}
      <div className="flex flex-wrap gap-(--control-row-gap) rounded-lg bg-[linear-gradient(120deg,var(--color-accent-fill),var(--color-s4))] p-6">
        <Button variant="overlay" icon="play">
          Trailer
        </Button>
        <Button variant="overlay" iconOnly icon="more" aria-label={`More, ${name}, over art`} />
      </div>
    </div>
  )
}

const platforms: { platform: ControlPlatform; title: string; note: string }[] = [
  {
    platform: 'pointer',
    title: 'Pointer',
    note: 'The admin, the web client and the desktop app with a mouse: 36 and 30, text at 14 and 13.',
  },
  {
    platform: 'touch',
    title: 'Touch',
    note: 'The phone and the web on a coarse pointer: the same drawn sizes, 16px text, and an invisible 44 hit area around each control.',
  },
  {
    platform: 'tv',
    title: 'TV',
    note: 'The spec 1.75 times larger in screen units (cqw), here in a frame as wide as the page.',
  },
]

export const Platforms: Story = {
  render: () => (
    <Page
      title="Controls"
      lead="Every control on the one spec, at md and sm, for each platform's rule. Controls in a row share one height, one corner and one text size."
      doc="docs/design-language/controls.md"
    >
      {platforms.map((p) => (
        <Section key={p.platform} title={p.title} note={p.note}>
          {/* the TV's units are a share of its frame's width */}
          <div className="[container-type:inline-size]">
            <PlatformScope platform={p.platform}>
              <Controls name={p.title} />
            </PlatformScope>
          </div>
        </Section>
      ))}
    </Page>
  ),
}

export const Themes: Story = {
  render: () => (
    <Page
      title="Controls in every theme"
      lead="The same controls in each built-in theme. Fields' edges and the chosen segment, tab and chip reach 3:1 in every one (WCAG 1.4.11)."
      doc="docs/design-language/controls.md › Contrast"
    >
      {Object.values(builtInThemes).map((t) => (
        <Section key={t.id} title={t.name}>
          <div data-theme={t.id} className="rounded-lg bg-bg p-6 text-text">
            <Controls name={t.name} />
          </div>
        </Section>
      ))}
    </Page>
  ),
}

export const TitleCells: Story = {
  name: 'Title cells',
  render: () => (
    <div className="max-w-xl">
      <Table>
        <TableBody>
          <TableRow>
            <TitleCell title="Sintel" detail="Sintel.2010.2160p.WEB-DL" art="" />
          </TableRow>
          <TableRow>
            <TitleCell title="Low Tide Hours" detail="Aurora Fields" art="" aspect="square" />
          </TableRow>
        </TableBody>
      </Table>
    </div>
  ),
}

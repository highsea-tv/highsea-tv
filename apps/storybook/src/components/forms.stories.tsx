// SPDX-License-Identifier: AGPL-3.0-only
import {
  Checkbox,
  Field,
  Input,
  Kbd,
  RatingInput,
  SegmentedControl,
  Select,
  SelectGroup,
  SelectItem,
  SelectSeparator,
  Switch,
  Textarea,
} from '@highsea/ui-web'
import type { Meta, StoryObj } from '@storybook/react-vite'

const meta = {
  title: 'Components/Forms',
  component: Field,
  tags: ['autodocs'],
  args: { label: 'Server name', hint: 'Shown to everyone who connects.', children: null },
  argTypes: { children: { control: false } },
  decorators: [(Story) => <div className="max-w-sm">{Story()}</div>],
} satisfies Meta<typeof Field>

export default meta
type Story = StoryObj<typeof meta>

export const TextField: Story = {
  name: 'Field with input',
  render: (args) => (
    <Field {...args}>
      <Input defaultValue="Harbor" />
    </Field>
  ),
}

export const WithError: Story = {
  name: 'Field with an error',
  args: { label: 'Search', hint: undefined, error: 'Type at least two characters.' },
  render: (args) => (
    <Field {...args}>
      <Input icon="search" defaultValue="s" end={<Kbd>⌘K</Kbd>} />
    </Field>
  ),
}

export const Disabled: Story = {
  args: { label: 'API key', hint: 'Set by the server owner.' },
  render: (args) => (
    <Field {...args}>
      <Input disabled defaultValue="hs_live_••••••••••••" />
    </Field>
  ),
}

export const Multiline: Story = {
  args: { label: 'Announcement', hint: 'Markdown is supported.' },
  render: (args) => (
    <Field {...args}>
      <Textarea rows={4} placeholder="Tell everyone what's new…" />
    </Field>
  ),
}

export const SelectField: Story = {
  name: 'Select',
  args: { label: 'Quality profile', hint: undefined },
  render: (args) => (
    <Field {...args}>
      <Select defaultValue="hd">
        <SelectGroup label="Built in">
          <SelectItem value="sd">SD</SelectItem>
          <SelectItem value="hd">HD-1080p</SelectItem>
          <SelectItem value="uhd">Ultra-HD</SelectItem>
        </SelectGroup>
        <SelectSeparator />
        <SelectItem value="any">Any</SelectItem>
      </Select>
    </Field>
  ),
}

export const Toggles: Story = {
  render: () => (
    <div className="grid gap-4">
      <Field inline label="Start on boot" hint="Runs the server when this machine starts.">
        <Switch defaultChecked />
      </Field>
      <Field inline label="Seed after import">
        <Switch />
      </Field>
      <Field inline label="Monitored">
        <Checkbox defaultChecked />
      </Field>
      <Field inline label="Search on add">
        <Checkbox />
      </Field>
    </div>
  ),
}

export const Segmented: Story = {
  name: 'Segmented control',
  render: () => (
    <div className="grid justify-items-start gap-4">
      <SegmentedControl
        aria-label="View"
        defaultValue="grid"
        options={[
          { value: 'grid', label: 'Grid', icon: 'grid' },
          { value: 'list', label: 'List', icon: 'list' },
        ]}
      />
      <SegmentedControl
        size="sm"
        aria-label="Range"
        defaultValue="24h"
        options={[
          { value: '1h', label: '1h' },
          { value: '24h', label: '24h' },
          { value: '7d', label: '7d' },
          { value: '30d', label: '30d' },
        ]}
      />
    </div>
  ),
}

export const Rating: Story = {
  name: 'Rating input',
  render: () => (
    <div className="grid gap-2">
      <span className="text-ui text-text-2">Your rating</span>
      <RatingInput aria-label="Your rating" defaultValue={4} />
    </div>
  ),
}

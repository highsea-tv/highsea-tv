// SPDX-License-Identifier: AGPL-3.0-only
import { Button, buttonVariants, Kbd } from '@highsea/ui-web'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { iconControl } from '../controls.ts'

const meta = {
  title: 'Components/Button',
  component: Button,
  tags: ['autodocs'],
  args: { children: 'Add movie', variant: 'secondary', size: 'md' },
  argTypes: {
    variant: { control: 'inline-radio', options: Object.keys(buttonVariants) },
    size: { control: 'inline-radio', options: ['md', 'sm'] },
    icon: iconControl,
    iconEnd: iconControl,
  },
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

export const Playground: Story = {}

export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="primary" icon="add">
        Add movie
      </Button>
      <Button>Details</Button>
      <Button variant="ghost" iconEnd="chevron-right">
        More
      </Button>
      <Button variant="danger" icon="delete">
        Delete
      </Button>
    </div>
  ),
}

export const Sizes: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="primary">Medium</Button>
      <Button variant="primary" size="sm">
        Small
      </Button>
      <Button iconOnly icon="more" aria-label="More actions" />
      <Button size="sm" iconOnly icon="more" aria-label="More actions" />
    </div>
  ),
}

export const Loading: Story = { args: { loading: true, variant: 'primary', children: 'Saving' } }

export const Disabled: Story = { args: { disabled: true } }

export const AsLink: Story = {
  name: 'As a link',
  render: () => (
    <Button asChild>
      <a href="#settings">
        Settings <Kbd>,</Kbd>
      </a>
    </Button>
  ),
}

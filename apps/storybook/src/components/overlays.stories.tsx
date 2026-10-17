// SPDX-License-Identifier: AGPL-3.0-only
import {
  Button,
  ConfirmDialog,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
  Field,
  Input,
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SegmentedControl,
  Sheet,
  SheetContent,
  SheetTrigger,
  Switch,
  Tooltip,
} from '@highsea/ui-web'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { fn } from 'storybook/test'

const onConfirm = fn().mockName('onConfirm')

const meta = {
  title: 'Components/Overlays',
  parameters: {
    docs: {
      description: {
        component: 'Level 3 surfaces: they rise on spring.base and leave with a 140ms fade.',
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const DialogStory: Story = {
  name: 'Dialog',
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Rename server</Button>
      </DialogTrigger>
      <DialogContent
        title="Rename server"
        description="Everyone who connects sees this name."
        footer={
          <>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <DialogClose asChild>
              <Button variant="primary">Save</Button>
            </DialogClose>
          </>
        }
      >
        <Field label="Server name">
          <Input defaultValue="Harbor" />
        </Field>
      </DialogContent>
    </Dialog>
  ),
}

export const Confirm: Story = {
  name: 'Confirm (destructive)',
  render: function Render() {
    const [open, setOpen] = useState(false)
    return (
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        trigger={<Button variant="danger">Delete Sintel</Button>}
        title="Delete Sintel?"
        description="This deletes the file from disk. It can't be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={onConfirm}
      />
    )
  },
}

export const SheetStory: Story = {
  name: 'Sheet',
  render: () => (
    <div className="flex gap-2">
      {(['bottom', 'right', 'left'] as const).map((side) => (
        <Sheet key={side}>
          <SheetTrigger asChild>
            <Button>Open {side}</Button>
          </SheetTrigger>
          <SheetContent
            side={side}
            title="Filters"
            description="Narrow the library."
            footer={<Button variant="primary">Show 128 movies</Button>}
          >
            <div className="grid gap-4">
              <Field label="Only 4K">
                <Switch />
              </Field>
              <Field label="Unwatched">
                <Switch defaultChecked />
              </Field>
            </div>
          </SheetContent>
        </Sheet>
      ))}
    </div>
  ),
}

export const PopoverStory: Story = {
  name: 'Popover',
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button icon="filter">Filters</Button>
      </PopoverTrigger>
      <PopoverContent aria-label="Filters">
        <div className="grid gap-3">
          <p className="text-widget-title">Sort by</p>
          <SegmentedControl
            size="sm"
            aria-label="Sort by"
            defaultValue="added"
            options={[
              { value: 'added', label: 'Added' },
              { value: 'title', label: 'Title' },
              { value: 'year', label: 'Year' },
            ]}
          />
        </div>
      </PopoverContent>
    </Popover>
  ),
}

export const MenuStory: Story = {
  name: 'Menu',
  render: function Render() {
    const [monitored, setMonitored] = useState(true)
    return (
      <Menu>
        <MenuTrigger asChild>
          <Button iconOnly icon="more" aria-label="Sintel actions" />
        </MenuTrigger>
        <MenuContent>
          <MenuLabel>Sintel</MenuLabel>
          <MenuItem icon="search" shortcut="S">
            Search for a release
          </MenuItem>
          <MenuItem icon="refresh" shortcut="R">
            Refresh metadata
          </MenuItem>
          <MenuCheckboxItem checked={monitored} onCheckedChange={setMonitored}>
            Monitored
          </MenuCheckboxItem>
          <MenuSeparator />
          <MenuItem icon="delete" danger>
            Remove
          </MenuItem>
        </MenuContent>
      </Menu>
    )
  },
}

export const TooltipStory: Story = {
  name: 'Tooltip',
  render: () => (
    <div className="flex gap-2">
      <Tooltip content="Search" shortcut="/">
        <Button iconOnly icon="search" aria-label="Search" />
      </Tooltip>
      <Tooltip content="Pause all downloads" side="bottom">
        <Button iconOnly icon="pause" aria-label="Pause all" />
      </Tooltip>
    </div>
  ),
}

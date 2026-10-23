// SPDX-License-Identifier: AGPL-3.0-only
import { Banner, Button, toast } from '@highsea-tv/ui-web'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

const meta = { title: 'Components/Feedback' } satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Toasts: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Button
        onClick={() => toast({ title: 'Sintel queued', description: 'Searching 6 indexers.' })}
      >
        Neutral
      </Button>
      <Button
        onClick={() =>
          toast.success('Added Sintel', { description: 'Searching for a release now.' })
        }
      >
        Success
      </Button>
      <Button
        onClick={() =>
          toast.error('Grab failed', {
            description: 'The indexer timed out.',
            action: { label: 'Retry', onClick: () => toast.success('Retrying') },
          })
        }
      >
        Error with action
      </Button>
      <Button
        onClick={() =>
          toast({ title: 'Disk 90% full', tone: 'warning', description: '/data/media' })
        }
      >
        Warning
      </Button>
      <Button variant="ghost" onClick={() => toast.clear()}>
        Clear
      </Button>
    </div>
  ),
}

export const Banners: Story = {
  render: function Render() {
    const [shown, setShown] = useState(true)
    return (
      <div className="grid gap-4">
        {shown ? (
          <Banner
            title="Server maintenance tonight"
            onDismiss={() => setShown(false)}
            action={<a href="#status">Status page</a>}
          >
            Streams pause for about ten minutes after 2 am.
          </Banner>
        ) : (
          <Button className="justify-self-start" onClick={() => setShown(true)}>
            Show the banner again
          </Button>
        )}
        <Banner tone="info" title="A new catalog is available">
          12 indexers were updated.
        </Banner>
        <Banner tone="success" title="Backup complete" />
        <Banner tone="warning" variant="card" title="Disk almost full" onAcknowledge={() => {}}>
          /data/media has 18 GB left. New downloads pause at 10 GB.
        </Banner>
        <Banner tone="danger" variant="card" title="Indexer unreachable">
          Three searches failed in the last hour.
        </Banner>
      </div>
    )
  },
}

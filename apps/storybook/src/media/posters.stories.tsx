// SPDX-License-Identifier: AGPL-3.0-only

import { art, byId, titles } from '@highsea/fixtures'
import { Badge, Button, Poster, Rating } from '@highsea/ui-web'
import type { Meta, StoryObj } from '@storybook/react-vite'

const meta = {
  title: 'Media/Posters',
  parameters: { layout: 'fullscreen' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Posters: Story = {
  render: () => (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-6 p-8">
      <Poster
        title="Sintel"
        src={art(byId('sintel')).poster}
        href="#sintel"
        quality={['4K', 'HDR']}
      />
      <Poster
        title="Spring"
        src={art(byId('spring')).poster}
        href="#spring"
        showTitle
        caption="2019"
      />
      <Poster
        title="Cosmos Laundromat"
        src={art(byId('cosmos-laundromat')).poster}
        href="#cosmos"
        actions={<Button size="sm" iconOnly icon="play" aria-label="Play Cosmos Laundromat" />}
      />
      <Poster
        title="Tears of Steel"
        src={art(byId('tears-of-steel')).poster}
        href="#tears"
        showTitle
        caption="2012"
        status={
          <Badge overlay tone="warning">
            Upgrade wanted
          </Badge>
        }
      />
      <Poster title="Missing artwork" href="#missing" showTitle caption="Falls back to the title" />
      {/* art that fails to decode falls back to the title, as a 404 would */}
      <Poster title="Broken artwork" src="data:image/png;base64,AAAA" href="#broken" />
      <Poster title="Big Buck Bunny" src={art(byId('big-buck-bunny')).poster} aspect="book" />
    </div>
  ),
}

export const ContinueWatching: Story = {
  name: 'Wide tiles',
  render: () => (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-6 p-8">
      {titles.slice(0, 4).map((t, i) => (
        <Poster
          key={t.id}
          title={t.title}
          src={art(t).still}
          aspect="still"
          href={`#${t.id}`}
          progress={[18, 64, 92, 40][i]}
          showTitle
          caption={`${t.runtime} left`}
        />
      ))}
    </div>
  ),
}

export const Ratings: Story = {
  render: () => (
    <div className="grid gap-3 p-8">
      <Rating value={4.5} showValue />
      <Rating value={3} />
      <Rating value={2.5} size={20} showValue />
      <Rating value={8.1} max={10} showValue />
    </div>
  ),
}

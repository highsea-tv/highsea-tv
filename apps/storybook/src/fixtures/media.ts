// SPDX-License-Identifier: AGPL-3.0-only
// Sample library: Blender Studio's open movies (CC BY), the same titles the e2e tests use.
import { backdropArt, posterArt, stillArt } from './art.ts'

export type Title = {
  id: string
  title: string
  year: number
  runtime: string
  genre: string
  rating: number
  quality: string[]
  synopsis: string
}

export const titles: Title[] = [
  {
    id: 'sintel',
    title: 'Sintel',
    year: 2010,
    runtime: '15m',
    genre: 'Fantasy',
    rating: 4,
    quality: ['4K', 'HDR'],
    synopsis:
      'A lone traveler searches the frozen highlands for the young dragon she raised and lost.',
  },
  {
    id: 'spring',
    title: 'Spring',
    year: 2019,
    runtime: '8m',
    genre: 'Fantasy',
    rating: 4.5,
    quality: ['4K'],
    synopsis: 'A shepherd girl and her dog face ancient spirits to bring the season back.',
  },
  {
    id: 'cosmos-laundromat',
    title: 'Cosmos Laundromat',
    year: 2015,
    runtime: '12m',
    genre: 'Comedy',
    rating: 3.5,
    quality: ['1080p'],
    synopsis: 'On a desolate island, a suicidal sheep meets a salesman who offers him a lifetime.',
  },
  {
    id: 'tears-of-steel',
    title: 'Tears of Steel',
    year: 2012,
    runtime: '12m',
    genre: 'Science fiction',
    rating: 3,
    quality: ['4K'],
    synopsis: 'In a future Amsterdam, scientists try to save the world by replaying a breakup.',
  },
  {
    id: 'big-buck-bunny',
    title: 'Big Buck Bunny',
    year: 2008,
    runtime: '10m',
    genre: 'Comedy',
    rating: 4,
    quality: ['1080p'],
    synopsis: 'A gentle giant rabbit takes careful revenge on three bullying rodents.',
  },
  {
    id: 'agent-327',
    title: 'Agent 327',
    year: 2017,
    runtime: '4m',
    genre: 'Action',
    rating: 3.5,
    quality: ['4K'],
    synopsis: 'A secret agent goes undercover in a barbershop that hides a secret laboratory.',
  },
  {
    id: 'sprite-fright',
    title: 'Sprite Fright',
    year: 2021,
    runtime: '10m',
    genre: 'Horror comedy',
    rating: 4,
    quality: ['4K', 'HDR'],
    synopsis: 'Rowdy teenagers on a forest trip meet the mushroom folk who live there.',
  },
  {
    id: 'charge',
    title: 'Charge',
    year: 2022,
    runtime: '4m',
    genre: 'Action',
    rating: 3.5,
    quality: ['4K'],
    synopsis: 'In an energy-starved future, an old man guards his power plant from a thief.',
  },
  {
    id: 'elephants-dream',
    title: 'Elephants Dream',
    year: 2006,
    runtime: '11m',
    genre: 'Science fiction',
    rating: 3,
    quality: ['1080p'],
    synopsis: 'Two men explore an endless machine that one of them believes he controls.',
  },
  {
    id: 'wing-it',
    title: 'Wing It!',
    year: 2023,
    runtime: '4m',
    genre: 'Comedy',
    rating: 4,
    quality: ['4K'],
    synopsis: 'A cat and a dog build an aeroplane in a barn, with predictable results.',
  },
]

export const art = (t: Title) => ({
  poster: posterArt(t.title),
  still: stillArt(t.title),
  backdrop: backdropArt(t.title),
})

export const byId = (id: string) => titles.find((t) => t.id === id) as Title

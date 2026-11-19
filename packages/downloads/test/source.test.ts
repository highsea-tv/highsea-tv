// SPDX-License-Identifier: AGPL-3.0-only
// A download's source (HT-100): web seeds sending, their hosts and their share of the rate.
import { describe, expect, test } from 'bun:test'
import { webSeedHost, webSeedSource } from '../src/service.ts'

const seed = (url: string, downRate: number, sending: boolean) => ({
  url,
  status: 'working' as const,
  message: null,
  downRate,
  sending,
})

describe('webSeedSource', () => {
  test('counts the seeds sending, names their hosts once, and splits the rate', () => {
    expect(
      webSeedSource({
        downRate: 5_000_000,
        webSeeds: [
          seed('https://archive.org/download/Sintel/', 3_000_000, true),
          seed('https://www.archive.org/download/Sintel/', 1_000_000, true),
          seed('https://mirror.example.net/pub/', 0, false),
        ],
      }),
    ).toEqual({ connected: 2, total: 3, hosts: ['archive.org'], downRate: 4_000_000 })
  })

  test('none: nothing sending, no hosts, no share of the rate', () => {
    expect(webSeedSource({ downRate: 800_000, webSeeds: [] })).toEqual({
      connected: 0,
      total: 0,
      hosts: [],
      downRate: 0,
    })
  })

  test('the seeds’ share is never more than the torrent’s rate', () => {
    const s = webSeedSource({
      downRate: 1_000,
      webSeeds: [seed('https://archive.org/download/x/', 2_000, true)],
    })
    expect(s.downRate).toBe(1_000)
  })
})

describe('webSeedHost', () => {
  test('the host alone, without www', () => {
    expect(webSeedHost('https://archive.org/download/Sintel/')).toBe('archive.org')
    expect(webSeedHost('http://www.example.com:8080/a')).toBe('example.com')
    expect(webSeedHost('not a url')).toBe('not a url')
  })
})

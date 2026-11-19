// SPDX-License-Identifier: AGPL-3.0-only
// A9 Indexers in the prototype, with the catalog's upkeep drafted over the mock for the owner's
// review (indexer-catalog-upkeep.md, part C; HT-95): when each definition was last checked
// working, Beta, Broken and Retired, in the Installed table, the catalog's cards and the Edit
// dialog; and Report a problem in a catalog indexer's More menu. Each screen is checked with axe.
import './dom.ts'
import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { createMock } from '@highsea-tv/mock/client'
import { act, cleanup, fireEvent, render, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { memoryLocation } from 'wouter/memory-location'
import { defaultState } from '../src/proto/state.ts'
import { violations } from './check.ts'

// after dom.ts has set React Native up for the admin's shared screens
const { ScreenApp } = await import('../src/screen/screen.tsx')
const { Linking } = await import('react-native')

afterEach(() => cleanup())

const page = () => within(document.body)

const settle = () =>
  act(async () => {
    for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0))
  })

/** Ends the native Modal's fade, which happy-dom never runs (packages/admin/test/modal.ts). */
function shown() {
  for (const content of document.querySelectorAll('[aria-modal]'))
    for (let el = content.parentElement; el && el !== document.body; el = el.parentElement) {
      const target = el
      act(() => {
        fireEvent.animationEnd(target)
      })
    }
}

async function open(path: string) {
  const location = memoryLocation({ path, record: true })
  const state = { ...defaultState, data: 'populated' as const, time: 'pause' as const }
  await act(async () => {
    render(<ScreenApp mock={createMock()} state={state} hook={location.hook} latency={0} />)
  })
  await settle()
  return userEvent.setup()
}

describe('A9 with the catalog’s upkeep (drafted)', () => {
  test('Installed: Broken and Beta by the name, the check and the note under the health', async () => {
    await open('/admin/indexers')
    const keel = within(page().getByRole('row', { name: /Keel/ }))
    expect(keel.getByText('Broken')).toBeTruthy()
    expect(
      keel.getByText(
        /^Broken since .+\. The site changed how it answers searches\. A fix is being worked on\.$/,
      ),
    ).toBeTruthy()
    const anchorage = within(page().getByRole('row', { name: /Anchorage/ }))
    expect(anchorage.getByText('Beta')).toBeTruthy()
    expect(anchorage.getByText(/^Checked working on /)).toBeTruthy()
    const driftnet = within(page().getByRole('row', { name: /Driftnet/ }))
    expect(driftnet.getByText(/^Last checked working on /)).toBeTruthy()
    // private definitions aren't checked (the plan's part G): nothing is said
    const fathom = within(page().getByRole('row', { name: /Fathom/ }))
    expect(fathom.queryByText(/checked/i)).toBeNull()
    expect(await violations()).toEqual([])
  })

  test('Catalog: the cards say it, and the retired definition is gone', async () => {
    await open('/admin/indexers/catalog')
    const card = (name: string) =>
      within(page().getByRole('heading', { name }).closest('[role="listitem"]') as HTMLElement)
    expect(card('Beacon').getByText('Beta')).toBeTruthy()
    expect(card('Beacon').getByText('Not checked yet.')).toBeTruthy()
    expect(card('Lighthouse').getByText(/^Checked working on /)).toBeTruthy()
    expect(card('Keel').getByText('Broken')).toBeTruthy()
    expect(page().queryByRole('heading', { name: 'Tidewater' })).toBeNull()
    expect(await violations()).toEqual([])
  })

  test('Edit says it; Report a problem opens the prefilled form', async () => {
    const opened = spyOn(Linking, 'openURL').mockResolvedValue(undefined)
    const user = await open('/admin/indexers')
    await user.click(page().getByRole('button', { name: 'More for Keel' }))
    await user.click(await page().findByRole('menuitem', { name: 'Report a problem' }))
    const url = new URL(opened.mock.calls[0]?.[0] as string)
    opened.mockRestore()
    expect(url.searchParams.get('template')).toBe('indexer-broken.yml')
    expect(url.searchParams.get('indexer')).toBe('keel')

    await user.click(page().getByRole('button', { name: 'More for Keel' }))
    await user.click(await page().findByRole('menuitem', { name: 'Edit' }))
    await settle()
    shown()
    const dialog = page().getByRole('dialog')
    expect(within(dialog).getByText(/^Definition v1\.4\.2\. Checked working on /)).toBeTruthy()
    expect(within(dialog).getByText(/^Broken since /)).toBeTruthy()
    expect(await violations(dialog)).toEqual([])
  })
})

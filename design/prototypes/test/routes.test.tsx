// SPDX-License-Identifier: AGPL-3.0-only
// Every route renders on its platform in every data state (and both roles), produces elements and
// passes axe. Contrast is left to the token tests: happy-dom has no layout to compute it.
// Every class rendered here, chrome included, must also be a real utility (./check.ts).
import './dom.ts'
import { afterEach, describe, expect, test } from 'bun:test'
import { act, cleanup, render } from '@testing-library/react'
import { memoryLocation } from 'wouter/memory-location'
import { Launcher } from '../src/chrome/launcher.tsx'
import { Toolbar } from '../src/chrome/toolbar.tsx'
import { createMock } from '../src/mock/client.ts'
import { type DataState, defaultState, type Platform, type Role } from '../src/proto/state.ts'
import { screenRoutes } from '../src/routes.tsx'
import { ScreenApp } from '../src/screen/screen.tsx'
import { classes, collect, unknownClasses, violations } from './check.ts'

afterEach(() => cleanup())

/** Lets pending mock calls (latency 0) resolve and the screen re-render. */
const settle = () =>
  act(async () => {
    for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0))
  })

const dataStates: DataState[] = ['populated', 'empty', 'loading', 'error']
const rolesFor = (p: Platform): Role[] => (p === 'admin' ? ['owner', 'member'] : ['owner'])

for (const [platform, routes] of Object.entries(screenRoutes) as [Platform, string[]][]) {
  describe(platform, () => {
    for (const path of routes)
      for (const role of rolesFor(platform))
        for (const data of dataStates)
          test(`${path} · ${data}${role === 'member' ? ' · member' : ''}`, async () => {
            const { hook } = memoryLocation({ path })
            const state = { ...defaultState, data, role, time: 'pause' as const }
            let container: HTMLElement | undefined
            await act(async () => {
              container = render(
                <ScreenApp mock={createMock()} state={state} hook={hook} latency={0} />,
              ).container
            })
            await settle()
            expect(container?.childElementCount).toBeGreaterThan(0)
            collect()
            // an acknowledge-required announcement opens over the clients' home: behind a modal
            // dialog the page is hidden, so the dialog is what's checked
            const modal = document.querySelector('[role="dialog"]') ?? undefined
            expect(await violations(modal)).toEqual([])
          })
  })
}

describe('chrome', () => {
  test('launcher', async () => {
    render(<Launcher onOpen={() => {}} />)
    collect()
    expect(await violations()).toEqual([])
  })

  test('toolbar', async () => {
    render(
      <Toolbar
        state={defaultState}
        set={() => {}}
        path="/admin"
        platform="admin"
        now={Date.now()}
        onNavigate={() => {}}
        onPlatform={() => {}}
      />,
    )
    collect()
    expect(await violations()).toEqual([])
  })
})

describe('stylesheet', () => {
  test('every class the screens render is a real utility', async () => {
    expect(classes.size).toBeGreaterThan(50)
    expect(await unknownClasses()).toEqual([])
  })
})

// SPDX-License-Identifier: AGPL-3.0-only
// Every route renders on its platform in every data state (and both roles), produces elements and
// passes axe. Contrast is left to the token tests: happy-dom has no layout to compute it.
// Every class rendered here, chrome included, must also be a real utility (./check.ts).
import './dom.ts'
import { afterEach, describe, expect, test } from 'bun:test'
import { createMock } from '@highsea-tv/mock/client'
import { act, cleanup, render } from '@testing-library/react'
import { memoryLocation } from 'wouter/memory-location'
import { heldByClient } from '../src/chrome/client.ts'
import {
  type DataState,
  defaultState,
  type Platform,
  type Role,
  stateFromParams,
} from '../src/proto/state.ts'
import { classes, collect, unknownClasses, violations } from './check.ts'

// the app after dom.ts has set React Native up for the admin's shared screens: a static import
// is linked before dom.ts runs
const { Launcher } = await import('../src/chrome/launcher.tsx')
const { Toolbar } = await import('../src/chrome/toolbar.tsx')
const { screenRoutes } = await import('../src/routes.tsx')
const { ScreenApp } = await import('../src/screen/screen.tsx')

afterEach(() => cleanup())

/** Lets pending mock calls (latency 0) resolve and the screen re-render. */
const settle = () =>
  act(async () => {
    for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0))
  })

const dataStates: DataState[] = ['populated', 'empty', 'loading', 'error']
const rolesFor = (p: Platform): Role[] => (p === 'admin' ? ['owner', 'admin', 'user'] : ['owner'])

for (const [platform, routes] of Object.entries(screenRoutes) as [Platform, string[]][]) {
  describe(platform, () => {
    for (const path of routes.filter((r) => !heldByClient(r)))
      for (const role of rolesFor(platform))
        for (const data of dataStates)
          test(`${path} · ${data}${role === 'owner' ? '' : ` · ${role}`}`, async () => {
            // a route may carry the toolbar's state after `?`, as `/web/downloads?app=desktop`
            const [route = path, query = ''] = path.split('?')
            const { hook } = memoryLocation({ path: route })
            const state = stateFromParams(new URLSearchParams(query), {
              ...defaultState,
              data,
              role,
              time: 'pause' as const,
            })
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
            // dialog the page is hidden, so the dialog is what's checked; with two open (a sheet in
            // the address, as /mobile/you/who), the one on top, which Radix leaves unhidden
            const modal =
              [...document.querySelectorAll('[role="dialog"]')].find(
                (d) => !d.closest('[aria-hidden="true"]'),
              ) ?? undefined
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

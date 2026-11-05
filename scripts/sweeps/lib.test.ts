// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from 'bun:test'
import { routeUrl, viewportFor } from './lib.ts'

// a route's platform is read before its query, so the TV's Home with `?launch=done` is the
// client's, as `/tv` is (design/prototypes/src/chrome/client.ts holds `/`)
test('a route with a query opens where the same route without one does', () => {
  expect(new URL(routeUrl('/tv?launch=done')).pathname).toBe(new URL(routeUrl('/tv')).pathname)
  expect(new URL(routeUrl('/tv?launch=done')).pathname).toBe('/web/')
  expect(viewportFor('/tv?launch=done', 1600)).toEqual(viewportFor('/tv', 1600))
})

// SPDX-License-Identifier: AGPL-3.0-only
// Discovery against the server's own responder, on loopback and an ephemeral port: no network.
import { afterEach, expect, test } from 'bun:test'
import {
  createDiscoveryResponder,
  DEFAULT_DISCOVERY_PORT,
  DISCOVERY_MESSAGE as SERVER_MESSAGE,
} from '@highsea/network'
import { DISCOVERY_MESSAGE, DISCOVERY_PORT, discover } from '../src/discovery.ts'

const info = {
  id: 'srv_1',
  name: 'Harbor',
  version: '0.1.0',
  localAddresses: ['http://127.0.0.1:3000'],
  publicUrl: null,
  setupComplete: true,
  auth: { local: true, oidc: null, passkeys: false },
}

const stops: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const s of stops.splice(0)) await s()
})

test('the client and the server speak the same protocol', () => {
  expect(DISCOVERY_MESSAGE).toBe(SERVER_MESSAGE)
  expect(DISCOVERY_PORT).toBe(DEFAULT_DISCOVERY_PORT)
})

test('finds a server and where it answered from', async () => {
  const responder = createDiscoveryResponder({ port: 0, host: '127.0.0.1', answer: () => info })
  await responder.start()
  stops.push(responder.stop)
  const found = await discover({
    address: '127.0.0.1',
    port: responder.port() as number,
    timeout: 300,
  })
  expect(found).toHaveLength(1)
  expect(found[0]).toMatchObject({ id: 'srv_1', name: 'Harbor', address: '127.0.0.1' })
})

test('ignores answers that aren’t a server’s public info', async () => {
  const responder = createDiscoveryResponder({
    port: 0,
    host: '127.0.0.1',
    answer: () => ({ hello: 'world' }),
  })
  await responder.start()
  stops.push(responder.stop)
  expect(
    await discover({ address: '127.0.0.1', port: responder.port() as number, timeout: 200 }),
  ).toEqual([])
})

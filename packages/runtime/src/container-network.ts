// SPDX-License-Identifier: AGPL-3.0-only
// Which network highsea's container is on, read once from what the container can see: setup's
// address (ADR 0020's 4.3c section) and Settings › VPN's highsea connects (ADR 0042's
// 2026-11-07 section) both ask here, so they give the same answer.
import { existsSync } from 'node:fs'
import { type NetworkInterfaceInfo, networkInterfaces } from 'node:os'

/**
 * `host` when the container shares the host's network, `bridge` when it has its own, and null
 * outside a container, where there's no compose file to change.
 */
export type ContainerNetwork = 'host' | 'bridge' | null

/**
 * The interfaces Docker makes on the host: `docker0`, the default bridge, and a bridge device for
 * each user-defined network, which the daemon adds itself
 * ([Bridge network driver](https://docs.docker.com/engine/network/drivers/bridge/)); it names
 * those `br-` and the network's id unless `com.docker.network.bridge.name` says otherwise, and
 * gives each container on one a `veth` pair whose host end stays on the host. A container sees
 * them only with host networking, where its network stack "isn't isolated from the Docker host"
 * and shares the host's networking namespace
 * ([Host network driver](https://docs.docker.com/engine/network/drivers/host/)); on a bridge it
 * sees only its own `lo` and `eth0` (`container_iface_prefix`, by default `eth`).
 */
export const DOCKER_INTERFACE = /^(docker\d+|br-[0-9a-f]+|veth)/

export type ContainerNetworkInput = {
  /**
   * The interfaces this process sees, keyed by name, as `os.networkInterfaces()` returns them
   * ([Node › os.networkInterfaces](https://nodejs.org/docs/latest-v24.x/api/os.html#osnetworkinterfaces)).
   */
  interfaces?: NodeJS.Dict<NetworkInterfaceInfo[]>
  /** Docker's marker file, as hardware.ts reads it (https://docs.docker.com/engine/containers/run/). */
  inContainer?: boolean
}

/** The container's network, from its interfaces. Tests pass both; the server reads its own. */
export function detectContainerNetwork({
  interfaces = networkInterfaces(),
  inContainer = existsSync('/.dockerenv'),
}: ContainerNetworkInput = {}): ContainerNetwork {
  if (!inContainer) return null
  return Object.keys(interfaces).some((n) => DOCKER_INTERFACE.test(n)) ? 'host' : 'bridge'
}

# 0020. LAN discovery on UDP 7368, plus mDNS

- **Status:** Accepted
- **Date:** 2026-10-19

## Context
Clients find servers on the local network ([connectivity.md](../product/connectivity.md)). The roadmap asks for a UDP broadcast responder plus mDNS (`_highsea._tcp`), and an ADR for the port. Jellyfin and Emby answer on 7359 (which IANA lists for another service) and Plex on 32410–32414.

## Decision
- The discovery responder listens on **UDP 7368**. The IANA registry lists 7366–7369 as unassigned (checked 2026-10-19). It's configurable with `HIGHSEA_DISCOVERY_PORT`.
- A client broadcasts `highsea:discover:1` to port 7368. A server answers to the sender with its public info as JSON: server id, name, version and addresses (the same as `GET /api/v1/system/info/public`).
- The server also advertises `_highsea._tcp` over mDNS (UDP 5353) with the HTTP port and the server id in the TXT record.
- In Docker, discovery needs host networking, or UDP 7368 published (and mDNS works only with host networking).

## Consequences
- The compose example and the install guides list UDP 7368 next to 3000 and 6881.
- Clients try mDNS first where the platform allows it, and fall back to the broadcast.

## 2026-10-28: publishing through the host's avahi (checkpoint 4.3c)

Checking TrueNAS SCALE 25.10.7 showed highsea's own responder (@homebridge/ciao) can't bind UDP 5353 there, even with host networking. TrueNAS's avahi-daemon is set to `disallow-other-stacks=yes`, which "if set to yes no other process is allowed to bind to UDP port 5353" ([avahi-daemon.conf(5)](https://manpages.debian.org/trixie/avahi-daemon/avahi-daemon.conf.5.en.html)). ciao logged its bind errors and highsea then claimed to be advertising. Unraid 7.3.4 and DSM 7 run avahi too, and their templates use a bridge, where mDNS never reached the network.

So highsea publishes through the host's avahi when it can (`chooseResponder` in `packages/network/src/mdns.ts`):

- **When the container has the host's system bus** (`/run/dbus/system_bus_socket`, the D-Bus specification's well-known system bus address with `/var/run` as `/run`), highsea runs [avahi-publish(1)](https://manpages.debian.org/trixie/avahi-utils/avahi-publish.1.en.html) from `avahi-utils`, now in the image (LGPL-2.1+, run as a separate program). It publishes `_highsea._tcp` with the same TXT record and stays running while the service is registered; stopping it withdraws the service. avahi answers for the host's own addresses, so it works from a bridge too, with the container's port (the templates publish it unchanged). One responder per host is what [RFC 6762 § 15](https://www.rfc-editor.org/rfc/rfc6762#section-15) recommends. Talking to avahi over D-Bus needs no extra rights: avahi's own bus policy (`avahi-dbus.conf`, as Unraid 7.3.4 ships it) says "Allow anyone to invoke methods on Avahi server, except SetHostName".
- **When the bus is there but avahi doesn't publish** (no avahi-daemon running, which avahi-publish reports as "Daemon not running", or no answer in 10 seconds), highsea logs that once at info and falls back to its own responder, as below.
- **Without the bus,** highsea tries a shared bind of UDP 5353 (`SO_REUSEADDR`, as ciao binds) first. If that works, ciao advertises as before. If not, highsea logs one plain warning that another mDNS service holds the port, and apps find it by the broadcast.

The TrueNAS, Unraid and Synology templates and `compose.yaml` mount `/run/dbus` read only (`/run/dbus:/run/dbus:ro`). On a host without D-Bus, Docker makes an empty folder and highsea answers itself. `compose.bridge.yaml` has the line commented out, since Docker Desktop has no host bus to give. Connecting to a socket on a read-only mount works, since a read-only mount stops writes to files, not connections. Home Assistant's container install mounts the same folder the same way for its Bluetooth integration ([Home Assistant, Linux installation](https://www.home-assistant.io/installation/linux#docker-compose)).

Checked on 2026-10-28 with the templates as they are. On TrueNAS 25.10.7 (host networking) and on Unraid 7.3.4 and DSM 7.4.1 on the DS1520+ (both bridged), highsea logged "advertising over mDNS" with `via: avahi`, and each host's `avahi-browse` resolved `_highsea._tcp` at its own name and port 3000, with the TXT record. From this Mac, `dns-sd -L` resolved the DS1520+'s record at `highseatv.local.:3000`. `avahi-publish` ran as highsea's user (568, 99 and 1026), and on the DS1520+ the record was withdrawn when the container stopped. One limit is left: on a bridge, avahi advertises the container's port, so an owner who publishes 3000 on another host port has a record with the wrong port. Apps then fall back to the broadcast or the address, as before.

## 2026-10-28: the address apps are told, and the router's forwarding (checkpoint 4.3c)

**The advertised address.** Discovery's answer and `GET /system/info/public` list `localAddresses`, the server's own interfaces. In a bridge network those are the container's addresses, which nothing on the home network can reach. Setup's Review now has an **Address on your network** line (install-simplicity B):

- **Detected:** `HIGHSEA_PUBLISHED_URL` first, as Jellyfin's `JELLYFIN_PublishedServerUrl` overrides the address it advertises ([Jellyfin: networking](https://jellyfin.org/docs/general/post-install/networking/)). Otherwise, the private IPv4 address the host has, when highsea can see the host's interfaces: outside a container, or inside one with host networking, which shows Docker's own `docker0`, `br-…` and `veth…` interfaces. In a bridge network it's left empty, and setup offers the address the browser used (`location.host`), which reached the server, so it's the best guess.
- **Kept:** in its own setting (`address`), as `host:port`. `HIGHSEA_PUBLISHED_URL`, or the setting as `http://host:port`, goes first in `localAddresses`, so apps try it before the interfaces.
- Settings › Network doesn't show it yet. The variable changes it after setup.

**The router's forwarding.** Remote access by a forwarded port (`remoteAccess: 'port-forward'` with highsea's own HTTPS) asks the router to forward the HTTPS port, once the owner has chosen it in setup or Settings › Network (install-simplicity's answer 10). It uses the torrent engine's mapper, NAT-PMP first ([RFC 6886](https://www.rfc-editor.org/rfc/rfc6886)) and then UPnP IGD, for TCP only through its new `protocols` option, and it's let go when the choice changes or the server stops. System › Health says whether the router forwarded the port, through which protocol, or that it didn't, with how to forward TCP to the server by hand. Both need host networking. In a bridge, the router sees the bridge's NAT, so a mapping there fails and Health says so.

## 2026-10-29: discovery from the desktop app (checkpoint 4.4a)

The desktop app looks both ways at once, from Rust ([ADR 0058](0058-desktop-app.md)): the broadcast to port 7368, and mDNS `_highsea._tcp` through [mdns-sd](https://docs.rs/mdns-sd/0.21.5/), whose TXT record's server id tells answers for the same server apart.

On macOS 15 and later the system asks the person before an app may use the local network ([Apple TN3179](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy)). The app's `Info.plist` gives the reason (`NSLocalNetworkUsageDescription`) and declares `_highsea._tcp` (`NSBonjourServices`). The first search sets off the prompt, and C1 says what it's waiting for. While the person hasn't allowed it, sends fail with `EHOSTUNREACH`, which C1 shows as the refused state with the way to System Settings, and adding a server by address still works.

## 2026-10-29: discovery from the phone (checkpoint 4.5a)

The phone app browses for `_highsea._tcp` with Network framework's `NWBrowser`, in a local Expo module (`apps/mobile/modules/discovery`). It reads the server's id from the TXT record, and resolves each result to an address with an `NWConnection`, then asks that address for the server's public info ([Apple › NWBrowser](https://developer.apple.com/documentation/network/nwbrowser)). iOS asks the person before an app may browse. The app declares `NSLocalNetworkUsageDescription` and `NSBonjourServices`, and reads a refusal from the browser's `PolicyDenied` error ([Apple TN3179](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy)). UDP 7368's broadcast isn't used from the phone: Bonjour is what iOS documents ([ADR 0059](0059-native-apps.md)).

## 2026-10-29: discovery from the TV (checkpoint 4.5b)

The TV app browses for `_highsea._tcp` with the phone's module, now in `@highsea-tv/native` (`packages/native/ios`). tvOS doesn't apply local network privacy, so there's no prompt and no `PolicyDenied` to explain ([Apple TN3179](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy)). When exactly one server answers, the TV goes on to sign in to it by itself. Found while building, on the phone too: a resolved IPv4 address kept its interface zone (`192.168.86.77%en1`), which no URL takes, so the module drops the zone from IPv4 addresses ([ADR 0059](0059-native-apps.md)).

## 2026-11-06: the Docker Desktop setup in the guide rather than a file (one-compose-file.md, part A)

`compose.bridge.yaml` is removed (ADR 0057's section of this date). Docker Desktop's setup, published ports with UDP 7368 for the apps' broadcast and no `/run/dbus`, is written in one place: the Docker guide's macOS and Windows tab (`apps/docs/content/install/docker.mdx`). What this ADR says of discovery there stands: the broadcast reaches the container through the published port, and mDNS needs the host's network or its D-Bus. Docker Desktop's own host networking stays out, since Docker documents it as an opt-in setting that reaches the container from the computer itself rather than from the network ([Host network driver › Docker Desktop](https://docs.docker.com/engine/network/drivers/host/#docker-desktop)).

## 2026-11-19: discovery off host networking (HT-90)

The root `compose.yaml` and get.highsea.tv's installer leave host networking for the built-in VPN (ADR 0042's section of this date). The owner's requirement: apps on the LAN must still find the server on every install type. What each method needs:

- **The broadcast on UDP 7368** (the desktop app): the published port carries it. Docker forwards a published UDP port to the container ([Port publishing and mapping](https://docs.docker.com/engine/network/port-publishing/)), as on Docker Desktop and the Synology package since 2026-10-29. The responder answers the sender's address, which on a bridge arrives translated, and the reply returns through the same mapping.
- **mDNS** (`_highsea._tcp`, the only way the iPhone and Apple TV look, ADR 0059): multicast doesn't leave a bridge network. highsea publishes through the host's avahi over `/run/dbus`, as this ADR's 2026-10-28 section decided, proven bridged on the DS1520+ and Unraid. On a host without avahi, the record would never reach the LAN.

So, on the owner's choice of 2026-11-19 (the easiest to set up, and zero-configuration):

- **The installer makes sure avahi runs.** Where it doesn't, it installs it from the distribution's own package (`avahi-daemon` with apt, `avahi` with dnf, zypper, apk and pacman) and enables it with systemd or OpenRC. It asks nothing an unattended run would wait on:
  - sudo only where it needs no password or someone is at a terminal;
  - each package manager's non-interactive flags.

  If it can't install it (an unknown package manager, no root, or a failed install), the install still finishes. It says the iPhone and Apple TV apps won't find the server by themselves and to add it by address, and repeats that with the address at the end. `--no-avahi` skips the step. avahi is the system's own mDNS responder on Debian, Ubuntu, Fedora and Arch ([Arch Wiki › Avahi](https://wiki.archlinux.org/title/Avahi)).
- **`compose.yaml` keeps the `/run/dbus` line.** The Docker guide says the host needs avahi and how to add it, and the built-in VPN's compose lines remind a hand-written install to keep it.
- **The NAS templates are unchanged for discovery.** Synology, Unraid, CasaOS and Umbrel were already on a bridge with the host's bus or their own. TrueNAS moves to a bridge with its `/run/dbus` line, TrueNAS's own avahi.
- **The advertised address.** Off host networking, setup offers the address the browser opened, as on a bridge before. `HIGHSEA_PUBLISHED_URL` overrides it.

Consequences: NAT-PMP and UPnP router forwarding from inside the container's network don't reach the router, so the Docker guide asks the owner to forward 6881 for incoming peers. With the built-in VPN connected, the provider's forwarded port takes its place. What was proven: the installer's avahi step, against stand-in commands in `apps/docs/test/install.test.ts`. What wasn't: the iPhone finding a bridged server on a plain Linux host and on the DS1520+ after the update. Both are on HT-90's NAS checklist.

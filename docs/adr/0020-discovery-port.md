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

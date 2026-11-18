# 0026. Plain HTTP always, built-in TLS beside it

- **Status:** Accepted
- **Date:** 2026-10-19

## Context
highsea is reached three ways (roadmap › Connectivity):
- on the LAN, by apps that find it through discovery (ADR 0020);
- through a reverse proxy that terminates TLS;
- directly, through a forwarded port.

TVs and phones on the LAN reach the server by IP address, where no publicly trusted certificate exists. Remote access needs HTTPS: passwords would otherwise cross the internet in the clear, and passkeys need a secure context (ADR 0024).

## Decision
- **Plain HTTP stays on**, on the main port, for the LAN and the apps.
- **Built-in TLS is an option.** When on, an HTTPS listener joins the HTTP one on its own port (8443 by default), with the same handler.
  - It serves a certificate the owner provides: `/config/tls/cert.pem` (the full chain) and `/config/tls/key.pem`, as Node's `tls.createSecureContext` takes them.
  - Getting certificates automatically (ACME) comes later. Until then, `certbot`, `tailscale cert` or a reverse proxy provide them.
  - **Problems:** a missing or mismatched certificate leaves HTTPS off. It shows on the server's health card.
  - **Changes:** turning TLS on or off takes a restart, and the network settings' API description says so. Listeners aren't swapped while connections are open.
- **The external URL** is the address people use from outside. It is:
  - the OIDC redirect URI;
  - the passkey relying party;
  - what invite and reset links point to.

  The health check warns when it isn't HTTPS.
- **Remote access is one of three choices**, set in setup and Settings › Network:
  - local only;
  - a reverse proxy, which trusts the private ranges and reads proxy headers;
  - a forwarded port, which turns built-in TLS on.
- **Discovery.** UDP discovery and mDNS (ADR 0020) stay on unless the owner turns discovery off.

## Consequences
- A LAN client never meets a certificate warning, and a remote one never meets plain HTTP, as long as the owner sets remote access up as setup suggests.
- Without host networking, Docker must publish both ports. `compose.yaml` lists both.

## 2026-11-17: two supported ways to reach highsea, and no VPN, tunnel or relay (the owner's decision, Phase 5's A2)

The owner decided on 2026-11-17, during A1's real use ([phase-5-real-use.md](../plans/phase-5-real-use.md), the owner's changes 3), how highsea is reached. It replaces Tailscale on the NAS, the plan's answer 4.

- **Two supported ways only:**
  - on the local network, by discovery or the server's address (ADR 0020), over plain HTTP as above;
  - at an address the owner controls: their own domain or subdomain, through a reverse proxy that terminates TLS or through highsea's own certificate, both as decided above.
- **No VPN, tunnel or relay is documented, tested or assumed.** They still work, since highsea is an ordinary web server and the apps take any address, but they aren't supported: no guide describes one, no test covers one, and nothing in setup or the apps expects one. This ADR's mention of `tailscale cert` as a way to get a certificate stands only as that, one of several tools an owner may choose.
- **Why:** no third party sits in the path between a person and their server; the install and the guides are simpler; and highsea assumes nothing about an owner's network.
- **The natural follow-up is built-in ACME,** which the decision above left for later: with it, an owner with a domain and a forwarded port gets a certificate without a reverse proxy or another tool ([RFC 8555](https://www.rfc-editor.org/rfc/rfc8555)). It isn't built or scheduled here.
- **The one limit, to state in the guide when it's written:** an owner behind carrier-grade NAT has no public address to forward a port to ([RFC 6598](https://www.rfc-editor.org/rfc/rfc6598) describes the shared address space such networks use), so neither supported way reaches their server from outside. They need a tunnel of their own choosing, which works and isn't supported.
- **The owner's own test address** is `watch.highsea.tv`, through DSM's reverse proxy on the NAS.
- **Not changed:** the three choices in setup and Settings › Network (local only, a reverse proxy, a forwarded port) are these two ways already. No code changes with this section, and no public guide is written with it.

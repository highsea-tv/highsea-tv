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

## 2026-11-18: highsea notices a proxy, and keeps people on HTTPS behind one (HT-53)

From the owner's real use ([phase-5-real-use.md](../plans/phase-5-real-use.md), A1's findings log): reaching highsea at `watch.highsea.tv` through DSM's reverse proxy took setting Settings › Network by hand, and `http://watch.highsea.tv` didn't redirect. "Set for a proxy" below is what setup's reverse-proxy choice sets and Settings › Network shows: **TLS** is **My proxy handles it** and the forwarded headers are on (`behindProxy` in `packages/network/src/front-door.ts`). Both rules run before any handler (`apps/server/src/http.ts`), so they cover the API, the admin, the streams and the web app alike.

- **Noticing a proxy.** A request carrying `Forwarded` ([RFC 7239](https://www.rfc-editor.org/rfc/rfc7239)) or `X-Forwarded-Proto`/`X-Forwarded-Host`, for a name that isn't an address, `localhost` or an mDNS `.local` name ([RFC 6762](https://www.rfc-editor.org/rfc/rfc6762)), while highsea isn't set for a proxy, is a sighting. highsea keeps the last one (the name, whether it came over HTTPS, the address it came from) and System › Health offers, as a notice for the owner, Settings › Network set for that proxy: the name as the External URL and that address added to the trusted proxies. It can be dismissed for good.
  - **An offer, not automatic.** The zero-config rule says detect and decide in the background, but believing forwarded headers is this ADR's security boundary: anyone who reaches the port can send them ([OWASP's note](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html) on headers a client sets), and a server that trusted them on sight would take a forged address for its rate limits, audit log and `Secure` cookies, and a forged name for its links and passkeys. So highsea only notices; the owner confirms, and nothing changes until they save.
  - **Where it shows:** a Health row with **Set it up** and **Dismiss** for the owner, the owner's choice of 2026-11-18. Admins see the row without the buttons, since only the owner changes the network.
- **HTTPS only behind a proxy.** Set for a proxy with an `https://` External URL, and only for a request from a trusted proxy:
  - `X-Forwarded-Proto: http` is answered with a 308 to the External URL with the same path and query. A permanent redirect is what [RFC 6797 § 7.2](https://www.rfc-editor.org/rfc/rfc6797#section-7.2) asks of an HSTS host over plain HTTP; 308 keeps the method ([RFC 9110 § 15.4.9](https://www.rfc-editor.org/rfc/rfc9110#section-15.4.9)).
  - `X-Forwarded-Proto: https` for the External URL's name is answered with `Strict-Transport-Security: max-age=31536000`: a year, as the OWASP HTTP Strict Transport Security Cheat Sheet's examples have it; RFC 6797 § 6.1.1 leaves the length to the host. No `includeSubDomains`, since the owner's other names on the domain aren't highsea's, and no `preload`. Never over plain HTTP (RFC 6797 § 7.2).
  - A request without the header, such as the LAN's plain address straight to the port, is left alone, as this ADR's first rule wants.
- **The proxy's part** is in the guide (Settings › Network › Reverse proxy and TLS): on DSM, a second rule for port 80 so plain HTTP reaches highsea to be redirected, and DSM's own **Enable HSTS** left off, since the header DSM writes is `max-age=15768000; includeSubdomains; preload`.
- **Not changed:** the three choices, the trusted proxies' rules, and built-in TLS. HSTS isn't sent by built-in TLS: it's reached by an address and port the owner forwards, and that's this section's next step only if real use asks.


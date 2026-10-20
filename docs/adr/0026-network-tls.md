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

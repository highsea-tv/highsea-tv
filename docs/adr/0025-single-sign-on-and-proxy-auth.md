# 0025. Single sign-on by OIDC, and forward-auth proxy headers

- **Status:** Accepted
- **Date:** 2026-10-19

## Context
Self-hosters often run an identity provider (Authelia, Authentik, Keycloak) or a forward-auth proxy in front of their apps. The roadmap asks for both. Either one can hand an attacker every account if it's done loosely: an open redirect URI, a header anyone can send, or an account matched by a changeable email.

## Decision
- **OIDC** goes through `openid-client`, which is OpenID Certified.
  - **The flow:** the authorization code flow with PKCE (S256), `state` and `nonce`, as OAuth 2.0 Security Best Current Practice (RFC 9700 § 2.1.1) and the library's own examples do it.
  - **The redirect URI** is fixed to the external URL, never taken from the request.
  - **Accounts are matched by issuer and subject.** OIDC Core § 5.7: "the sub and iss Claims, used together, are the only Claims that an RP can rely upon as a stable identifier". Email and username aren't used, since a provider may let people change them.
  - **Unknown identities** are refused. To link one, a person follows their invite link and chooses "Join with {provider}". Single sign-on never creates accounts on its own.
  - **The client secret** is sealed with the server's key when saved. The API only says whether one is set.
- **Forward-auth proxy headers** are off by default. When on, the username comes from a header, `Remote-User` by default.
  - The header is believed only from a trusted proxy's address. Anyone else could send it themselves; Authelia's and Authentik's proxy docs both rest on this.
  - It maps to an existing account and never creates one.
- **Trusted proxies** are a list of addresses and ranges in Settings › Network, matched with Node's `net.BlockList`.
  - `X-Forwarded-For` and `X-Forwarded-Proto` are read only from those addresses (OWASP: headers a client sets can't be trusted).
  - The client is the rightmost `X-Forwarded-For` address that isn't a trusted proxy. Each proxy appends the address it received from, so anything further left can be forged.

## Consequences
- Setup's reverse-proxy choice trusts the private ranges by default, which covers a proxy on the same host or a Docker network. Settings › Network can narrow it.
- A provider that changes its issuer URL unlinks everyone. Each person links again through a new invite.

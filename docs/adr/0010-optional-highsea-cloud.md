# 0010. Optional highsea cloud

- **Status:** Accepted
- **Date:** 2026-10-16

## Context
Some features cannot be provided by a self-hosted server alone:
- remote access without port forwarding;
- "find my servers" across networks;
- mobile push notifications (APNs/FCM need a relay);
- metadata access without per-user API keys.

## Decision
Optional central services live in `cloud/`: accounts and server registry, relay (also self-hostable), push relay, metadata proxy and catalog CDN.
- The server's cloud connector is **off by default** and opt-in.
- Every cloud feature has a self-hosted fallback (own TMDB key, port-forward/reverse proxy/Tailscale, self-hosted relay, ntfy/web-push).
- Auth and the SDK support cloud-account sign-in alongside local users from the start.

## Consequences
- The cloud services are built after server milestone 1.

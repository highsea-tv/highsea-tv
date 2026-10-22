# @highsea-tv/sdk

The typed client for the API, for the admin and every client app; it needs only `fetch`.

- **`createClient({ baseUrl, token })`:** a method per contract route (`client.system.publicInfo()`), with errors as `ApiError`.
- **`client.events`:** server events over SSE, one shared connection that reconnects with Last-Event-ID.
- **`createServerConnection({ server })`:** probes a known server's LAN and remote addresses, prefers a LAN one that answers, and fails over when it stops ([connectivity.md](../../docs/product/connectivity.md)).
- **`@highsea-tv/sdk/react`:** `ClientProvider`, `useQuery(key, call, topics)` and `useAction(call)`, with the prototype's shapes ([ADR 0018](../../docs/adr/0018-admin-data-through-the-api.md)).

# @highsea-tv/runtime

The server's runtime ([ADR 0003](../../docs/adr/0003-server-runtime-custom-entry.md)): `loadConfig()` from the environment, then `boot()`, which creates the folders and the secret key, backs up and migrates the database, and starts the event bus, the job queue and a worker-thread pool. The runtime lives on `globalThis.__highsea`; Next-rendered code and API handlers read it with `getRuntime()`. `shutdown()` runs registered hooks last-first, drains jobs, closes workers, then the database.

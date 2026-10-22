# @highsea-tv/core

What every server package shares, framework-free: prefixed ids (`newId('job')`), `AppError` with the API's error codes, the `Clock` (and a fake one for tests), the structured logger with JSON and memory sinks, the in-process event bus with Last-Event-ID replay, and secret sealing (AES-256-GCM under `/config/secret.key`).

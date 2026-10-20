# 0028. Files the owner uploads: in the database, checked by their bytes

- **Status:** Accepted
- **Date:** 2026-10-20

## Context
Appearance lets staff upload two kinds of file:
- the server's mark, an SVG or PNG that every app shows beside the server's name, including before anyone signs in;
- sound packs, which are JSON recipes rather than audio (sound.md › Recipe format).

Both must survive a backup and restore, and neither may become a way to run script on the server's origin.

## Decision
- **Where they live:** in the database.
  - The mark is a row in `uploads`, with its bytes, its type and a SHA-256 of the bytes.
  - Sound packs are rows in `sound_packs`, holding the recipe as JSON.
  - Backups and restore then cover them with no extra step.
  - SQLite measures blobs up to about 100 KB as faster inside the database and larger ones as faster in files ([SQLite, Internal Versus External BLOB Storage](https://sqlite.org/intern-v-extern-blob.html)). A mark is small, and it's read rarely and cached, so its speed doesn't matter.
- **Uploads:**
  - **The mark** is sent as JSON with the file base64-encoded, at most 1 MB once decoded. A `bodyLimit` refuses a larger request before it's read ([Hono, Body Limit](https://hono.dev/docs/middleware/builtin/body-limit)).
  - **A sound pack** is its recipe as JSON, limited to 256 KB the same way.
  - Both routes are for staff, and both are written to the audit log.
- **Checks:** the type is read from the bytes, never taken from the client's word alone ([OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)).
  - **PNG:** by its signature and `IHDR` header; it must be square and at least 256 px.
  - **SVG:** by its root `<svg>` element in the SVG namespace, with a square `viewBox`. A DOCTYPE is refused: SVG needs none, and it's how entity-expansion attacks arrive ([OWASP XXE Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/XML_External_Entity_Prevention_Cheat_Sheet.html)).
  - **A sound pack:** by `checkSoundPack` from `@highsea/tokens`, the loudness and length rules the catalog's CI applies (sound.md › Sound packs). A failing pack is refused with the report's issues. The built-in pack, "Felt and wood", can't be deleted.
- **Serving the mark:** from `GET /api/v1/appearance/mark`, without signing in.
  - `X-Content-Type-Options: nosniff`, so a browser keeps to the stored type ([MDN](https://developer.mozilla.org/docs/Web/HTTP/Headers/X-Content-Type-Options)).
  - An SVG also gets `Content-Security-Policy: sandbox; default-src 'none'; style-src 'unsafe-inline'`. Shown in an `<img>`, an SVG can't run script, but someone opening its URL directly could; the sandbox stops that ([MDN, CSP `sandbox`](https://developer.mozilla.org/docs/Web/HTTP/Headers/Content-Security-Policy/sandbox)).
  - It has an `ETag` (the hash) and `Cache-Control: no-cache`, so clients revalidate and get `304 Not Modified` while it's unchanged ([RFC 9111 § 5.2.2.4](https://www.rfc-editor.org/rfc/rfc9111#section-5.2.2.4); [RFC 9110 § 13.1.2](https://www.rfc-editor.org/rfc/rfc9110#section-13.1.2)).
  - `Branding.mark` is the URL with the hash as a query string, so a new mark is a new URL.

## Consequences
- A backup is one database file, with the owner's files inside it.
- Native clients that can't draw SVG need a PNG rendering. That's a Phase 4 concern.
- Larger files, such as artwork the owner might upload later, would belong in files beside the database by SQLite's measurement. They'd need their own decision.

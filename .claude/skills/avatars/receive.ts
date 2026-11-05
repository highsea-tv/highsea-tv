// SPDX-License-Identifier: AGPL-3.0-only

// Takes images out of the built-in browser, which drops downloads and blocks a page's requests to
// localhost. Flow's page navigates the tab to http://127.0.0.1:8765/#<name>:<base64>; the page
// served here decodes the fragment and posts the bytes back to this origin, which writes them to
// the folder given. The fragment never reaches the server's log or leaves the machine.
//
//   bun .claude/skills/avatars/receive.ts <folder>

const dir = process.argv[2]
if (!dir) throw new Error('usage: bun receive.ts <folder>')

const page = `<!doctype html><meta charset="utf-8"><title>Received</title><body><p id="s">Saving…</p><script>
const [name, b64] = decodeURIComponent(location.hash.slice(1)).split(':')
const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
fetch('/save?name=' + encodeURIComponent(name), { method: 'POST', body: bytes })
  .then((r) => r.text())
  .then((t) => { document.getElementById('s').textContent = t; history.replaceState(null, '', '/') })
</script>`

Bun.serve({
  port: 8765,
  hostname: '127.0.0.1',
  async fetch(req) {
    const url = new URL(req.url)
    if (req.method === 'POST' && url.pathname === '/save') {
      const name = (url.searchParams.get('name') ?? 'file').replace(/[^\w.-]/g, '_')
      const bytes = await req.arrayBuffer()
      await Bun.write(`${dir}/${name}`, bytes)
      console.log(`saved ${name} (${bytes.byteLength} bytes)`)
      return new Response(`Saved ${name}, ${bytes.byteLength} bytes`)
    }
    return new Response(page, { headers: { 'content-type': 'text/html; charset=utf-8' } })
  },
})
console.log(`listening on http://127.0.0.1:8765, saving to ${dir}`)

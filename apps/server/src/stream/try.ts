// SPDX-License-Identifier: AGPL-3.0-only
// `/stream/try` (checkpoint 4.1's "Trying it at the review"): a plain page for the owner's review
// and for debugging, not a product screen, so it has no prototype, no design system and its copy
// isn't in the i18n catalogs. Served only with `HIGHSEA_PLAYBACK_TRY=1`. It signs in with the
// admin's cookie and uses the public API as an app would: the library, Play, progress, the picks
// and played, and this browser's reported profile from `MediaSource.isTypeSupported()`
// (https://developer.mozilla.org/en-US/docs/Web/API/MediaSource/isTypeSupported_static).
export const TRY_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>highsea playback test</title>
<style>
  :root { color-scheme: light dark; font: 15px/1.45 system-ui, sans-serif; }
  body { margin: 0 auto; max-width: 1100px; padding: 16px; }
  h1 { font-size: 1.2rem; margin: 0 0 4px; }
  p.note { margin: 0 0 16px; opacity: .7; }
  .grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; }
  @media (min-width: 900px) { .grid { grid-template-columns: 320px minmax(0, 1fr); } }
  ul#films { list-style: none; margin: 0; padding: 0; max-height: 70vh; overflow: auto; border: 1px solid #8884; border-radius: 6px; }
  ul#films li button { all: unset; box-sizing: border-box; cursor: pointer; display: block; width: 100%; padding: 6px 10px; }
  ul#films li button:hover, ul#films li button:focus-visible { background: #8882; }
  ul#films li button[aria-current] { background: #48f3; }
  video { width: 100%; background: #000; border-radius: 6px; max-height: 60vh; }
  .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 8px 0; }
  label { display: inline-flex; gap: 6px; align-items: center; }
  select, button { font: inherit; }
  pre { white-space: pre-wrap; word-break: break-word; background: #8881; padding: 8px; border-radius: 6px; font-size: 13px; }
  ol#reasons li.rejected { color: #c33; } ol#reasons li.warning { color: #b70; }
</style>
</head>
<body>
<h1>Playback test</h1>
<p class="note">For the 4.1 review: plays the library through the public API, with the decision and its reasons. Sign in to the admin first.</p>
<div class="row">
  <label>Device profile <select id="profile">
    <option value="web-chromium">Chrome</option>
    <option value="web-chromium-macos">Chrome on a Mac</option>
    <option value="web-firefox">Firefox</option>
    <option value="web-safari">Safari</option>
  </select></label>
  <button id="report" type="button">Report what this browser plays</button>
  <span id="reported"></span>
</div>
<div class="grid">
  <section aria-label="Films"><ul id="films"></ul></section>
  <section aria-label="Player">
    <video id="video" controls playsinline preload="metadata"></video>
    <div class="row">
      <label>Version <select id="version"></select></label>
      <label>Sound <select id="audio"></select></label>
      <label>Subtitles <select id="subtitle"></select></label>
      <button id="play" type="button" disabled>Play</button>
      <button id="stop" type="button" disabled>Stop</button>
      <button id="played" type="button" disabled>Mark watched</button>
      <button id="unplayed" type="button" disabled>Mark unwatched</button>
    </div>
    <p id="status" role="status"></p>
    <h2>Decision</h2>
    <p id="method"></p>
    <ol id="reasons"></ol>
    <h2>Saved</h2>
    <pre id="saved"></pre>
    <h2>Next up</h2>
    <p id="next"></p>
  </section>
</div>
<script>
const $ = (id) => document.getElementById(id)
const api = async (method, path, body) => {
  const res = await fetch('/api/v1' + path, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    keepalive: method === 'DELETE',
  })
  if (res.status === 204) return null
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error((json && json.error && json.error.message) || res.statusText)
  return json
}
const say = (text) => { $('status').textContent = text }

const ua = navigator.userAgent
$('profile').value = /Firefox\\//.test(ua) ? 'web-firefox'
  : /Safari\\//.test(ua) && !/Chrom(e|ium)\\//.test(ua) ? 'web-safari'
  : /Macintosh/.test(ua) ? 'web-chromium-macos' : 'web-chromium'

let film = null, detail = null, session = null, timer = null

async function loadFilms() {
  try {
    const page = await api('GET', '/items?playable=true&limit=200')
    $('films').replaceChildren(...page.items.map((m) => {
      const li = document.createElement('li')
      const b = document.createElement('button')
      b.type = 'button'
      b.textContent = m.title + (m.year ? ' (' + m.year + ')' : '') + (m.watched ? ' · watched' : m.progress ? ' · ' + Math.round(m.progress * 100) + '%' : '')
      b.onclick = () => pick(m.id, b)
      li.append(b)
      return li
    }))
    if (!page.items.length) say('Nothing in the library has a file yet.')
  } catch (e) { say(e.message) }
}

const option = (value, label) => { const o = document.createElement('option'); o.value = value; o.textContent = label; return o }

async function pick(id, button) {
  await stop()
  for (const b of document.querySelectorAll('#films button')) b.removeAttribute('aria-current')
  button.setAttribute('aria-current', 'true')
  film = id
  detail = await api('GET', '/items/movie/' + id)
  const prefs = await api('GET', '/items/movie/' + id + '/prefs')
  $('version').replaceChildren(...detail.versions.map((v) => option(v.id, v.label + (v.detail ? ' · ' + v.detail : ''))))
  if (prefs.versionId) $('version').value = prefs.versionId
  tracks(prefs)
  for (const b of ['play', 'played', 'unplayed']) $(b).disabled = false
  await showSaved()
}

function tracks(prefs) {
  const v = detail.versions.find((x) => x.id === $('version').value) || detail.versions[0]
  $('audio').replaceChildren(option('', 'File’s default'), ...(v ? v.audio : []).map((a) => option(a.id, a.label + ' · ' + a.codec)))
  $('subtitle').replaceChildren(option('', 'Off'), ...(v ? v.subtitles : []).map((s) => option(s.id, s.label + ' · ' + s.format)))
  if (prefs && prefs.audioId) $('audio').value = prefs.audioId
  if (prefs && prefs.subtitleId) $('subtitle').value = prefs.subtitleId
}

$('version').onchange = () => { tracks(null); savePrefs() }
$('audio').onchange = savePrefs
$('subtitle').onchange = savePrefs
async function savePrefs() {
  if (!film) return
  await api('PUT', '/items/movie/' + film + '/prefs', {
    versionId: $('version').value || null,
    audioId: $('audio').value || null,
    subtitleId: $('subtitle').value || null,
  })
  await showSaved()
}

async function showSaved() {
  if (!film) return
  const [d, prefs, next] = await Promise.all([
    api('GET', '/items/movie/' + film),
    api('GET', '/items/movie/' + film + '/prefs'),
    api('GET', '/items/movie/' + film + '/next'),
  ])
  $('saved').textContent = JSON.stringify({ position: d.item.position, progress: d.item.progress, watched: d.item.watched, prefs }, null, 2)
  $('next').textContent = next.item ? next.item.title + (next.item.year ? ' (' + next.item.year + ')' : '') : 'Nothing after this one.'
}

$('play').onclick = async () => {
  await stop()
  try {
    session = await api('POST', '/items/movie/' + film + '/play', {
      versionId: $('version').value || undefined,
      audioId: $('audio').value || null,
      subtitleId: $('subtitle').value || null,
      profile: $('profile').value,
    })
  } catch (e) { return say(e.message) }
  const d = session.decision
  $('method').textContent = d.method + (d.bitrate ? ' · ' + (d.bitrate / 1e6).toFixed(1) + ' Mbps' : '')
  $('reasons').replaceChildren(...d.reasons.map((r) => { const li = document.createElement('li'); li.className = r.kind; li.textContent = r.message + ' (' + r.code + ')'; return li }))
  $('stop').disabled = false
  if (!session.url) return say('This film needs HLS, which comes with 4.1b.')
  const video = $('video')
  video.src = session.url
  video.currentTime = session.start
  video.play().catch(() => {})
  timer = setInterval(report, 10_000)
  // 4.1a has no subtitle URL: WebVTT comes with 4.1b (the plan's Subtitles section)
  const subs = $('subtitle').value ? ' Subtitles come with 4.1b, so it plays without them.' : ''
  say('Playing from ' + Math.round(session.start) + ' s.' + subs)
}

async function report() {
  if (!session) return
  const video = $('video')
  try {
    const r = await api('POST', '/playback/sessions/' + session.id + '/progress', { position: video.currentTime, paused: video.paused })
    if (r.watched) { say('Watched: past 90%.'); }
    await showSaved()
  } catch (e) { say(e.message) }
}
for (const ev of ['pause', 'seeked', 'ended']) $('video').addEventListener(ev, report)

async function stop() {
  clearInterval(timer)
  if (!session) return
  const s = session
  session = null
  $('stop').disabled = true
  try { await api('DELETE', '/playback/sessions/' + s.id) } catch {}
  const video = $('video')
  video.removeAttribute('src')
  video.load()
  await showSaved()
}
$('stop').onclick = stop
addEventListener('pagehide', () => { if (session) api('DELETE', '/playback/sessions/' + session.id) })

$('played').onclick = async () => { await api('POST', '/items/movie/' + film + '/played'); await showSaved() }
$('unplayed').onclick = async () => { await api('DELETE', '/items/movie/' + film + '/played'); await showSaved() }

// what this browser says it decodes, by the codec strings RFC 6381 and the codecs' MP4 bindings use
$('report').onclick = async () => {
  if (!window.MediaSource) return say('This browser has no Media Source Extensions to ask.')
  const can = (type) => MediaSource.isTypeSupported(type)
  const video = []
  if (can('video/mp4; codecs="avc1.640028"')) video.push({ codec: 'h264', profiles: ['constrained baseline', 'baseline', 'main', 'high'], bitDepths: [8] })
  const hevc = [can('video/mp4; codecs="hvc1.1.6.L120.90"') && 'main', can('video/mp4; codecs="hvc1.2.4.L120.90"') && 'main 10'].filter(Boolean)
  if (hevc.length) video.push({ codec: 'hevc', profiles: hevc, bitDepths: hevc.includes('main 10') ? [8, 10] : [8], tag: $('profile').value === 'web-safari' ? 'hvc1' : undefined })
  if (can('video/webm; codecs="vp8"')) video.push({ codec: 'vp8', bitDepths: [8] })
  if (can('video/webm; codecs="vp09.00.10.08"')) video.push({ codec: 'vp9', profiles: can('video/webm; codecs="vp09.02.10.10"') ? ['profile 0', 'profile 2'] : ['profile 0'], bitDepths: can('video/webm; codecs="vp09.02.10.10"') ? [8, 10] : [8] })
  if (can('video/mp4; codecs="av01.0.05M.08"')) video.push({ codec: 'av1', profiles: ['main'], bitDepths: can('video/mp4; codecs="av01.0.05M.10"') ? [8, 10] : [8] })
  const audio = []
  if (can('audio/mp4; codecs="mp4a.40.2"')) audio.push({ codec: 'aac', maxChannels: 8 })
  if (can('audio/mpeg')) audio.push({ codec: 'mp3', maxChannels: 2 })
  if (can('audio/mp4; codecs="flac"')) audio.push({ codec: 'flac', maxChannels: 8 })
  if (can('audio/webm; codecs="opus"')) audio.push({ codec: 'opus', maxChannels: 8 })
  if (can('audio/webm; codecs="vorbis"')) audio.push({ codec: 'vorbis', maxChannels: 8 })
  if (can('audio/mp4; codecs="ac-3"')) audio.push({ codec: 'ac3', maxChannels: 6 })
  if (can('audio/mp4; codecs="ec-3"')) audio.push({ codec: 'eac3', maxChannels: 8 })
  try {
    await api('PUT', '/devices/current/profile', { base: $('profile').value, video, audio })
    $('reported').textContent = 'Reported: ' + video.map((v) => v.codec).join(', ') + ' · ' + audio.map((a) => a.codec).join(', ')
  } catch (e) { say(e.message) }
}

loadFilms()
</script>
</body>
</html>
`

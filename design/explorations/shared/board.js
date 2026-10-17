// SPDX-License-Identifier: AGPL-3.0-only
// highsea.tv — direction board engine.
// Renders every board from window.HS_DIRECTION. Tokens, marks, springs and sounds come from the
// direction. The TV, mobile and admin surfaces come from swappable layouts, so any direction's skin
// can be previewed on any direction's structure.

;(() => {
  const D = window.HS_DIRECTION
  const root = document.documentElement
  const css = (name) => getComputedStyle(root).getPropertyValue(name).trim()
  const SERVER = D.server ?? 'Harbor'
  const DIRECTION_COUNT = 4

  // ---------------------------------------------------------------- copy (plain, or a themed language pack)
  let themedCopy = Boolean(D.vocab)
  const t = (key, plain) => (themedCopy && D.vocab?.[key]) || plain

  // ---------------------------------------------------------------- icons (Lucide-style, 24px grid)
  const PATHS = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-6h4v6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    library:
      '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    users:
      '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
    play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
    megaphone: '<path d="m3 11 18-5v12L3 14z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
    gauge: '<path d="M12 14l3.5-3.5"/><path d="M3.5 17a9 9 0 1 1 17 0"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
    film: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4M3 12h18"/>',
    tv: '<rect x="2" y="5" width="20" height="13" rx="2"/><path d="M8 21h8"/>',
    activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12 19 5"/>',
    captions:
      '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M7 11h4M13 11h4M7 15h7M16 15h1"/>',
    sparkles:
      '<path d="M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    sliders:
      '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    server:
      '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    layout:
      '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="10" width="8" height="11" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/>',
    bell: '<path d="M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    volume: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/>',
    mute: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="m17 9.5 5 5M22 9.5l-5 5"/>',
    replay: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    anchor:
      '<path d="M12 22V8"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/><circle cx="12" cy="5" r="3"/>',
    map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/>',
    telescope:
      '<path d="m3.5 14.5 12-6.5 2 3.8-12 6.4z"/><path d="m15.5 8 3-1.6 2 3.8-3 1.6"/><path d="M10 15.5 7.5 21M12.5 14.2 15 21"/>',
    flag: '<path d="M5 21V4"/><path d="M5 4h13l-2.5 4.5L18 13H5"/>',
    scroll:
      '<path d="M8 3h11a2 2 0 0 1 2 2v1h-4"/><path d="M17 6v13a2 2 0 0 1-2 2H6a3 3 0 0 1-3-3v-1h10v1a3 3 0 0 0 3 3"/><path d="M8 3a2 2 0 0 0-2 2v12"/><path d="M10 8h4M10 12h4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  }
  const icon = (name) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${D.iconStroke ?? 1.75}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`

  // ---------------------------------------------------------------- content (Blender open movies, CC-licensed)
  const FILMS = [
    {
      t: 'Sintel',
      y: 2010,
      g: 'Fantasy',
      len: '15m',
      h: 14,
      m: 0,
      q: '4K HDR',
      syn: 'A lone young woman crosses a frozen wilderness in search of the baby dragon she once rescued.',
    },
    {
      t: 'Big Buck Bunny',
      y: 2008,
      g: 'Comedy',
      len: '10m',
      h: 96,
      m: 3,
      q: '4K',
      syn: 'A gentle giant rabbit reaches the end of his patience with three mischievous rodents.',
    },
    {
      t: 'Tears of Steel',
      y: 2012,
      g: 'Sci-Fi',
      len: '12m',
      h: 204,
      m: 2,
      q: '4K',
      syn: 'In a future Amsterdam, scientists attempt a last-ditch rescue of the world from rogue robots.',
    },
    {
      t: 'Elephants Dream',
      y: 2006,
      g: 'Surreal',
      len: '11m',
      h: 262,
      m: 2,
      q: '1080p',
      syn: 'Two travellers wander an endless mechanical world that may only exist in one of their minds.',
    },
    {
      t: 'Cosmos Laundromat',
      y: 2015,
      g: 'Drama',
      len: '12m',
      h: 318,
      m: 0,
      q: '4K',
      syn: 'On a desolate island, a suicidal sheep meets a salesman who offers him the gift of a lifetime.',
    },
    {
      t: 'Spring',
      y: 2019,
      g: 'Fantasy',
      len: '8m',
      h: 152,
      m: 3,
      q: '4K DV',
      syn: 'A shepherd girl and her dog face ancient spirits to keep the cycle of life turning.',
    },
    {
      t: 'Agent 327',
      y: 2017,
      g: 'Action',
      len: '4m',
      h: 38,
      m: 1,
      q: '4K',
      syn: 'Agent 327 goes undercover in a barbershop that is hiding a secret base.',
    },
    {
      t: 'Coffee Run',
      y: 2020,
      g: 'Comedy',
      len: '3m',
      h: 24,
      m: 1,
      q: '1080p',
      syn: 'Fueled by caffeine, a young woman races through the memories of her turbulent past.',
    },
    {
      t: 'Sprite Fright',
      y: 2021,
      g: 'Horror',
      len: '10m',
      h: 124,
      m: 3,
      q: '4K',
      syn: 'A group of teenagers on a forest trip discover the local sprites are far from friendly.',
    },
    {
      t: 'Charge',
      y: 2022,
      g: 'Action',
      len: '4m',
      h: 4,
      m: 0,
      q: '4K HDR',
      syn: 'In a dystopian future, an old man breaks into a power plant to steal the last of its energy.',
    },
    {
      t: 'Wing It!',
      y: 2023,
      g: 'Comedy',
      len: '4m',
      h: 222,
      m: 1,
      q: '4K',
      syn: 'A barnyard of farm animals tries very hard, and very badly, to build a rocket.',
    },
    {
      t: 'Caminandes',
      y: 2013,
      g: 'Comedy',
      len: '3m',
      h: 58,
      m: 2,
      q: '1080p',
      syn: 'Koro the llama finds a fence between him and the greener grass on the other side.',
    },
  ]
  const film = (title) => FILMS.find((f) => f.t === title)

  const MOTIFS = [
    // sun over horizon
    '<circle cx="100" cy="118" r="52" fill="currentColor" opacity=".95"/><path d="M0 188H200" stroke="currentColor" stroke-width="1.5" opacity=".45"/><path d="M0 204c40-7 60 7 100 0s60-7 100 0v96H0z" fill="#000" opacity=".32"/>',
    // waves
    '<g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity=".8"><path d="M-10 110c30-18 70 18 110 0s80-18 120 0"/><path d="M-10 140c30-18 70 18 110 0s80-18 120 0" opacity=".7"/><path d="M-10 170c30-18 70 18 110 0s80-18 120 0" opacity=".5"/><path d="M-10 200c30-18 70 18 110 0s80-18 120 0" opacity=".35"/><path d="M-10 230c30-18 70 18 110 0s80-18 120 0" opacity=".2"/></g>',
    // rings
    '<g fill="none" stroke="currentColor" stroke-width="2" opacity=".75"><circle cx="138" cy="96" r="22" fill="currentColor"/><circle cx="138" cy="96" r="48"/><circle cx="138" cy="96" r="80" opacity=".6"/><circle cx="138" cy="96" r="118" opacity=".35"/><circle cx="138" cy="96" r="160" opacity=".2"/></g>',
    // ridges + moon
    '<circle cx="146" cy="70" r="15" fill="currentColor"/><path d="M0 214 70 118l40 50 40-60 50 72v120H0z" fill="currentColor" opacity=".5"/><path d="M0 250l60-62 60 52 80-74v134H0z" fill="#000" opacity=".3"/>',
  ]

  const motif = (i) =>
    `<div class="poster-motif"><svg viewBox="0 0 200 300" preserveAspectRatio="xMidYMid slice">${MOTIFS[i % MOTIFS.length]}</svg></div>`

  const poster = (
    f,
    {
      badge = false,
      title = true,
      cls = '',
      sub = '',
      progress = null,
      focusable = false,
      initial = false,
    } = {},
  ) =>
    `<div class="poster art ${cls}" style="--h:${f.h}"${focusable ? ` data-f data-film="${FILMS.indexOf(f)}"` : ''}${initial ? ' data-initial' : ''}>
      <div class="poster-art"></div>${motif(f.m)}
      ${badge ? `<span class="poster-badge">${f.q}</span>` : ''}
      ${title ? `<div class="poster-title">${f.t}${sub ? `<small>${sub}</small>` : ''}</div>` : ''}
      ${progress != null ? `<div class="tv-progress"><i style="width:${progress}%"></i></div>` : ''}
    </div>`

  const lockup = (cls = '') => `<span class="lockup ${cls}">${D.mark}${D.wordmark}</span>`

  // ---------------------------------------------------------------- spring → CSS linear()
  function spring({ stiffness, damping, mass = 1 }) {
    const w0 = Math.sqrt(stiffness / mass)
    const zeta = damping / (2 * Math.sqrt(stiffness * mass))
    const x = (t) => {
      if (zeta < 1) {
        const wd = w0 * Math.sqrt(1 - zeta * zeta)
        return (
          1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t))
        )
      }
      return 1 - Math.exp(-w0 * t) * (1 + w0 * t)
    }
    let last = 0
    const dt = 1 / 240
    for (let t = 0; t < 4; t += dt) if (Math.abs(x(t) - 1) > 0.002) last = t
    const T = last + dt
    const N = 48
    const pts = []
    for (let i = 0; i <= N; i++) pts.push(Number(x((T * i) / N).toFixed(4)))
    pts[0] = 0
    pts[N] = 1
    return {
      easing: `linear(${pts.join(', ')})`,
      duration: Math.round(T * 1000),
      points: pts,
      zeta,
    }
  }

  const SPRING = spring(D.motion.spring)
  root.style.setProperty('--spring', SPRING.easing)
  root.style.setProperty('--spring-dur', `${SPRING.duration}ms`)
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches

  // ---------------------------------------------------------------- sound engine (Web Audio, synthesized)
  const store = {
    get(k) {
      try {
        return localStorage.getItem(k)
      } catch {
        return null
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, v)
      } catch {}
    },
  }

  const Sound = {
    ctx: null,
    enabled: store.get('hs-sound') === 'on',
    ensure() {
      if (!this.ctx) {
        const C = window.AudioContext || window.webkitAudioContext
        const c = new C()
        this.ctx = c
        this.master = c.createGain()
        this.master.gain.value = D.soundGain ?? 0.9
        const comp = c.createDynamicsCompressor()
        comp.threshold.value = -14
        comp.ratio.value = 3
        this.analyser = c.createAnalyser()
        this.analyser.fftSize = 2048
        this.master.connect(comp)
        comp.connect(this.analyser)
        this.analyser.connect(c.destination)
        if (D.echo) {
          this.echoIn = c.createGain()
          const delay = c.createDelay(1.5)
          delay.delayTime.value = D.echo.time
          const fb = c.createGain()
          fb.gain.value = D.echo.fb
          const lp = c.createBiquadFilter()
          lp.type = 'lowpass'
          lp.frequency.value = D.echo.lp ?? 3200
          const wet = c.createGain()
          wet.gain.value = D.echo.mix
          this.echoIn.connect(delay)
          delay.connect(lp)
          lp.connect(fb)
          fb.connect(delay)
          lp.connect(wet)
          wet.connect(this.master)
        }
      }
      if (this.ctx.state === 'suspended') this.ctx.resume()
    },
    noise() {
      if (this._noise) return this._noise
      const b = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate)
      const d = b.getChannelData(0)
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
      this._noise = b
      return b
    },
    play(name, force = false) {
      if (!this.enabled && !force) return
      const spec = D.sounds[name]
      if (!spec) return
      this.ensure()
      const t0 = this.ctx.currentTime + 0.01
      for (const n of spec) {
        if (n.p) {
          for (const [mult, gm, dm = 1] of n.p)
            this.voice(
              { ...n, f: n.f * mult, f2: n.f2 && n.f2 * mult, g: n.g * gm, d: n.d * dm },
              t0,
            )
        } else this.voice(n, t0)
      }
      Scope.kick()
    },
    voice(n, t0) {
      const c = this.ctx
      const start = t0 + (n.t ?? 0)
      const a = n.a ?? 0.003
      const dur = n.d ?? 0.1
      const g = c.createGain()
      g.gain.setValueAtTime(0.0001, start)
      g.gain.linearRampToValueAtTime(n.g ?? 0.1, start + a)
      g.gain.exponentialRampToValueAtTime(0.0001, start + a + dur)
      let src
      if (n.w === 'noise') {
        src = c.createBufferSource()
        src.buffer = this.noise()
      } else {
        src = c.createOscillator()
        src.type = n.w ?? 'sine'
        src.frequency.setValueAtTime(n.f, start)
        if (n.f2) src.frequency.exponentialRampToValueAtTime(n.f2, start + (n.glide ?? dur))
        if (n.det) src.detune.value = n.det
      }
      let node = src
      for (const [type, key] of [
        ['lowpass', 'lp'],
        ['highpass', 'hp'],
        ['bandpass', 'bp'],
      ]) {
        if (n[key]) {
          const f = c.createBiquadFilter()
          f.type = type
          f.frequency.value = n[key]
          f.Q.value = n.q ?? 0.7
          node.connect(f)
          node = f
        }
      }
      node.connect(g)
      g.connect(this.master)
      if (n.echo && this.echoIn) g.connect(this.echoIn)
      src.start(start)
      src.stop(start + a + dur + 0.05)
    },
  }

  // oscilloscope for the sound section
  const Scope = {
    canvas: null,
    until: 0,
    raf: 0,
    kick() {
      this.until = performance.now() + 1800
      if (!this.raf) this.raf = requestAnimationFrame(() => this.draw())
    },
    draw() {
      const cv = this.canvas
      if (!cv) {
        this.raf = 0
        return
      }
      const dpr = devicePixelRatio || 1
      const w = cv.clientWidth * dpr
      const h = cv.clientHeight * dpr
      cv.width = w
      cv.height = h
      const g = cv.getContext('2d')
      g.clearRect(0, 0, w, h)
      g.strokeStyle = css('--line')
      g.lineWidth = 1 * dpr
      g.beginPath()
      g.moveTo(0, h / 2)
      g.lineTo(w, h / 2)
      g.stroke()
      if (Sound.analyser) {
        const buf = new Float32Array(Sound.analyser.fftSize)
        Sound.analyser.getFloatTimeDomainData(buf)
        g.strokeStyle = css('--accent')
        g.lineWidth = 2 * dpr
        g.shadowColor = css('--accent')
        g.shadowBlur = 12 * dpr
        g.beginPath()
        for (let i = 0; i < buf.length; i++) {
          const x = (i / (buf.length - 1)) * w
          const y = h / 2 - buf[i] * h * 1.6
          i ? g.lineTo(x, y) : g.moveTo(x, y)
        }
        g.stroke()
      }
      this.raf = performance.now() < this.until ? requestAnimationFrame(() => this.draw()) : 0
    },
  }

  // ---------------------------------------------------------------- contrast (WCAG 2 ratio + APCA Lc)
  // Any CSS color (including color-mix and translucent fills) is resolved by painting it over its
  // backdrop on a 1×1 canvas, so the audit measures what is actually rendered.
  const probe = document.createElement('canvas')
  probe.width = 1
  probe.height = 1
  const pctx = probe.getContext('2d', { willReadFrequently: true })
  const paint = (...layers) => {
    pctx.globalCompositeOperation = 'source-over'
    pctx.fillStyle = '#000'
    pctx.fillRect(0, 0, 1, 1)
    for (const c of layers) {
      pctx.fillStyle = '#000'
      pctx.fillStyle = c
      pctx.fillRect(0, 0, 1, 1)
    }
    const d = pctx.getImageData(0, 0, 1, 1).data
    return [d[0], d[1], d[2]]
  }
  const srgbLum = ([r, g, b]) => {
    const [R, G, B] = [r, g, b].map((v) => {
      const c = v / 255
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * R + 0.7152 * G + 0.0722 * B
  }
  const wcag = (fg, bg) => {
    const [x, y] = [srgbLum(fg), srgbLum(bg)].sort((m, n) => n - m)
    return (x + 0.05) / (y + 0.05)
  }
  // APCA 0.0.98G-4g
  const apca = (fg, bg) => {
    const Y = ([r, g, b]) =>
      0.2126729 * (r / 255) ** 2.4 + 0.7151522 * (g / 255) ** 2.4 + 0.072175 * (b / 255) ** 2.4
    // biome-ignore lint/suspicious/noApproximativeNumericConstant: APCA's published soft-clamp exponent is exactly 1.414
    const clamp = (y) => (y > 0.022 ? y : y + (0.022 - y) ** 1.414)
    const tY = clamp(Y(fg))
    const bY = clamp(Y(bg))
    let c
    if (bY > tY) {
      c = (bY ** 0.56 - tY ** 0.57) * 1.14
      c = c < 0.1 ? 0 : c - 0.027
    } else {
      c = (bY ** 0.65 - tY ** 0.62) * 1.14
      c = c > -0.1 ? 0 : c + 0.027
    }
    return Math.abs(c * 100)
  }

  // ---------------------------------------------------------------- shared chrome
  const sec = (id, num, title, sub, body) => `
    <section class="sec" id="${id}">
      <header class="sec-head">
        <span class="sec-num">${num}</span>
        <h2 class="sec-title">${title}</h2>
        ${sub ? `<p class="sec-sub">${sub}</p>` : ''}
      </header>
      ${body}
    </section>`

  const soundLabel = () =>
    `${icon(Sound.enabled ? 'volume' : 'mute')}<span>UI sounds ${Sound.enabled ? 'on' : 'off'}</span>`
  const copyLabel = () =>
    `${icon('flag')}<span>${D.vocabName ?? 'Themed copy'} ${themedCopy ? 'on' : 'off'}</span>`

  const nav = `
    <nav class="board-nav" aria-label="Board">
      <a class="brand" href="index.html" title="All directions">${D.mark}<span>${D.name}</span></a>
      <div class="links">
        <a href="#identity">Identity</a><a href="#color">Color</a><a href="#type">Type</a>
        <a href="#tv">TV</a><a href="#mobile">Mobile</a><a href="#admin">Admin</a>
        <a href="#components">Components</a><a href="#motion">Motion</a><a href="#sound">Sound</a><a href="#notes">Notes</a>
      </div>
      <div class="board-toggles">
        ${D.vocab ? `<button class="pill-toggle copy-toggle" type="button" aria-pressed="${themedCopy}">${copyLabel()}</button>` : ''}
        <button class="pill-toggle sound-toggle" type="button" aria-pressed="${Sound.enabled}">${soundLabel()}</button>
      </div>
    </nav>`

  const cover = `
    <div class="cover">
      ${D.coverArt ?? ''}
      <span class="cover-mark">${D.mark}</span>
      <div class="cover-kicker label">${D.kicker ?? `Direction ${D.letter} of ${DIRECTION_COUNT}`}<br/>highsea.tv · Phase 1</div>
      <div>
        <div class="label">${D.letter} — ${D.name}</div>
        <h1>${D.headline}</h1>
        <p>${D.tagline}</p>
        <div class="chips">${D.keywords.map((k) => `<span class="chip">${k}</span>`).join('')}</div>
      </div>
    </div>`

  const identity = sec(
    'identity',
    '01',
    'Identity',
    D.identityNote,
    `<div class="identity">
      <div class="card id-lockup">${lockup()}</div>
      <div class="id-mono">
        <div class="on-accent">${lockup('sm mono')}</div>
        <div class="on-light">${lockup('sm mono')}</div>
      </div>
      <div class="card id-icons">
        <div class="icon-cap"><div class="app-icon" style="width:120px;height:120px">${D.mark}</div><span class="label">iOS / Android</span></div>
        <div class="icon-cap"><div class="app-icon" style="width:76px;height:76px">${D.mark}</div><span class="label">macOS / Windows</span></div>
        <div class="icon-cap"><div class="app-icon tile">${lockup()}</div><span class="label">tvOS / Android TV tile</span></div>
        <div class="icon-cap"><div class="favicons">
          <span style="width:32px;height:32px"><span style="width:24px;height:24px;display:block">${D.mark}</span></span>
          <span style="width:20px;height:20px"><span style="width:16px;height:16px;display:block">${D.mark}</span></span>
        </div><span class="label">Favicon 32 / 16</span></div>
      </div>
    </div>`,
  )

  // ---------------------------------------------------------------- 02 color + contrast audit
  const swatch = (name, token) =>
    `<div class="swatch" data-token="${token}"><div class="chip-color" style="background:var(${token})"></div><div class="meta"><span class="name">${name}</span><span class="hex">${token}</span></div></div>`

  // [label, sample markup, backdrop token, APCA target, usage]
  const AUDIT = [
    [
      'Primary text',
      '<span style="color:var(--text);font-weight:600">Continue watching</span>',
      '--s1',
      75,
      'Titles, values (Lc 90 preferred)',
    ],
    [
      'Secondary text',
      '<span style="color:var(--text-2)">Releases are scored, then grabbed.</span>',
      '--s1',
      70,
      'Body copy ≥ 14px',
    ],
    [
      'Tertiary text',
      '<span style="color:var(--text-3);font-size:12.5px">Added 2 hours ago</span>',
      '--s1',
      50,
      'Metadata ≥ 12px only',
    ],
    [
      'Accent text',
      '<span style="color:var(--accent-text);font-weight:600">Open board →</span>',
      '--bg',
      60,
      'Links, eyebrows ≥ 13px semibold',
    ],
    [
      'Primary button',
      `<button class="btn primary sm" tabindex="-1">${icon('plus')}Add movie</button>`,
      null,
      75,
      'Label on accent fill',
    ],
    [
      'Destructive button',
      `<button class="btn danger sm" tabindex="-1">${icon('trash')}Delete files</button>`,
      null,
      75,
      'Label on danger fill',
    ],
    [
      'Status badge',
      '<span class="badge success">Available</span>',
      '--s1',
      60,
      'Status labels, 12px semibold',
    ],
    [
      'Warning badge',
      '<span class="badge warning">Cutoff unmet</span>',
      '--s1',
      60,
      'Status labels, 12px semibold',
    ],
    [
      'Danger badge',
      '<span class="badge danger">Failed</span>',
      '--s1',
      60,
      'Status labels, 12px semibold',
    ],
  ]

  // optional accent candidates: a refinement board can compare several accents in one skin
  let accentId = D.accents?.some((a) => a.id === store.get(`hs-accent-${D.id}`))
    ? store.get(`hs-accent-${D.id}`)
    : D.accents?.[0].id
  const accentOf = () => D.accents.find((a) => a.id === accentId)
  const applyAccent = () => {
    for (const [k, v] of Object.entries(accentOf().vars)) root.style.setProperty(k, v)
  }
  if (D.accents) applyAccent()
  const accentPicker = D.accents
    ? `<div class="layout-switch" data-accent-switch>
        <span class="label">Accent candidates</span>
        <div class="ls-options">${D.accents
          .map(
            (a) =>
              `<button type="button" class="${a.id === accentId ? 'on' : ''}" data-accent="${a.id}" aria-pressed="${a.id === accentId}"><span class="accent-dot" style="background:${a.vars['--accent-fill']}"></span>${a.name}</button>`,
          )
          .join('')}</div>
      </div>
      <p class="layout-desc" data-accent-desc>${accentOf().desc}</p>`
    : ''

  const color = sec(
    'color',
    '02',
    'Color',
    'Dark-first semantic roles. Surfaces step up in elevation, one accent carries intent, and status colors are reserved for state. Every text pairing below is measured live from the rendered page, with APCA (the perceptual model in the WCAG 3 drafts) as the gate and the WCAG 2 ratio alongside.',
    `<div class="label" style="margin-bottom:10px">Surfaces</div>
     <div class="ramp">${['--bg', '--s1', '--s2', '--s3', '--s4'].map((t) => `<div style="background:var(${t})"></div>`).join('')}</div>
     <div class="swatch-row">${[
       ['Background', '--bg'],
       ['Surface 1', '--s1'],
       ['Surface 2', '--s2'],
       ['Surface 3', '--s3'],
       ['Surface 4', '--s4'],
     ]
       .map(([n, t]) => swatch(n, t))
       .join('')}</div>
     ${accentPicker}
     <div class="label" style="margin-bottom:10px">Accent & status</div>
     <div class="swatch-row">${[
       ['Accent', '--accent'],
       ['Accent fill', '--accent-fill'],
       ['Accent 2', '--accent-2'],
       ['Success', '--success'],
       ['Warning', '--warning'],
       ['Danger', '--danger'],
       ['Info', '--info'],
     ]
       .map(([n, t]) => swatch(n, t))
       .join('')}</div>
     <div class="label" style="margin-bottom:10px">Contrast audit</div>
     <div class="card audit">
       <div class="audit-row audit-head"><span>Pairing</span><span>Sample</span><span>APCA Lc</span><span>WCAG 2</span><span>Target</span><span></span></div>
       ${AUDIT.map(
         ([label, sample, bg, target, use], i) => `
         <div class="audit-row" data-audit="${i}" data-target="${target}" ${bg ? `data-bg="${bg}"` : ''}>
           <span><b>${label}</b><small>${use}</small></span>
           <span class="audit-sample" ${bg ? `style="background:var(${bg})"` : ''}>${sample}</span>
           <span class="t-mono" data-lc>—</span>
           <span class="t-mono" data-ratio>—</span>
           <span class="t-mono">Lc ${target}</span>
           <span data-verdict></span>
         </div>`,
       ).join('')}
     </div>`,
  )

  const type = sec(
    'type',
    '03',
    'Typography',
    D.typeNote,
    `<div class="type-grid">
      <div class="card type-hero">
        <div class="label">Display · ${D.fonts.display}</div>
        <div class="big">Sintel</div>
        <div class="glyphs">Aa Bb Cc Gg Qq Rr 0123456789 — &amp; @ ✓</div>
      </div>
      <div class="card type-scale">
        <div><span class="label">Display 40</span><div class="t-display">Featured tonight</div></div>
        <div><span class="label">Heading 28</span><div class="t-h1">Continue watching</div></div>
        <div><span class="label">Title 19 · ${D.fonts.body}</span><div class="t-h2">Quality profile: HD + 4K</div></div>
        <div><span class="label">Body 15</span><div class="t-body">Releases are scored against your custom formats, then the best match is grabbed automatically.</div></div>
        <div><span class="label">Caption 12.5</span><div class="t-caption">Added 2 hours ago · Imported from /data/downloads</div></div>
        <div><span class="label">Mono 13 · ${D.fonts.mono}</span><div class="t-mono">8.42 GB · ↓ 14.2 MB/s · ETA 04:12 · ratio 1.42</div></div>
      </div>
    </div>`,
  )

  // ---------------------------------------------------------------- shared TV pieces
  const rowA = FILMS.slice(0, 11)
  const rowB = [FILMS[4], FILMS[2], FILMS[9], FILMS[5], FILMS[7], FILMS[1]]
  const progressB = [72, 35, 88, 12, 54, 20]

  const metaHTML = (f) =>
    `<span>${f.y}</span><span>${f.len}</span><span>${f.g}</span><span class="pill">${f.q}</span><span class="pill">CC</span>`
  const fileSize = (f) => `${((f.h % 9) + 1.4).toFixed(2)} GB`
  const specHTML = (f) => {
    const res = f.q.includes('4K') ? '2160p' : '1080p'
    const range = f.q.includes('HDR') ? 'HDR10' : f.q.includes('DV') ? 'Dolby Vision' : 'SDR'
    return [
      ['Video', `${res} · ${range} · HEVC`],
      ['Audio', 'English · DDP 5.1'],
      ['Subtitles', 'EN · ES · FR · synced'],
      ['File', `${fileSize(f)} · WEB-DL`],
    ]
      .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`)
      .join('')
  }
  const BINDS = {
    title: (f) => f.t,
    syn: (f) => f.syn,
    meta: metaHTML,
    spec: specHTML,
    num: (f) => `№ ${String(FILMS.indexOf(f) + 1).padStart(2, '0')}`,
  }
  const heroLayers = (f) =>
    `<div class="hero-layer art" data-layer="a" style="--h:${f.h}"><div class="poster-art"></div>${motif(f.m)}</div><div class="hero-layer art" data-layer="b" style="--h:${f.h};opacity:0"><div class="poster-art"></div>${motif(f.m)}</div>`
  const binds = (f, cls = '') =>
    `<div class="tv-title ${cls}" data-bind="title">${f.t}</div><div class="tv-meta" data-bind="meta">${metaHTML(f)}</div><div class="tv-syn" data-bind="syn">${f.syn}</div>`
  const tvButtons = (extra = '') =>
    `<div class="tv-actions" data-group="actions"><span class="tv-btn primary" data-f>${icon('play')}${t('play', 'Play')}</span><span class="tv-btn" data-f>${icon('info')}${t('details', 'Details')}</span>${extra}</div>`
  const tvAnnounce = (cls = '') =>
    `<div class="tv-announce ${cls}"><span class="dot">${icon('megaphone')}</span>${t('maintenance', `${SERVER} is offline Sunday 02:00–03:00 for maintenance`)}</div>`

  // ---------------------------------------------------------------- TV layouts
  const TV = {
    hero: {
      from: 'A',
      name: 'Hero + rows',
      desc: 'Full-bleed art for the focused title with curated rows below. Familiar and immersive: the artwork does the talking.',
      render: () => `
        <div class="tv-hero" data-hero>${heroLayers(FILMS[0])}</div>
        <div class="tv-server">${D.mark}<span>${SERVER}</span><span class="sep">· ${t('home', 'Home')}</span></div>
        ${tvAnnounce()}
        <div class="tv-hero-copy" data-copy>
          <div class="tv-eyebrow">${t('featured', `Featured on ${SERVER}`)}</div>
          ${binds(FILMS[0])}
          ${tvButtons()}
        </div>
        <div class="tv-rows" data-go-up="actions"><div class="tv-track" data-scroll="y" data-keep="0.32">
          <div class="tv-row-title"><b>${t('picks', 'Staff picks')}</b> · curated by ${SERVER}</div>
          <div class="tv-row" data-scroll="x" data-keep="0.3" data-group="r0">${rowA.map((f, i) => poster(f, { badge: true, focusable: true, initial: i === 0 })).join('')}</div>
          <div class="tv-row-title">${t('continue', 'Continue watching')}</div>
          <div class="tv-row wide" data-scroll="x" data-keep="0.3" data-group="r1">${rowB.map((f, i) => poster(f, { focusable: true, progress: progressB[i] })).join('')}</div>
        </div></div>`,
    },
    rail: {
      from: 'B',
      name: 'Rail + inspector',
      desc: 'A persistent navigation rail, a detailed inspector and a framed still. Dense on purpose: video, audio and subtitle tracks are visible before you press play.',
      render: () => `
        <nav class="rail" data-group="rail" data-choose data-isolate data-go-right="actions">
          <span class="rail-mark">${D.mark}</span>
          ${[
            ['home', t('home', 'Home')],
            ['search', 'Search'],
            ['film', t('movies', 'Movies')],
            ['tv', 'Shows'],
            ['bookmark', 'Watchlist'],
            ['sliders', t('settings', 'Settings')],
          ]
            .map(
              ([i, l], k) =>
                `<span class="rail-item ${k === 0 ? 'on' : ''}" data-f>${icon(i)}<span>${l}</span></span>`,
            )
            .join('')}
        </nav>
        <div class="rail-top" data-go-left="rail">
          <div class="rail-tabs" data-group="tabs" data-choose>${['For you', 'Movies', '4K', 'Recently added', 'Collections'].map((x, k) => `<span class="rail-tab ${k === 0 ? 'on' : ''}" data-f>${x}</span>`).join('')}</div>
          ${tvAnnounce('compact')}
          <span class="rail-clock">21:04</span>
        </div>
        <div class="rail-inspector" data-copy data-go-left="rail">
          <div class="rail-eyebrow"><span data-bind="num">№ 01</span> · ${SERVER}</div>
          ${binds(FILMS[0])}
          <dl class="rail-spec" data-bind="spec">${specHTML(FILMS[0])}</dl>
          ${tvButtons(`<span class="tv-btn icon" data-f>${icon('bookmark')}</span>`)}
        </div>
        <div class="rail-still" data-hero>${heroLayers(FILMS[0])}<span class="rail-tc">00:04:12 / 00:14:48</span><span class="rail-scrub"><i></i></span></div>
        <div class="rail-rows" data-go-left="rail"><div class="tv-track" data-scroll="y" data-keep="0.3">
          <div class="rail-row-title">${t('picks', 'Staff picks')}<span>curated by ${SERVER} · ${rowA.length}</span></div>
          <div class="rail-row" data-scroll="x" data-keep="0.3" data-group="r0">${rowA
            .map(
              (f, i) =>
                `<div class="tile" data-f data-film="${FILMS.indexOf(f)}"${i === 0 ? ' data-initial' : ''}>${poster(f, { title: false, cls: 'wide', badge: true })}<div class="tile-cap"><b>${f.t}</b><span>${f.y} · ${f.len}</span></div></div>`,
            )
            .join('')}</div>
          <div class="rail-row-title">${t('continue', 'Continue watching')}<span>${rowB.length}</span></div>
          <div class="rail-row" data-scroll="x" data-keep="0.3" data-group="r1">${rowB
            .map(
              (f, i) =>
                `<div class="tile" data-f data-film="${FILMS.indexOf(f)}">${poster(f, { title: false, cls: 'wide', progress: progressB[i] })}<div class="tile-cap"><b>${f.t}</b><span>${100 - progressB[i]}% left</span></div></div>`,
            )
            .join('')}</div>
        </div></div>`,
    },
    spotlight: {
      from: 'C',
      name: 'Spotlight',
      desc: "A centered cover-flow, with the focused title's art washing the whole screen. One thing at a time, presented like a premiere.",
      render: () => `
        <div class="spot-bg" data-hero>${heroLayers(FILMS[0])}</div>
        <div class="spot-top">
          <span class="tv-server">${D.mark}<span>${SERVER}</span></span>
          <div class="spot-tabs" data-group="tabs" data-choose>${[t('home', 'Home'), t('movies', 'Movies'), 'Shows', 'Collections', 'Search'].map((x, k) => `<span class="spot-tab ${k === 0 ? 'on' : ''}" data-f>${x}</span>`).join('')}</div>
          ${tvAnnounce('compact')}
        </div>
        <div class="spot-flow-wrap"><div class="spot-flow" data-scroll="x" data-center data-group="flow">${rowA.map((f, i) => poster(f, { title: false, focusable: true, initial: i === 2 })).join('')}</div></div>
        <div class="spot-copy" data-copy>
          <div class="tv-eyebrow">${t('featured', `Featured on ${SERVER}`)}</div>
          ${binds(FILMS[0])}
          ${tvButtons(`<span class="tv-btn icon" data-f>${icon('plus')}</span>`)}
        </div>
        <div class="spot-continue">
          <div class="spot-label">${t('continue', 'Continue watching')}</div>
          <div class="spot-row" data-scroll="x" data-keep="0.3" data-group="r1">${rowB.map((f, i) => poster(f, { title: false, cls: 'wide', focusable: true, progress: progressB[i] })).join('')}</div>
        </div>`,
    },
    manifest: {
      from: 'D',
      name: 'Manifest',
      desc: "A numbered manifest on the left and a framed plate on the right. Reads like a ship's log, and it is the fastest layout to scan with a remote.",
      render: () => `
        <div class="mf-chart" aria-hidden="true"></div>
        <div class="mf-head"><span class="tv-server">${D.mark}<span>${SERVER}</span><span class="sep">· ${t('manifest', 'Tonight')}</span></span></div>
        ${tvAnnounce()}
        <div class="mf-list-wrap" data-go-right="actions">
          <div class="mf-eyebrow">${t('manifestTitle', 'Up next')} · ${FILMS.length} titles</div>
          <div class="mf-viewport"><div class="mf-list" data-scroll="y" data-keep="0.4" data-group="list">${FILMS.map(
            (f, i) =>
              `<div class="mf-item" data-f data-film="${i}"${i === 0 ? ' data-initial' : ''}><span class="mf-num">${String(i + 1).padStart(2, '0')}</span><span class="mf-t">${f.t}</span><span class="mf-m">${f.y} · ${f.q}</span></div>`,
          ).join('')}</div></div>
        </div>
        <div class="mf-plate" data-hero>${heroLayers(FILMS[0])}<span class="mf-coord">${D.plateCaption ?? 'Plate I'}</span></div>
        <div class="mf-copy" data-copy data-go-left="list">
          <div class="tv-eyebrow" data-bind="num">№ 01</div>
          ${binds(FILMS[0])}
          ${tvButtons()}
        </div>`,
    },
  }

  // ---------------------------------------------------------------- mobile layouts
  const phoneChrome = (light = false) =>
    `<div class="phone-island"></div><div class="phone-status ${light ? 'on-art' : ''}"><span>9:41</span><span>●●● ▲ ▮</span></div>`
  const who = () =>
    `<span class="who">${D.mark}${SERVER}<span class="who-chev">${icon('chevronDown')}</span></span>`

  const MOBILE = {
    stack: {
      from: 'A',
      name: 'Tabs + carousel',
      desc: 'A tab bar, an announcement card, a featured carousel and poster rows. The accent marks only the active destination.',
      render: () => `
        ${phoneChrome()}
        <div class="phone-scroll">
          <div class="phone-head">${who()}<span class="avatar"></span></div>
          <div class="phone-announce"><span class="dot">${icon('megaphone')}</span><div><b>${t('announceTitle', 'Movie night is Friday')}</b>We added a new 4K collection. Check out Featured.</div></div>
          <div class="phone-feature">${[FILMS[10], FILMS[0], FILMS[2]].map((f) => poster(f, { sub: `New · ${f.y} · ${f.g}` })).join('')}</div>
          <div class="phone-row-title">Recently added</div>
          <div class="phone-row">${FILMS.slice(3, 9)
            .map((f) => poster(f))
            .join('')}</div>
          <div class="phone-row-title">Because you watched Spring</div>
          <div class="phone-row">${FILMS.slice(6, 12)
            .map((f) => poster(f))
            .join('')}</div>
        </div>
        <div class="phone-tabs">
          <span class="on">${icon('home')}${t('home', 'Home')}</span><span>${icon('search')}Search</span><span>${icon('library')}${t('library', 'Library')}</span><span>${icon('download')}${t('offline', 'Offline')}</span><span>${icon('user')}${t('you', 'You')}</span>
        </div>`,
    },
    list: {
      from: 'B',
      name: 'Segmented list',
      desc: 'Segmented sections and dense list rows with real metadata. Built for scanning and one-handed use, with no carousels.',
      render: () => `
        ${phoneChrome()}
        <div class="phone-scroll ml">
          <div class="ml-top">${who()}<span class="ml-icons">${icon('search')}${icon('bell')}</span></div>
          <div class="ml-seg"><span class="on">${t('home', 'Home')}</span><span>${t('movies', 'Movies')}</span><span>Shows</span><span>Music</span></div>
          <div class="ml-banner">${icon('megaphone')}<span><b>${t('announceTitle', 'Movie night is Friday')}</b> · new 4K collection</span>${icon('chevron')}</div>
          <div class="ml-label">${t('continue', 'Continue watching')}<span>3</span></div>
          <div class="ml-now">
            ${poster(FILMS[4], { title: false, cls: 'wide', progress: 72 })}
            <div><b>Cosmos Laundromat</b><span class="t-mono">12m · 4K · 3m left</span></div>
            <span class="ml-play">${icon('play')}</span>
          </div>
          <div class="ml-label">Recently added<span>See all</span></div>
          <div class="ml-list">${FILMS.slice(5, 11)
            .map(
              (f) =>
                `<div class="ml-row">${poster(f, { title: false })}<div><b>${f.t}</b><span class="t-mono">${f.y} · ${f.len} · ${f.q}</span></div>${icon('chevron')}</div>`,
            )
            .join('')}</div>
        </div>
        <div class="phone-tabs ml-tabs">
          <span class="on">${icon('home')}${t('home', 'Home')}</span><span>${icon('list')}Queue</span><span>${icon('library')}${t('library', 'Library')}</span><span>${icon('user')}${t('you', 'You')}</span>
        </div>`,
    },
    immersive: {
      from: 'C',
      name: 'Immersive + dock',
      desc: 'A full-bleed hero under the status bar and a floating capsule dock. Content first, chrome last.',
      render: () => `
        <div class="phone-scroll mi">
          <div class="mi-hero art" style="--h:${FILMS[10].h}"><div class="poster-art"></div>${motif(FILMS[10].m)}</div>
          <div class="mi-top"><span class="mi-pill">${D.mark}${SERVER}${icon('chevronDown')}</span><span class="avatar"></span></div>
          <div class="mi-copy">
            <span class="mi-ann">${icon('sparkles')}${t('announceTitle', 'Movie night is Friday')}${icon('chevron')}</span>
            <h3 class="mi-title">Wing It!</h3>
            <p>2023 · Comedy · 4m · 4K</p>
            <div class="mi-actions"><button class="btn primary" tabindex="-1">${icon('play')}${t('play', 'Play')}</button><button class="btn secondary icon" tabindex="-1" aria-label="Add to watchlist">${icon('plus')}</button></div>
            <div class="mi-dots"><i class="on"></i><i></i><i></i><i></i></div>
          </div>
          <div class="phone-row-title">${t('continue', 'Continue watching')}</div>
          <div class="phone-row mi-wide">${rowB
            .slice(0, 4)
            .map((f, i) => poster(f, { title: false, cls: 'wide', progress: progressB[i] }))
            .join('')}</div>
          <div class="phone-row-title">Because you watched Spring</div>
          <div class="phone-row">${FILMS.slice(6, 12)
            .map((f) => poster(f))
            .join('')}</div>
        </div>
        ${phoneChrome(true)}
        <nav class="mi-dock"><span class="on">${icon('home')}${t('home', 'Home')}</span><span>${icon('search')}</span><span>${icon('library')}</span><span>${icon('download')}</span></nav>`,
    },
    manifest: {
      from: 'D',
      name: 'Log + helm',
      desc: 'A numbered log with a raised helm button in the center of the dock for search and discovery.',
      render: () => `
        ${phoneChrome()}
        <div class="phone-scroll mm">
          <div class="mm-head">${who()}<span class="mm-search">${icon('search')}</span></div>
          <div class="mm-bottle"><span class="dot">${icon('scroll')}</span><div><b>${t('announce', 'Announcement')}</b>${t('announceBody', 'Movie night is Friday. New 4K collection in Featured.')}</div></div>
          <div class="mm-feature">${poster(FILMS[0], { title: false, cls: 'wide' })}<div class="mm-feature-copy"><span class="mm-kicker">${t('featured', `Featured on ${SERVER}`)}</span><b>Sintel</b><span>2010 · Fantasy · 4K HDR</span></div></div>
          <div class="mm-label">${t('manifestTitle', 'Up next')}</div>
          <ol class="mm-list">${FILMS.slice(1, 8)
            .map(
              (f, i) =>
                `<li><span class="mm-n">${String(i + 2).padStart(2, '0')}</span><div><b>${f.t}</b><span>${f.y} · ${f.g}</span></div><span class="mm-q">${f.q}</span></li>`,
            )
            .join('')}</ol>
        </div>
        <nav class="mm-helm">
          <span class="on">${icon('home')}${t('home', 'Home')}</span><span>${icon('library')}${t('library', 'Library')}</span>
          <span class="mm-wheel">${icon('compass')}</span>
          <span>${icon('download')}${t('offline', 'Offline')}</span><span>${icon('user')}${t('you', 'You')}</span>
        </nav>`,
    },
  }

  // ---------------------------------------------------------------- admin pieces
  const seeded = (seed) => () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
  const sparkPath = (seed, n, h, base, amp) => {
    const r = seeded(seed)
    let v = base
    const pts = []
    for (let i = 0; i < n; i++) {
      v = Math.max(4, Math.min(h - 4, v + (r() - 0.5) * amp))
      pts.push([(i / (n - 1)) * 300, h - v])
    }
    const line = pts
      .map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
      .join(' ')
    return { line, area: `${line} L300 ${h} L0 ${h} Z` }
  }
  const down = sparkPath(7, 40, 54, 30, 14)
  const up = sparkPath(19, 40, 54, 10, 6)
  let sparkId = 0
  const spark = (h = 54) => {
    const id = `sg-${D.id}-${sparkId++}`
    return `<svg class="spark" viewBox="0 0 300 54" preserveAspectRatio="none" style="height:${h}px">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--accent);stop-opacity:.35"/><stop offset="1" style="stop-color:var(--accent);stop-opacity:0"/></linearGradient></defs>
      <path d="${down.area}" fill="url(#${id})"/>
      <path class="draw" d="${down.line}" fill="none" stroke="var(--accent)" stroke-width="1.75" vector-effect="non-scaling-stroke"/>
      <path d="${up.line}" fill="none" stroke="var(--text-3)" stroke-width="1.25" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/>
    </svg>`
  }

  const DL = [
    {
      n: 'Sintel',
      r: 'Sintel.2010.2160p.WEB-DL.DDP5.1.HDR.HEVC',
      size: '8.42 GB',
      p: 62,
      dl: '14.2 MB/s',
      ul: '1.1 MB/s',
      eta: '4m 12s',
      s: 'Downloading',
      k: 'accent',
    },
    {
      n: 'Tears of Steel',
      r: 'Tears.of.Steel.2012.1080p.BluRay.x264',
      size: '2.31 GB',
      p: 100,
      dl: '—',
      ul: '820 KB/s',
      eta: 'ratio 1.42',
      s: 'Seeding',
      k: 'success',
    },
    {
      n: 'Spring',
      r: 'Spring.2019.2160p.WEB-DL.DV.HEVC',
      size: '5.07 GB',
      p: 100,
      dl: '—',
      ul: '—',
      eta: 'renaming…',
      s: 'Importing',
      k: 'info',
    },
    {
      n: 'Cosmos Laundromat',
      r: 'Cosmos.Laundromat.2015.1080p.WEB-DL',
      size: '1.88 GB',
      p: 27,
      dl: '0 B/s',
      ul: '—',
      eta: '∞',
      s: 'Stalled',
      k: 'warning',
    },
    {
      n: 'Charge',
      r: 'Charge.2022.1080p.WEB-DL.H264',
      size: '1.12 GB',
      p: 0,
      dl: '—',
      ul: '—',
      eta: 'queued',
      s: 'Queued',
      k: 'plain',
    },
  ]
  const barFill = (k) =>
    k === 'warning'
      ? '--bar-fill:var(--warning);'
      : k === 'success'
        ? '--bar-fill:var(--success);'
        : ''
  const statusLabel = (d) => t(`status${d.s}`, d.s)

  // [icon, vocab key, plain label, count]
  const NAV = [
    ['gauge', 'dashboard', 'Dashboard', ''],
    ['compass', 'discover', 'Discover', ''],
    ['film', 'movies', 'Movies', '412'],
    ['activity', 'activity', 'Activity', '5'],
    ['download', 'downloads', 'Downloads', ''],
    'sep',
    ['radar', 'indexers', 'Indexers', ''],
    ['captions', 'subtitles', 'Subtitles', ''],
    ['sparkles', 'curation', 'Curation', ''],
    'sep',
    ['sliders', 'settings', 'Settings', ''],
    ['server', 'system', 'System', ''],
  ]
  const navLinks = NAV.filter((x) => x !== 'sep')
  const navItem = ([ic, key, plain, count], i, cls = 'nav-item') =>
    `<div class="${cls} ${i === 0 ? 'on' : ''}">${icon(ic)}<span>${t(key, plain)}${themedCopy && D.vocab?.[key] ? `<small>${plain}</small>` : ''}</span>${count ? `<span class="count">${count}</span>` : ''}</div>`

  const W = {
    network: () => `
      <div class="widget-head"><b>Network</b><span>last 10 min</span></div>
      <div style="display:flex;gap:22px;align-items:baseline"><div class="stat" data-speed>18.4<small>MB/s ↓</small></div><div class="stat" style="font-size:18px;color:var(--text-2)">2.1<small>MB/s ↑</small></div></div>
      ${spark()}`,
    storage: () => `
      <div class="widget-head"><b>Storage</b><span>/data</span></div>
      <div class="stat">6.2<small>TB free of 16</small></div>
      <div class="disk"><i style="width:38%;background:var(--accent)"></i><i style="width:14%;background:var(--accent-2)"></i><i style="width:6%;background:var(--info)"></i><i style="width:3%;background:var(--warning)"></i></div>
      <div class="legend"><span><i style="background:var(--accent)"></i>Movies</span><span><i style="background:var(--accent-2)"></i>TV</span><span><i style="background:var(--info)"></i>Music</span><span><i style="background:var(--warning)"></i>Downloads</span></div>`,
    indexers: () => `
      <div class="widget-head"><b>${t('indexers', 'Indexers')}</b><span>4 of 5 healthy</span></div>
      <div class="idx-list">
        <div><span class="status-dot"></span><span>Lighthouse</span><span>212 ms</span></div>
        <div><span class="status-dot"></span><span>Anchorage</span><span>340 ms</span></div>
        <div><span class="status-dot"></span><span>Driftnet</span><span>188 ms</span></div>
        <div><span class="status-dot warn"></span><span>Keel</span><span>backoff 4m</span></div>
      </div>`,
    subtitles: () => `
      <div class="widget-head"><b>${t('subtitles', 'Subtitles')}</b><span>today</span></div>
      <div class="stat">12<small>synced · 2 waiting</small></div>
      <div class="bar" style="width:100%;--p:86;--bar-fill:var(--success)"><i></i></div>
      <div class="t-caption">Avg. offset corrected 1.84 s · confidence 0.93</div>`,
    upcoming: () => `
      <div class="widget-head"><b>Upcoming</b><span>next 14 days</span></div>
      <div class="idx-list">
        <div><span class="badge plain accent">Fri 24</span><span>Wing It! — Director's Cut</span><span>monitored</span></div>
        <div><span class="badge plain">Tue 28</span><span>Agent 327: Operation Barbershop</span><span>4K wanted</span></div>
        <div><span class="badge plain">Thu 30</span><span>Sprite Fright — Extended</span><span>cutoff unmet</span></div>
      </div>`,
    announce: () => `
      <div class="widget-head"><b>${t('announce', 'Announcement')}</b><span class="badge plain success">Live</span></div>
      <div style="font-weight:600">${t('announceTitle', 'Movie night is Friday')}</div>
      <div class="t-caption">All clients · banner + home card · until Fri 23:59</div>`,
  }

  const queueTable = ({ numbered = false } = {}) => `
    <table>
      <thead><tr>${numbered ? '<th>№</th>' : ''}<th>Title</th><th>Size</th><th>Progress</th><th>↓</th><th class="col-up">↑</th><th>ETA</th><th>Status</th></tr></thead>
      <tbody>${DL.map(
        (d, i) => `<tr data-dl="${i}" style="--p:${d.p}">
          ${numbered ? `<td class="num">${String(i + 1).padStart(2, '0')}</td>` : ''}
          <td class="name">${d.n}<small>${d.r}</small></td>
          <td class="num">${d.size}</td>
          <td><div class="prog"><div class="bar" style="${barFill(d.k)}"><i></i></div><span data-pct>${d.p}%</span></div></td>
          <td class="num">${d.dl}</td><td class="num col-up">${d.ul}</td><td class="num">${d.eta}</td>
          <td><span class="badge ${d.k}">${statusLabel(d)}</span></td>
        </tr>`,
      ).join('')}</tbody>
    </table>`

  const queueTabs = `<div class="tabs"><span class="on">All</span><span>Downloading</span><span>Seeding</span><span>Issues</span></div>`

  // ---------------------------------------------------------------- admin layouts
  const ADMIN = {
    sidebar: {
      from: 'A',
      name: 'Sidebar + widgets',
      desc: 'Sidebar navigation and a free-form widget grid above the queue. Every card is a widget the owner can rearrange, resize or remove.',
      render: () => `
        <div class="admin admin-sidebar">
          <aside class="admin-side">
            ${lockup()}
            ${NAV.map((it, i) => (it === 'sep' ? '<div class="nav-sep"></div>' : navItem(it, i))).join('')}
            <div class="server"><span class="status-dot"></span><div><b>${SERVER}</b><small>v0.1.0 · 3 ${t('clients', 'clients online')}</small></div></div>
          </aside>
          <main class="admin-main">
            <div class="admin-top">
              <h2>${t('dashboard', 'Dashboard')}</h2>
              <div class="search">${icon('search')}<span>${t('search', 'Search library, TMDB, actions')}</span><span class="kbd">⌘K</span></div>
              <button class="btn secondary sm" type="button">${icon('layout')}${t('customize', 'Customize')}</button>
            </div>
            <div class="widgets">
              <div class="widget span2">${W.network()}</div>
              <div class="widget">${W.storage()}</div>
              <div class="widget">${W.indexers()}</div>
              <div class="widget">${W.subtitles()}</div>
              <div class="widget span2">${W.upcoming()}</div>
              <div class="widget">${W.announce()}</div>
            </div>
            <div class="table">
              <div class="table-head"><b>${t('queue', 'Queue')}</b><span class="t-caption">5 items · 18.4 MB/s</span>${queueTabs}</div>
              ${queueTable()}
            </div>
          </main>
        </div>`,
    },
    topbar: {
      from: 'B',
      name: 'Top bar + inspector',
      desc: 'Top navigation, the queue as the primary surface, a readout column on the right and a status bar like an IDE. Nothing is decorative.',
      render: () => `
        <div class="admin admin-topbar">
          <header class="atb-bar">
            ${lockup('sm')}
            <nav class="atb-nav">${navLinks
              .slice(0, 9)
              .map(
                ([, key, plain, count], i) =>
                  `<span class="atb-link ${i === 0 ? 'on' : ''}">${t(key, plain)}${count ? `<span class="count">${count}</span>` : ''}</span>`,
              )
              .join('')}</nav>
            <div class="search">${icon('search')}<span>${t('search', 'Search library, TMDB, actions')}</span><span class="kbd">⌘K</span></div>
          </header>
          <div class="atb-head">
            <h2>${t('dashboard', 'Dashboard')}</h2><span class="t-mono t-caption">live · updated 2 s ago</span>
            <div class="row" style="margin-left:auto"><button class="btn secondary sm" type="button">${icon('layout')}${t('customize', 'Customize')}</button><button class="btn primary sm" type="button">${icon('plus')}${t('addMovie', 'Add movie')}</button></div>
          </div>
          <div class="atb-grid">
            <div class="atb-left">
              <div class="table">
                <div class="table-head"><b>${t('queue', 'Queue')}</b><span class="t-caption">5 items · 18.4 MB/s</span>${queueTabs}</div>
                ${queueTable()}
              </div>
              <div class="table">
                <div class="table-head"><b>Upcoming</b><span class="t-caption">next 14 days</span></div>
                <table><tbody>
                  <tr><td class="num">Fri 24 Oct</td><td>Wing It! — Director's Cut</td><td class="num">4K</td><td><span class="badge accent">Monitored</span></td></tr>
                  <tr><td class="num">Tue 28 Oct</td><td>Agent 327: Operation Barbershop</td><td class="num">4K</td><td><span class="badge warning">Wanted</span></td></tr>
                  <tr><td class="num">Thu 30 Oct</td><td>Sprite Fright — Extended</td><td class="num">1080p</td><td><span class="badge warning">Cutoff unmet</span></td></tr>
                </tbody></table>
              </div>
            </div>
            <aside class="atb-right">
              <div class="readout">${W.network()}</div>
              <div class="readout">${W.storage()}</div>
              <div class="readout">${W.indexers()}</div>
              <div class="readout">${W.subtitles()}</div>
            </aside>
          </div>
          <footer class="atb-status"><span><span class="status-dot"></span>${SERVER}</span><span>v0.1.0</span><span>3 ${t('clients', 'clients online')}</span><span>CPU 12%</span><span>RAM 1.2 GB</span><span>6.2 TB free</span><span style="margin-left:auto">2 jobs running · RSS sync in 9m</span></footer>
        </div>`,
    },
    cards: {
      from: 'C',
      name: 'Rail + cards',
      desc: 'A floating icon rail, a greeting header and poster-forward cards instead of tables. Built to feel like the client, not like server software.',
      render: () => `
        <div class="admin admin-cards">
          <nav class="ac-rail">
            <span class="ac-mark">${D.mark}</span>
            ${navLinks
              .slice(0, 9)
              .map(
                ([ic, key, plain], i) =>
                  `<span class="ac-item ${i === 0 ? 'on' : ''}" title="${t(key, plain)}">${icon(ic)}</span>`,
              )
              .join('')}
            <span class="avatar" style="margin-top:auto"></span>
          </nav>
          <main class="ac-main">
            <header class="ac-hero">
              <div>
                <div class="label">Thursday · ${SERVER}</div>
                <h2>${t('greeting', 'Good evening')}</h2>
                <p>${SERVER} is healthy. 2 downloads finish tonight, and 12 subtitles were synced today.</p>
              </div>
              <div class="row"><button class="btn secondary" type="button">${icon('layout')}${t('customize', 'Customize')}</button><button class="btn primary" type="button">${icon('plus')}${t('addMovie', 'Add movie')}</button></div>
            </header>
            <div class="ac-stats">
              <div class="ac-card">${W.network()}</div>
              <div class="ac-card ac-ring-card"><div class="ring" style="--p:61;--ring:var(--accent)"><span><b>6.2</b>TB free</span></div><div><div class="widget-head"><b>Storage</b></div><div class="legend" style="display:grid;gap:4px"><span><i style="background:var(--accent)"></i>Movies 6.1 TB</span><span><i style="background:var(--accent-2)"></i>TV 2.2 TB</span><span><i style="background:var(--info)"></i>Music 1.0 TB</span></div></div></div>
              <div class="ac-card ac-ring-card"><div class="ring" style="--p:86;--ring:var(--success)"><span><b>12</b>synced</span></div><div><div class="widget-head"><b>${t('subtitles', 'Subtitles')}</b></div><div class="t-caption">2 waiting · avg. offset corrected 1.84 s</div></div></div>
            </div>
            <div class="ac-section"><h3>${t('arriving', 'Arriving')}</h3><span class="t-caption">5 in queue · 18.4 MB/s</span>${queueTabs}</div>
            <div class="ac-queue">${DL.map(
              (d, i) => `<div class="ac-dl" data-dl="${i}" style="--p:${d.p}">
                ${poster(film(d.n), { title: false })}
                <div class="ac-dl-body"><b>${d.n}</b><small>${d.size} · ${d.dl === '—' ? d.eta : d.dl}</small><span class="badge ${d.k}">${statusLabel(d)}</span></div>
                <div class="ring sm" style="--ring:${d.k === 'warning' ? 'var(--warning)' : d.k === 'success' ? 'var(--success)' : 'var(--accent)'}"><span data-pct>${d.p}%</span></div>
              </div>`,
            ).join('')}</div>
            <div class="ac-two">
              <div class="ac-card">${W.upcoming()}</div>
              <div class="ac-card">${W.announce()}</div>
            </div>
          </main>
        </div>`,
    },
    ledger: {
      from: 'D',
      name: 'Ledger',
      desc: 'Ruled ledger lines instead of cards, a single metric strip, and a wanted board for missing items.',
      render: () => `
        <div class="admin admin-ledger">
          <aside class="al-side">
            ${lockup()}
            ${NAV.map((it, i) => (it === 'sep' ? '<div class="nav-sep"></div>' : navItem(it, i))).join('')}
            <div class="al-crew"><span class="status-dot"></span>${SERVER} · v0.1.0<br/>3 ${t('clients', 'clients online')}</div>
          </aside>
          <main class="al-main">
            <header class="al-head">
              <div><h2>${t('dashboard', 'Dashboard')}</h2><span class="t-mono t-caption">Thu 16 Oct 2026 · ${t('logEntry', 'Day')} 287</span></div>
              <div class="row"><div class="search">${icon('search')}<span>${t('search', 'Search library, TMDB, actions')}</span><span class="kbd">⌘K</span></div><button class="btn primary sm" type="button">${icon('plus')}${t('addMovie', 'Add movie')}</button></div>
            </header>
            <div class="al-strip">
              <div><span class="label">Network</span><b data-speed>18.4<small>MB/s ↓</small></b><span class="t-caption">2.1 MB/s ↑</span></div>
              <div><span class="label">${t('storage', 'Storage')}</span><b>6.2<small>TB free</small></b><span class="t-caption">of 16 TB</span></div>
              <div><span class="label">${t('indexers', 'Indexers')}</span><b>4/5<small>healthy</small></b><span class="t-caption">Keel backing off</span></div>
              <div><span class="label">${t('subtitles', 'Subtitles')}</span><b>12<small>synced</small></b><span class="t-caption">2 waiting</span></div>
            </div>
            <div class="al-cols">
              <section>
                <h3 class="al-h">${t('queue', 'Queue')}<span>5 items · 18.4 MB/s</span></h3>
                <div class="al-table">${queueTable({ numbered: true })}</div>
              </section>
              <section>
                <h3 class="al-h">${t('wanted', 'Wanted')}<span>3 missing</span></h3>
                <div class="al-wanted">${[
                  [FILMS[10], '4K HDR', 'Director’s Cut · monitored'],
                  [FILMS[6], '4K', 'Barbershop · releases Tue'],
                  [FILMS[8], '1080p → 4K', 'Cutoff unmet'],
                ]
                  .map(
                    ([f, q, s]) =>
                      `<div class="wanted"><div class="wanted-head">${t('wantedPoster', 'Wanted')}</div>${poster(f, { title: false, cls: 'wide' })}<b>${f.t}</b><span class="wanted-q">${t('reward', 'Target')}: ${q}</span><span class="t-caption">${s}</span></div>`,
                  )
                  .join('')}</div>
              </section>
            </div>
          </main>
        </div>`,
    },
  }

  // ---------------------------------------------------------------- layout picking
  const own = { tv: 'hero', mobile: 'stack', admin: 'sidebar', ...(D.layouts ?? {}) }
  const REG = { tv: TV, mobile: MOBILE, admin: ADMIN }
  const current = { ...own }
  const switcher = (surface) => `
    <div class="layout-switch" data-switch="${surface}">
      <span class="label">Layout</span>
      <div class="ls-options">${Object.entries(REG[surface])
        .map(
          ([k, v]) =>
            `<button type="button" class="${k === current[surface] ? 'on' : ''}" data-layout="${k}" aria-pressed="${k === current[surface]}"><span class="ls-from">${v.from}</span>${v.name}${k === own[surface] ? '<span class="ls-own" title="This direction’s own layout">●</span>' : ''}</button>`,
        )
        .join('')}</div>
    </div>
    <p class="layout-desc" data-desc="${surface}">${REG[surface][current[surface]].desc}</p>`

  // ---------------------------------------------------------------- sections 04–06
  const tv = sec(
    'tv',
    '04',
    'Client — TV home',
    `A 1920×1080 living-room screen, scaled. The owner's server identity leads, and featured sections come from server curation. <b>Click the screen, then use the arrow keys and Enter.</b> Focus moves spatially, so every layout navigates like a real 10-foot UI. Switch layouts to try any structure in this direction's skin.`,
    `${switcher('tv')}
     <div class="frame-cap"><span class="label">Apple TV / Android TV / webOS / Tizen</span><span class="t-caption"><span class="kbd">←</span> <span class="kbd">↑</span> <span class="kbd">↓</span> <span class="kbd">→</span> move · <span class="kbd">Enter</span> select · <span class="kbd">Esc</span> back</span></div>
     <div data-tv-host></div>`,
  )

  const mobile = sec(
    'mobile',
    '05',
    'Client — Mobile',
    'The same system at hand-held scale: the server switcher, the owner’s announcement and featured content, structured differently per layout.',
    `${switcher('mobile')}
     <div class="phone-wrap">
      <div class="phone"><div class="phone-screen" data-phone-host></div></div>
      <div class="phone-notes">
        <div><h3>Server first</h3><p>Every client opens on the server's identity ("${SERVER}"), not on highsea's. The owner's theme and accent override the defaults when set.</p></div>
        <div><h3>Curation is native</h3><p>Announcements and featured sections are first-class components. They are not banners bolted onto a generic home screen.</p></div>
        <div><h3>One system</h3><p>Poster radius, motion springs and sounds are the same tokens used on TV and in the admin app.</p></div>
      </div>
    </div>`,
  )

  const admin = sec(
    'admin',
    '06',
    'Server — Admin dashboard',
    "The owner's control room: dense but calm, built for years of daily use. Tables use mono figures for scannability.",
    `${switcher('admin')}<div data-admin-host></div>`,
  )

  const components = sec(
    'components',
    '07',
    'Components',
    "Core primitives, interactive. Buttons press with the direction's spring, and toggles and segmented controls glide. Labels on filled buttons are semibold and pass APCA Lc 75.",
    `<div class="comp-grid">
      <div class="card comp">
        <span class="label">Buttons</span>
        <div class="row">
          <button class="btn primary" data-snd="select">${icon('plus')}${t('addMovie', 'Add movie')}</button>
          <button class="btn secondary" data-snd="select">${icon('search')}Search releases</button>
          <button class="btn ghost" data-snd="select">Cancel</button>
          <button class="btn danger" data-snd="error">${icon('trash')}Delete files</button>
          <button class="btn secondary icon" aria-label="More" data-snd="select">${icon('more')}</button>
        </div>
        <span class="label">Badges</span>
        <div class="row">
          <span class="badge accent">Downloading</span><span class="badge success">Available</span><span class="badge warning">Cutoff unmet</span><span class="badge danger">Failed</span><span class="badge info">Importing</span><span class="badge">Unmonitored</span>
        </div>
      </div>
      <div class="card comp">
        <span class="label">Form</span>
        <div class="row">
          <label class="field">Root folder<input class="input" value="/data/media/movies"/><span class="hint">Same filesystem as /data/downloads, so hardlinks are enabled.</span></label>
        </div>
        <div class="row" style="justify-content:space-between">
          <div class="seg" role="tablist" data-seg><span class="thumb"></span><button class="on">Posters</button><button>Table</button><button>Overview</button></div>
          <div class="row"><span class="t-caption">Monitor</span><button class="toggle" role="switch" aria-checked="true" aria-label="Monitor"></button></div>
        </div>
      </div>
      <div class="card comp">
        <span class="label">Toast</span>
        <div class="toast"><span class="ico">${icon('check')}</span><div><b>Sintel imported</b><span>2160p WEB-DL · subtitles synced (en, es)</span></div><button class="btn ghost sm">View</button></div>
      </div>
      <div class="card comp">
        <span class="label">Menu</span>
        <div class="menu">
          <div class="hl">${icon('search')}Interactive search<span class="kbd">S</span></div>
          <div>${icon('replay')}Refresh metadata<span class="kbd">R</span></div>
          <div>${icon('captions')}Sync subtitles</div>
          <hr/>
          <div class="danger">${icon('trash')}Delete…</div>
        </div>
      </div>
    </div>`,
  )

  const enterTransform = `translateY(${D.motion.enterY}px) scale(${D.motion.enterScale}) rotate(${D.motion.enterRotate ?? 0}deg)`

  const motion = sec(
    'motion',
    '08',
    'Motion',
    `${D.motionNote} Spring: stiffness ${D.motion.spring.stiffness}, damping ${D.motion.spring.damping} → ${SPRING.duration} ms settle, ζ ${SPRING.zeta.toFixed(2)}.`,
    `<div class="motion-grid">
      <div class="card motion-card"><header><h3>Entrance</h3><button class="btn secondary sm" data-demo="enter">${icon('replay')}Replay</button></header>
        <div class="stage" data-enter-stage><div class="mini-posters">${FILMS.slice(0, 8)
          .map((f) => poster(f, { title: false }))
          .join('')}</div></div>
        <span class="t-caption">Staggered library reveal. Content arrives; chrome doesn't.</span></div>
      <div class="card motion-card"><header><h3>Sheet</h3><button class="btn secondary sm" data-demo="sheet">${icon('replay')}Toggle</button></header>
        <div class="stage" data-sheet-stage><div class="mini-posters">${FILMS.slice(4, 12)
          .map((f) => poster(f, { title: false }))
          .join(
            '',
          )}</div><div class="scrim"></div><div class="sheet"><div class="ln" style="width:40%;background:var(--text-3)"></div><div class="ln"></div><div class="ln" style="width:70%"></div></div></div>
        <span class="t-caption">Overlays rise on the same spring and dismiss faster than they arrive.</span></div>
      <div class="card motion-card"><header><h3>Focus travel</h3><button class="btn secondary sm" data-demo="focus">${icon('replay')}Replay</button></header>
        <div class="stage" data-focus-stage><div class="focus-row">${FILMS.slice(0, 5)
          .map((f) => poster(f, { title: false }))
          .join('')}</div><div class="focus-ring"></div></div>
        <span class="t-caption">10-foot focus moves as one object, so it's legible from the couch.</span></div>
    </div>
    <div class="card" style="margin-top:16px;padding:18px;display:grid;gap:10px">
      <div class="widget-head"><b>Signature spring</b><span>${SPRING.duration} ms</span></div>
      <svg class="curve" viewBox="0 0 400 120" preserveAspectRatio="none">
        <path d="M0 100H400" stroke="var(--line)" /><path d="M0 20H400" stroke="var(--line)" stroke-dasharray="3 4"/>
        <path d="${SPRING.points.map((p, i) => `${i ? 'L' : 'M'}${((i / (SPRING.points.length - 1)) * 400).toFixed(1)} ${(100 - p * 80).toFixed(1)}`).join(' ')}" fill="none" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke"/>
      </svg>
      <div class="curve-meta"><span>0 ms</span><span>target</span><span>${SPRING.duration} ms</span></div>
    </div>`,
  )

  const sound = sec(
    'sound',
    '09',
    'Sound',
    `${D.soundNote} Every sound is synthesized in the browser, with no audio files. These are sketches of character, not final assets.`,
    `<div class="sound-grid">
      <div class="card sound-pads">
        ${[
          ['navigate', 'Navigate', 'Focus moves (TV), tab change'],
          ['select', 'Select', 'Confirm, open, play'],
          ['back', 'Back', 'Dismiss, go back'],
          ['success', 'Success', 'Imported, saved'],
          ['error', 'Error', 'Failed, blocked'],
          ['notify', 'Notification', 'Announcement, download done'],
          ['arrival', 'Arrival — signature', 'TV app launch / server connected'],
        ]
          .map(
            ([k, n, d]) =>
              `<button class="pad ${k === 'arrival' ? 'wide' : ''}" data-play="${k}"><b>${n}</b><span>${d}</span></button>`,
          )
          .join('')}
      </div>
      <div class="card scope-card"><div class="widget-head"><b>Output</b><span>${D.soundEngine}</span></div><canvas class="scope"></canvas><span class="t-caption">Admin defaults to sounds off. TV clients default to on at a low volume. Users can choose sound packs.</span></div>
    </div>`,
  )

  const notes = sec(
    'notes',
    '10',
    'Direction notes',
    null,
    `<div class="notes">
      <div class="card"><h3>Why this direction</h3><ul>${D.notes.why.map((x) => `<li>${x}</li>`).join('')}</ul></div>
      <div class="card"><h3>Where it shines</h3><ul>${D.notes.shines.map((x) => `<li>${x}</li>`).join('')}</ul></div>
      <div class="card"><h3>Risks</h3><ul>${D.notes.risks.map((x) => `<li>${x}</li>`).join('')}</ul></div>
    </div>`,
  )

  document.body.innerHTML = `${nav}<main class="board">${cover}${identity}${color}${type}${tv}${mobile}${admin}${components}${motion}${sound}${notes}</main>`

  // ---------------------------------------------------------------- behaviors

  // contrast audit, measured from the rendered samples
  const runAudit = () => {
    for (const row of document.querySelectorAll('[data-audit]')) {
      const sample = row.querySelector('.audit-sample > *')
      const cs = getComputedStyle(sample)
      const backdrop = row.dataset.bg ? css(row.dataset.bg) : css('--s1')
      const fg = paint(backdrop, cs.color)
      // a gradient fill is measured at both ends; the weaker end decides
      const stops =
        cs.backgroundImage !== 'none'
          ? (cs.backgroundImage.match(
              /(?:rgba?|color|oklab|oklch|hsla?)\([^)]*\)|#[0-9a-f]{3,8}/gi,
            ) ?? [])
          : [cs.backgroundColor]
      let worst = null
      for (const s of stops) {
        const bg = paint(backdrop, s)
        const lc = apca(fg, bg)
        if (!worst || lc < worst.lc) worst = { lc, ratio: wcag(fg, bg) }
      }
      const pass = worst.lc >= Number(row.dataset.target) - 0.5
      row.querySelector('[data-lc]').textContent = `Lc ${worst.lc.toFixed(0)}`
      row.querySelector('[data-ratio]').textContent = `${worst.ratio.toFixed(1)}:1`
      row.querySelector('[data-verdict]').innerHTML =
        `<span class="badge ${pass ? 'success' : 'danger'}">${pass ? 'Pass' : 'Below'}</span>`
    }
  }
  runAudit()
  const refreshSwatches = () => {
    for (const sw of document.querySelectorAll('.swatch')) {
      const v = css(sw.dataset.token)
      if (v) sw.querySelector('.hex').textContent = `${sw.dataset.token} · ${v}`
    }
  }
  refreshSwatches()

  for (const b of document.querySelectorAll('[data-accent]')) {
    b.addEventListener('click', () => {
      accentId = b.dataset.accent
      store.set(`hs-accent-${D.id}`, accentId)
      applyAccent()
      for (const o of document.querySelectorAll('[data-accent]')) {
        o.classList.toggle('on', o === b)
        o.setAttribute('aria-pressed', String(o === b))
      }
      document.querySelector('[data-accent-desc]').textContent = accentOf().desc
      Sound.play('select')
      refreshSwatches()
      runAudit()
    })
  }

  // board toggles
  const soundBtn = document.querySelector('.sound-toggle')
  soundBtn.addEventListener('click', () => {
    Sound.enabled = !Sound.enabled
    store.set('hs-sound', Sound.enabled ? 'on' : 'off')
    soundBtn.setAttribute('aria-pressed', String(Sound.enabled))
    soundBtn.innerHTML = soundLabel()
    if (Sound.enabled) Sound.play('select')
  })
  const copyBtn = document.querySelector('.copy-toggle')
  copyBtn?.addEventListener('click', () => {
    themedCopy = !themedCopy
    copyBtn.setAttribute('aria-pressed', String(themedCopy))
    copyBtn.innerHTML = copyLabel()
    Sound.play('select')
    mountTV(current.tv)
    mountPhone(current.mobile)
    mountAdmin(current.admin)
  })

  // sound pads
  Scope.canvas = document.querySelector('.scope')
  Scope.kick()
  for (const pad of document.querySelectorAll('[data-play]')) {
    pad.addEventListener('click', () => {
      Sound.play(pad.dataset.play, true)
      pad.classList.add('hit')
      setTimeout(() => pad.classList.remove('hit'), 300)
    })
  }
  for (const b of document.querySelectorAll('[data-snd]'))
    b.addEventListener('click', () => Sound.play(b.dataset.snd))

  // toggle + segmented control
  for (const tg of document.querySelectorAll('.toggle')) {
    tg.addEventListener('click', () => {
      const on = tg.getAttribute('aria-checked') !== 'true'
      tg.setAttribute('aria-checked', String(on))
      Sound.play(on ? 'select' : 'back')
    })
  }
  for (const seg of document.querySelectorAll('[data-seg]')) {
    const thumb = seg.querySelector('.thumb')
    const place = (b) => {
      thumb.style.left = `${b.offsetLeft}px`
      thumb.style.width = `${b.offsetWidth}px`
    }
    const buttons = [...seg.querySelectorAll('button')]
    requestAnimationFrame(() => place(seg.querySelector('button.on')))
    for (const b of buttons) {
      b.addEventListener('click', () => {
        for (const x of buttons) x.classList.toggle('on', x === b)
        place(b)
        Sound.play('navigate')
      })
    }
  }

  // ---- TV: spatial focus engine, shared by every layout
  // Focusable items carry [data-f]; items with [data-film] drive the bound hero/inspector.
  // [data-scroll="x|y"] containers translate to keep focus in view ([data-center] centers it).
  // [data-group] remembers the last focus per group, so returning to a row restores position.
  let tvRefresh = () => {}
  function mountTV(key) {
    const host = document.querySelector('[data-tv-host]')
    host.innerHTML = `<div class="tv" data-layout-tv="${key}" tabindex="0" role="application" aria-label="TV home prototype. Use the arrow keys to move focus and Enter to select."><div class="tv-inner">${TV[key].render()}</div></div>`
    const tvEl = host.firstElementChild
    const all = () => [...tvEl.querySelectorAll('[data-f]')]
    const initial = () => tvEl.querySelector('[data-initial]') ?? all()[0]
    const groupOf = (el) => el.closest('[data-group]')?.dataset.group ?? ''
    const memory = new Map()
    let cur = initial()
    let heroFilm = FILMS[0]
    let heroLayer = 'a'
    let heroTimer = 0

    // A candidate must lie ahead in the pressed direction. Left/right also need vertical overlap
    // (a shared band), so focus never slides diagonally into another region. Up/down accept
    // anything inside a 45° cone. Jumps between regions that don't line up are declared by
    // layouts as focus guides: [data-go-left|right|up|down="<group>"] on an ancestor.
    const mid = (r) => [r.left + r.width / 2, r.top + r.height / 2]
    const ahead = (dir, a, b) => {
      const [ax, ay] = mid(a)
      const [bx, by] = mid(b)
      return { right: bx > ax + 2, left: bx < ax - 2, down: by > ay + 2, up: by < ay - 2 }[dir]
    }
    const inDir = (dir, a, b) => {
      if (!ahead(dir, a, b)) return false
      if (dir === 'left' || dir === 'right') return b.top < a.bottom && b.bottom > a.top
      if (b.left < a.right && b.right > a.left) return true
      const [ax, ay] = mid(a)
      const [bx, by] = mid(b)
      return Math.abs(by - ay) >= Math.abs(bx - ax)
    }
    const score = (dir, a, b) => {
      const horizontal = dir === 'left' || dir === 'right'
      const gap = horizontal
        ? Math.max(0, dir === 'right' ? b.left - a.right : a.left - b.right)
        : Math.max(0, dir === 'down' ? b.top - a.bottom : a.top - b.bottom)
      const orth = horizontal
        ? Math.abs(b.top + b.height / 2 - (a.top + a.height / 2))
        : Math.abs(b.left + b.width / 2 - (a.left + a.width / 2))
      return gap + orth * (horizontal ? 3 : 1)
    }
    const pick = (dir) => {
      const a = cur.getBoundingClientRect()
      let best = null
      for (const el of all()) {
        if (el === cur) continue
        // an isolated region (e.g. a nav rail) is only entered through a focus guide
        const iso = el.closest('[data-isolate]')
        if (iso && !iso.contains(cur)) continue
        const b = el.getBoundingClientRect()
        if (!inDir(dir, a, b)) continue
        const s = score(dir, a, b)
        if (!best || s < best.s) best = { el, s }
      }
      if (!best) {
        const guide = cur.closest(`[data-go-${dir}]`)?.getAttribute(`data-go-${dir}`)
        if (!guide) return null
        const remembered = memory.get(guide)
        return remembered?.isConnected
          ? remembered
          : tvEl.querySelector(`[data-group="${guide}"] [data-f], [data-group="${guide}"][data-f]`)
      }
      // re-entering a group restores where you left it, if that spot is in the pressed direction
      const g = groupOf(best.el)
      const remembered = g !== groupOf(cur) ? memory.get(g) : null
      if (remembered?.isConnected && ahead(dir, a, remembered.getBoundingClientRect()))
        return remembered
      return best.el
    }

    // Positions come from rect centers relative to the track, so in-flight transforms on the
    // track (and the focus scale on the item) cancel out. Nested tracks (a row inside a column)
    // are each scrolled on their own axis.
    const scrollInto = (el) => {
      for (
        let sc = el.closest('[data-scroll]');
        sc;
        sc = sc.parentElement.closest('[data-scroll]')
      ) {
        const x = sc.dataset.scroll === 'x'
        const er = el.getBoundingClientRect()
        const sr = sc.getBoundingClientRect()
        const center = x ? er.left + er.width / 2 - sr.left : er.top + er.height / 2 - sr.top
        const view = x ? sc.parentElement.clientWidth : sc.parentElement.clientHeight
        const total = x ? sc.scrollWidth : sc.scrollHeight
        let target = center - view * Number(sc.dataset.keep ?? 0.5)
        if (!('center' in sc.dataset))
          target = Math.min(Math.max(0, target), Math.max(0, total - view))
        sc.style.transform = x ? `translateX(${-target}px)` : `translateY(${-target}px)`
      }
    }

    const setHero = (f) => {
      if (f === heroFilm) return
      heroFilm = f
      const hero = tvEl.querySelector('[data-hero]')
      if (hero) {
        const next = heroLayer === 'a' ? 'b' : 'a'
        const nextEl = hero.querySelector(`[data-layer="${next}"]`)
        nextEl.style.setProperty('--h', f.h)
        nextEl.innerHTML = `<div class="poster-art"></div>${motif(f.m)}`
        nextEl.style.opacity = 1
        hero.querySelector(`[data-layer="${heroLayer}"]`).style.opacity = 0
        heroLayer = next
      }
      const swap = () => {
        for (const el of tvEl.querySelectorAll('[data-bind]'))
          el.innerHTML = BINDS[el.dataset.bind](f)
      }
      const copy = tvEl.querySelector('[data-copy]')
      if (reduceMotion || !copy) return swap()
      copy.animate(
        [
          { opacity: 1, transform: 'none' },
          { opacity: 0, transform: 'translateY(4px)' },
        ],
        { duration: 140, fill: 'forwards' },
      ).onfinish = () => {
        swap()
        copy.animate(
          [
            { opacity: 0, transform: 'translateY(-6px)' },
            { opacity: 1, transform: 'none' },
          ],
          { duration: SPRING.duration, easing: SPRING.easing, fill: 'forwards' },
        )
      }
    }

    const render = () => {
      const active = document.activeElement === tvEl
      for (const el of all()) el.classList.toggle('focused', active && el === cur)
      scrollInto(cur)
      if (cur.dataset.film != null) {
        const f = FILMS[Number(cur.dataset.film)]
        clearTimeout(heroTimer)
        heroTimer = setTimeout(() => setHero(f), 220)
      }
    }
    const go = (el) => {
      memory.set(groupOf(cur), cur)
      cur = el
      render()
    }

    tvEl.addEventListener('focus', render)
    tvEl.addEventListener('blur', () => {
      for (const el of tvEl.querySelectorAll('.focused')) el.classList.remove('focused')
    })
    const DIRS = { ArrowRight: 'right', ArrowLeft: 'left', ArrowUp: 'up', ArrowDown: 'down' }
    tvEl.addEventListener('keydown', (e) => {
      const dir = DIRS[e.key]
      if (dir) {
        e.preventDefault()
        const next = pick(dir)
        if (next) {
          Sound.play('navigate')
          go(next)
        } else Sound.play('error')
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        Sound.play('select')
        const chooser = cur.closest('[data-choose]')
        if (chooser)
          for (const x of chooser.querySelectorAll('[data-f]')) x.classList.toggle('on', x === cur)
        if (!reduceMotion)
          cur.animate(
            [
              { filter: 'brightness(1)' },
              { filter: 'brightness(1.35)' },
              { filter: 'brightness(1)' },
            ],
            { duration: 280, easing: 'ease-out' },
          )
      } else if (e.key === 'Escape' || e.key === 'Backspace') {
        e.preventDefault()
        Sound.play('back')
        go(initial())
      }
    })
    tvEl.addEventListener('click', (e) => {
      const el = e.target.closest('[data-f]')
      if (!el) return
      Sound.play('navigate')
      memory.set(groupOf(cur), cur)
      cur = el
      if (document.activeElement === tvEl) render()
      else tvEl.focus()
    })
    render()
    tvRefresh = () => scrollInto(cur)
  }
  addEventListener('resize', () => tvRefresh())

  // ---- mobile + admin mounting
  function mountPhone(key) {
    document.querySelector('[data-phone-host]').innerHTML = MOBILE[key].render()
    for (const p of document.querySelectorAll('[data-phone-host] .poster'))
      p.addEventListener('click', () => Sound.play('select'))
  }
  function mountAdmin(key) {
    document.querySelector('[data-admin-host]').innerHTML = ADMIN[key].render()
    for (const p of document.querySelectorAll('[data-admin-host] .spark .draw')) drawIo.observe(p)
  }

  // sparkline draw-in when visible
  const drawIo = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting || reduceMotion) continue
      const p = en.target
      const len = p.getTotalLength()
      p.animate(
        [
          { strokeDasharray: `${len}`, strokeDashoffset: len },
          { strokeDasharray: `${len}`, strokeDashoffset: 0 },
        ],
        { duration: 1400, easing: 'cubic-bezier(.2,.7,.1,1)' },
      )
      drawIo.unobserve(p)
    }
  })

  const MOUNT = { tv: mountTV, mobile: mountPhone, admin: mountAdmin }
  for (const surface of Object.keys(MOUNT)) MOUNT[surface](current[surface])
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-layout]')
    if (!btn) return
    const surface = btn.closest('[data-switch]').dataset.switch
    current[surface] = btn.dataset.layout
    for (const b of btn.parentElement.children) {
      b.classList.toggle('on', b === btn)
      b.setAttribute('aria-pressed', String(b === btn))
    }
    document.querySelector(`[data-desc="${surface}"]`).textContent =
      REG[surface][current[surface]].desc
    Sound.play('navigate')
    MOUNT[surface](current[surface])
  })

  // ---- admin: live-ish queue
  const live = DL.map((d) => ({ ...d }))
  setInterval(() => {
    live.forEach((d, i) => {
      if (d.s !== 'Downloading') return
      d.p = d.p >= 100 ? 18 : Math.min(100, d.p + Math.random() * 1.6)
      for (const el of document.querySelectorAll(`[data-dl="${i}"]`)) {
        el.style.setProperty('--p', d.p.toFixed(1))
        el.querySelector('[data-pct]').textContent = `${Math.floor(d.p)}%`
      }
    })
    for (const sp of document.querySelectorAll('[data-speed]'))
      sp.firstChild.textContent = (16 + Math.random() * 5).toFixed(1)
  }, 1200)

  // ---- motion demos
  const opts = (extra = {}) => ({
    duration: reduceMotion ? 1 : SPRING.duration,
    easing: SPRING.easing,
    fill: 'both',
    ...extra,
  })
  const demoEnter = () => {
    const cards = document.querySelectorAll('[data-enter-stage] .poster')
    cards.forEach((c, i) => {
      c.animate(
        [
          { opacity: 0, transform: enterTransform },
          { opacity: 1, transform: 'none' },
        ],
        opts({ delay: i * D.motion.stagger }),
      )
    })
  }
  let sheetOpen = false
  const demoSheet = () => {
    const stage = document.querySelector('[data-sheet-stage]')
    const sheet = stage.querySelector('.sheet')
    const scrim = stage.querySelector('.scrim')
    sheetOpen = !sheetOpen
    Sound.play(sheetOpen ? 'select' : 'back')
    if (sheetOpen) {
      sheet.animate([{ transform: 'translateY(130%)' }, { transform: 'translateY(0)' }], opts())
      scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, fill: 'both' })
    } else {
      sheet.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(130%)' }], {
        duration: 200,
        easing: 'cubic-bezier(.4,0,1,1)',
        fill: 'both',
      })
      scrim.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'both' })
    }
  }
  let focusIdx = 0
  let focusRun = 0
  const placeRing = (animate) => {
    const stage = document.querySelector('[data-focus-stage]')
    const ring = stage.querySelector('.focus-ring')
    const cards = stage.querySelectorAll('.poster')
    const c = cards[focusIdx]
    const sb = stage.getBoundingClientRect()
    const cb = c.getBoundingClientRect()
    const to = {
      transform: `translate(${cb.left - sb.left - 3}px, ${cb.top - sb.top - 3}px)`,
      width: `${cb.width + 6}px`,
      height: `${cb.height + 6}px`,
    }
    if (!animate || !ring.style.width) Object.assign(ring.style, to)
    else {
      const from = {
        transform: ring.style.transform,
        width: ring.style.width,
        height: ring.style.height,
      }
      ring.animate([from, to], opts())
      Object.assign(ring.style, to)
    }
  }
  const demoFocus = () => {
    const run = ++focusRun
    focusIdx = 0
    placeRing(false)
    const seq = [1, 2, 3, 4, 3, 2]
    seq.forEach((idx, i) => {
      setTimeout(
        () => {
          if (run !== focusRun) return
          focusIdx = idx
          placeRing(true)
          Sound.play('navigate')
        },
        420 * (i + 1),
      )
    })
  }
  document.querySelector('[data-demo="enter"]').addEventListener('click', demoEnter)
  document.querySelector('[data-demo="sheet"]').addEventListener('click', demoSheet)
  document.querySelector('[data-demo="focus"]').addEventListener('click', demoFocus)
  requestAnimationFrame(() => placeRing(false))
  addEventListener('resize', () => placeRing(false))

  // play the entrance once when the motion section comes into view
  const motionIo = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        demoEnter()
        demoFocus()
        motionIo.disconnect()
      }
    },
    { threshold: 0.4 },
  )
  motionIo.observe(document.querySelector('#motion .motion-grid'))

  // fonts can shift layout after first paint
  document.fonts?.ready.then(() => {
    runAudit()
    tvRefresh()
  })
})()

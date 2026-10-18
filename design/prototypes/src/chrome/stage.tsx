// SPDX-License-Identifier: AGPL-3.0-only
// The stage: the screen in an iframe, framed per platform. Admin and Web render at the chosen
// width (scaled down if the window is narrower); Mobile in a 390 × 844 device; TV on the largest
// 16:9 that fits. The iframe gives each one a real viewport, so breakpoints and `h-screen` hold.
import { type Ref, useEffect, useRef, useState } from 'react'
import type { Platform, Width } from '../proto/state.ts'

const PHONE = { w: 390, h: 844, bezel: 12 }
const MARGIN = 24

function useSize() {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ w: entry.contentRect.width, h: entry.contentRect.height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, size] as const
}

type StageProps = {
  ref: Ref<HTMLIFrameElement>
  platform: Platform
  width: Width
  /** The route the frame opens at. Later changes travel over postMessage, not `src`. */
  path: string
}

export function Stage({ ref, platform, width, path }: StageProps) {
  const [stage, size] = useSize()
  // a platform switch reloads the frame at the new platform's home; nothing else does
  const [src, setSrc] = useState(path)
  const [shown, setShown] = useState(platform)
  if (shown !== platform) {
    setShown(platform)
    setSrc(path)
  }
  const frame = (
    <iframe
      key={platform}
      ref={ref}
      title={`${platform === 'tv' ? 'TV' : platform[0]?.toUpperCase() + platform.slice(1)} screen`}
      src={`./index.html?screen#${src}`}
      className="block size-full border-0 bg-bg"
    />
  )

  let body = null
  let caption = ''
  if (size.w > 0) {
    if (platform === 'tv') {
      const w = Math.min(size.w - MARGIN * 2, ((size.h - MARGIN * 2) * 16) / 9)
      body = (
        <div
          style={{ width: w, height: (w * 9) / 16 }}
          className="overflow-hidden rounded-sm shadow-4 ring-1 ring-line"
        >
          {frame}
        </div>
      )
      caption = `16:9 · ${Math.round(w)} × ${Math.round((w * 9) / 16)}`
    } else if (platform === 'mobile') {
      const outerW = PHONE.w + PHONE.bezel * 2
      const outerH = PHONE.h + PHONE.bezel * 2
      const scale = Math.min(1, (size.w - MARGIN * 2) / outerW, (size.h - MARGIN * 2) / outerH)
      body = (
        <div style={{ width: outerW * scale, height: outerH * scale }}>
          <div
            style={{ width: outerW, height: outerH, transform: `scale(${scale})` }}
            className="origin-top-left rounded-[56px] bg-s3 p-3 shadow-4 ring-1 ring-line-strong"
          >
            <div className="size-full overflow-hidden rounded-[44px]">{frame}</div>
          </div>
        </div>
      )
      caption = `390 × 844 pt · ${Math.round(scale * 100)}%`
    } else if (width === 'fluid') {
      body = <div className="size-full">{frame}</div>
      caption = `fluid · ${Math.round(size.w)} px`
    } else {
      const scale = Math.min(1, size.w / width)
      body = (
        <div style={{ width: width * scale, height: size.h }} className="mx-auto">
          <div
            style={{ width, height: size.h / scale, transform: `scale(${scale})` }}
            className="origin-top-left border-line border-x"
          >
            {frame}
          </div>
        </div>
      )
      caption = `${width} px${scale < 1 ? ` · shown at ${Math.round(scale * 100)}%` : ''}`
    }
  }

  return (
    <main
      ref={stage}
      aria-label="Prototype stage"
      className="relative grid min-h-0 flex-1 place-items-center overflow-hidden bg-[#050506]"
    >
      {body}
      {caption && (
        <p className="pointer-events-none absolute end-3 bottom-2 font-mono text-[10px] text-text-3">
          {caption}
        </p>
      )}
    </main>
  )
}

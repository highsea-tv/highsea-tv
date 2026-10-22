// SPDX-License-Identifier: AGPL-3.0-only
// `index.html?emails`: every email highsea sends, compiled from its MJML in the browser
// (mjml-browser) and shown in a sandboxed frame, as an inbox would show it, at a phone's or a
// desktop's width. The controls show how it reads with another server name, with or without an
// external URL, as plain text, and in clients that invert colours (docs/product/emails.md).

import logo from '@highsea/brand/icons/web/icon-192.png'
import { compileOptions, palette } from '@highsea/notifications/mail'
import { cn, SegmentedControl, Select } from '@highsea/ui-web'
import mjml2html from 'mjml-browser'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { HARBOR_URL, renderSample, type SampleId, sampleIds, sampleLabels } from './samples.ts'

type Width = 'phone' | 'desktop'
type Client = 'designed' | 'invert'
type Format = 'html' | 'text'

const WIDTH: Record<Width, number> = { phone: 375, desktop: 720 }

/** Which email: the hash, so each can be linked (`?emails#invite`). */
function useSample(): [SampleId, (id: SampleId) => void] {
  const read = () => {
    const id = window.location.hash.replace(/^#/, '') as SampleId
    return sampleIds.includes(id) ? id : 'invite'
  }
  const id = useSyncExternalStore((notify) => {
    window.addEventListener('hashchange', notify)
    return () => window.removeEventListener('hashchange', notify)
  }, read)
  return [id, (next) => (window.location.hash = next)]
}

/**
 * Full invert, roughly as Gmail on iOS and Outlook on Windows do it: every colour flipped in
 * lightness, images flipped back (Litmus, "The Ultimate Guide to Dark Mode for Email Marketers").
 */
const INVERT = `<style>html{background:${palette.canvas};filter:invert(1) hue-rotate(180deg)}img{filter:invert(1) hue-rotate(180deg)}</style>`

export function EmailPreview() {
  const [id, setId] = useSample()
  const [width, setWidth] = useState<Width>('desktop')
  const [client, setClient] = useState<Client>('designed')
  const [format, setFormat] = useState<Format>('html')
  const [server, setServer] = useState('Harbor')
  const [external, setExternal] = useState(true)
  const email = renderSample(id, {
    server,
    externalUrl: external ? HARBOR_URL : null,
    logo,
  })
  const [compiled, setCompiled] = useState<{ html: string; errors: string[] } | null>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(600)

  useEffect(() => {
    document.documentElement.dataset.theme = 'default'
    document.title = 'Emails · highsea prototypes'
  }, [])

  useEffect(() => {
    let live = true
    // soft, so a mistake shows as a list of errors rather than a blank frame
    Promise.resolve(mjml2html(email.mjml, { ...compileOptions, validationLevel: 'soft' })).then(
      (out) => {
        if (live)
          setCompiled({
            html: out.html,
            errors: out.errors.map((e) => e.formattedMessage ?? e.message),
          })
      },
      (e: Error) => live && setCompiled({ html: '', errors: [e.message] }),
    )
    return () => {
      live = false
    }
  }, [email.mjml])

  const html =
    compiled && client === 'invert'
      ? compiled.html.replace('</head>', `${INVERT}</head>`)
      : compiled?.html
  const from = `${server} <media@harbor.example.net>`

  return (
    <main className="min-h-dvh bg-bg text-text">
      <div className="mx-auto grid max-w-[1320px] gap-6 px-4 py-6 medium:px-6 expanded:grid-cols-[15rem_minmax(0,1fr)] expanded:py-8">
        <header className="grid content-start gap-4">
          <div className="grid gap-1">
            <a href="./" className="justify-self-start text-caption text-text-3 hover:text-text">
              Prototypes
            </a>
            <h1 className="text-heading">Emails</h1>
            <p className="text-caption text-text-2">
              What highsea sends: the server’s mail and an Email connection’s notifications. Spec:
              docs/product/emails.md
            </p>
          </div>
          <div className="expanded:hidden">
            <Select
              aria-label="Email"
              value={id}
              onValueChange={(v) => setId(v as SampleId)}
              options={sampleIds.map((s) => ({ value: s, label: sampleLabels[s] }))}
            />
          </div>
          <nav aria-label="Emails" className="hidden expanded:block">
            <ul className="grid gap-0.5">
              {sampleIds.map((s, i) => (
                <li key={s} className={cn(i === 2 && 'mt-3 border-line border-t pt-3')}>
                  <a
                    href={`#${s}`}
                    aria-current={s === id ? 'page' : undefined}
                    className={cn(
                      'block rounded-sm px-2.5 py-1.5 text-ui outline-none focus-visible:ring-focus',
                      s === id ? 'bg-s2 text-text' : 'text-text-2 hover:bg-s1 hover:text-text',
                    )}
                  >
                    {sampleLabels[s]}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </header>

        <section className="grid min-w-0 content-start gap-4" aria-label={sampleLabels[id]}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <SegmentedControl
              aria-label="Width"
              size="sm"
              value={width}
              onValueChange={(v) => setWidth(v as Width)}
              options={[
                { value: 'phone', label: 'Phone' },
                { value: 'desktop', label: 'Desktop' },
              ]}
            />
            <SegmentedControl
              aria-label="Client"
              size="sm"
              value={client}
              onValueChange={(v) => setClient(v as Client)}
              options={[
                { value: 'designed', label: 'As designed' },
                { value: 'invert', label: 'Full invert' },
              ]}
            />
            <SegmentedControl
              aria-label="Format"
              size="sm"
              value={format}
              onValueChange={(v) => setFormat(v as Format)}
              options={[
                { value: 'html', label: 'HTML' },
                { value: 'text', label: 'Plain text' },
              ]}
            />
            <SegmentedControl
              aria-label="Server name"
              size="sm"
              value={server}
              onValueChange={setServer}
              options={[
                { value: 'Harbor', label: 'Harbor' },
                { value: 'highsea', label: 'highsea' },
              ]}
            />
            <SegmentedControl
              aria-label="External URL"
              size="sm"
              value={external ? 'set' : 'none'}
              onValueChange={(v) => setExternal(v === 'set')}
              options={[
                { value: 'set', label: 'External URL' },
                { value: 'none', label: 'None' },
              ]}
            />
          </div>
          <p className="max-w-[80ch] text-caption text-text-3">
            {client === 'designed'
              ? 'As designed: Apple Mail on the Mac, Gmail on the web and Yahoo leave colours alone, and Outlook.com and Gmail on Android only darken light backgrounds, so this dark design shows as it is.'
              : 'Full invert, approximated: Gmail on iOS and Outlook on Windows flip every colour, so a dark email turns light. Images are left alone, which is why the logo is a tile with its own ground.'}
          </p>

          <div
            className="grid min-w-0 justify-self-start overflow-hidden rounded-lg border border-line bg-s1"
            style={{ width: '100%', maxWidth: WIDTH[width] + 2 }}
          >
            <dl className="grid gap-1 border-line border-b px-4 py-3 text-caption">
              <div className="flex min-w-0 gap-2">
                <dt className="w-14 shrink-0 text-text-3">From</dt>
                <dd className="min-w-0 truncate text-text-2">{from}</dd>
              </div>
              <div className="flex min-w-0 gap-2">
                <dt className="w-14 shrink-0 text-text-3">Subject</dt>
                <dd className="min-w-0 text-text">{email.subject}</dd>
              </div>
              <div className="flex min-w-0 gap-2">
                <dt className="w-14 shrink-0 text-text-3">Preview</dt>
                <dd className="min-w-0 truncate text-text-3">{email.preheader}</dd>
              </div>
            </dl>
            {format === 'text' ? (
              <pre className="overflow-x-auto whitespace-pre-wrap break-words bg-bg p-4 font-mono text-[13px] text-text-2 leading-relaxed">
                {email.text}
              </pre>
            ) : compiled?.errors.length ? (
              <ul className="grid gap-1 p-4 font-mono text-[12px] text-danger">
                {compiled.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            ) : (
              <iframe
                ref={frame}
                title={`${sampleLabels[id]} email`}
                sandbox="allow-same-origin"
                srcDoc={html ?? ''}
                className="block w-full border-0 bg-bg"
                style={{ height }}
                onLoad={() => {
                  // the body, not the root: the root is never shorter than the frame, so a short
                  // email after a long one would keep the long one's height
                  const doc = frame.current?.contentDocument
                  if (doc) setHeight(Math.max(320, doc.body.scrollHeight))
                }}
              />
            )}
          </div>
        </section>
      </div>
    </main>
  )
}

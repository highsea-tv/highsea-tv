// SPDX-License-Identifier: AGPL-3.0-only

import { art, titles } from '@highsea/fixtures'
import {
  choreography,
  durations,
  MAX_OVERSHOOT,
  type SpringParams,
  springMetrics,
  springPosition,
  springs,
} from '@highsea/tokens'
import {
  Button,
  Poster,
  springBase,
  springQuick,
  staggerDelay,
  usePrefersReducedMotion,
} from '@highsea/ui-web'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { Page, Section } from './page.tsx'

const meta = { title: 'Foundations/Motion', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

/** The spring's position over time, with the settle point marked. */
function Curve({ params }: { params: SpringParams }) {
  const m = springMetrics(params)
  const end = Math.max(m.settle, 600) / 1000
  const w = 320
  const h = 120
  const y = (v: number) => h - 12 - v * (h - 36)
  const points = Array.from({ length: 121 }, (_, i) => {
    const t = (i / 120) * end
    return `${(i / 120) * w},${y(springPosition(params, t))}`
  }).join(' ')
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full max-w-80"
      role="img"
      aria-label="Spring position over time"
    >
      <line
        x1="0"
        x2={w}
        y1={y(1)}
        y2={y(1)}
        stroke="var(--color-line-strong)"
        strokeDasharray="3 4"
      />
      <line x1="0" x2={w} y1={y(0)} y2={y(0)} stroke="var(--color-line)" />
      <polyline
        points={points}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <line
        x1={(m.settle / 1000 / end) * w}
        x2={(m.settle / 1000 / end) * w}
        y1="8"
        y2={h - 8}
        stroke="var(--color-text-3)"
        strokeDasharray="2 3"
      />
    </svg>
  )
}

function SpringCard({ name, params, use }: { name: string; params: SpringParams; use: string }) {
  const m = springMetrics(params)
  const [on, setOn] = useState(false)
  return (
    <div className="grid gap-4 rounded-lg bg-s1 p-5">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-title">spring.{name}</h3>
        <span className="font-mono text-release text-text-3">
          k {params.stiffness} · c {params.damping} · m {params.mass}
        </span>
      </div>
      <p className="text-ui text-text-2">{use}</p>
      <Curve params={params} />
      <dl className="grid grid-cols-3 gap-2 font-mono text-figure">
        <div>
          <dt className="text-text-3">90%</dt>
          <dd>{m.t90}ms</dd>
        </div>
        <div>
          <dt className="text-text-3">settles</dt>
          <dd>{m.settle}ms</dd>
        </div>
        <div>
          <dt className="text-text-3">overshoot</dt>
          <dd>{m.overshoot.toFixed(2)}%</dd>
        </div>
      </dl>
      <div className="relative h-12 rounded-md bg-bg">
        <motion.div
          className="absolute top-2 left-2 size-8 rounded-sm bg-accent-fill"
          animate={{ x: on ? 240 : 0 }}
          transition={name === 'base' ? springBase : springQuick}
        />
      </div>
      <Button size="sm" className="justify-self-start" onClick={() => setOn((v) => !v)}>
        Run
      </Button>
    </div>
  )
}

export const Springs: StoryObj = {
  render: function Render() {
    const reduced = usePrefersReducedMotion()
    const [key, setKey] = useState(0)
    const [shown, setShown] = useState(true)
    return (
      <Page
        title="Motion"
        lead={`Calm and physical: two critically damped springs, no bounce (overshoot under ${MAX_OVERSHOOT}%). Color changes take ${durations.color}ms; exits fade in ${durations.fadeOut}ms.`}
        doc="docs/design-language/motion.md"
      >
        {reduced && (
          <p className="rounded-md border border-line-strong bg-s1 p-3 text-ui text-text-2">
            Your system asks for reduced motion, so these demos jump instead of moving. Opacity
            changes of {durations.reducedFade}ms or less still play.
          </p>
        )}
        <Section title="Springs">
          <div className="grid gap-5 expanded:grid-cols-2">
            <SpringCard
              name="base"
              params={springs.base}
              use="Layout, focus moves, rows and tracks, sheets, entrances."
            />
            <SpringCard
              name="quick"
              params={springs.quick}
              use="Press feedback, toggles, segmented controls, checkboxes."
            />
          </div>
        </Section>
        <Section
          title="Entrance"
          note={`Items rise ${choreography.enterY}px and fade in on spring.base, ${choreography.stagger}ms apart, with the stagger capped at ${choreography.staggerCap} items.`}
        >
          <Button
            size="sm"
            className="justify-self-start"
            icon="refresh"
            onClick={() => setKey((k) => k + 1)}
          >
            Replay
          </Button>
          <div key={key} className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-4">
            {titles.map((t, i) => (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: choreography.enterY }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...springBase, delay: staggerDelay(i) }}
              >
                <Poster title={t.title} src={art(t).poster} />
              </motion.div>
            ))}
          </div>
        </Section>
        <Section
          title="Exit and swap"
          note={`Leaving content fades out in ${durations.fadeOut}ms with no movement. A content swap moves the old copy ${choreography.swapOutY}px down and brings the new copy in from ${-choreography.swapInY}px above.`}
        >
          <Button size="sm" className="justify-self-start" onClick={() => setShown((s) => !s)}>
            {shown ? 'Dismiss' : 'Show'}
          </Button>
          <div className="h-20">
            <AnimatePresence>
              {shown && (
                <motion.div
                  initial={{ opacity: 0, scale: choreography.enterScale }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{
                    opacity: 0,
                    transition: { duration: durations.fadeOut / 1000, ease: 'linear' },
                  }}
                  transition={springBase}
                  className="rounded-lg bg-s3 p-4 text-ui shadow-3"
                >
                  A floating layer: it rises on spring.base and leaves with a fade.
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </Section>
        <Section
          title="Press and focus"
          note="Buttons press to 0.97 on spring.quick. Posters lift to 1.02 on hover and keyboard focus (1.05 on TV)."
        >
          <div className="flex flex-wrap items-center gap-6">
            <Button variant="primary">Press me</Button>
            <div className="w-36">
              <Poster
                title="Sintel"
                src={art(titles[0] as (typeof titles)[number]).poster}
                href="#sintel"
              />
            </div>
          </div>
        </Section>
      </Page>
    )
  },
}

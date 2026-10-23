// SPDX-License-Identifier: AGPL-3.0-only
// `/metrics` (checkpoint 8b, ADR 0047): a small registry writing Prometheus's text exposition
// format, version 0.0.4 (https://prometheus.io/docs/instrumenting/exposition_formats/), rather
// than a dependency. Counters and histograms are kept as things happen (HTTP requests); everything
// else is read when Prometheus scrapes, so an unscraped server does no work for it. Names and units
// follow Prometheus's naming practice (https://prometheus.io/docs/practices/naming/): a `highsea_`
// prefix, base units (seconds, bytes), `_total` on counters, and the client libraries' standard
// `process_` and `nodejs_` names where they mean the same.

export const METRICS_CONTENT_TYPE = 'text/plain; version=0.0.4; charset=utf-8'

export type Labels = Record<string, string>
export type Sample = { labels?: Labels; value: number }
type Kind = 'counter' | 'gauge' | 'histogram'

/** Label values escape backslash, double quote and line feed (the format's `label_value`). */
const escapeLabel = (v: string) =>
  v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
/** HELP text escapes backslash and line feed. */
const escapeHelp = (v: string) => v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n')

function formatValue(v: number) {
  if (Number.isNaN(v)) return 'NaN'
  if (v === Number.POSITIVE_INFINITY) return '+Inf'
  if (v === Number.NEGATIVE_INFINITY) return '-Inf'
  return String(v)
}

function line(name: string, labels: Labels | undefined, value: number) {
  const pairs = Object.entries(labels ?? {})
  const set = pairs.length ? `{${pairs.map(([k, v]) => `${k}="${escapeLabel(v)}"`).join(',')}}` : ''
  return `${name}${set} ${formatValue(value)}\n`
}

const keyOf = (labels: Labels) => JSON.stringify(Object.entries(labels).sort())

type Family = { name: string; help: string; kind: Kind; render(): string }

/** The client libraries' default buckets, in seconds, for request durations. */
export const DEFAULT_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]

export function createRegistry() {
  const families: Family[] = []

  function add(family: Family) {
    if (
      !/^[a-zA-Z_:][a-zA-Z0-9_:]*$/.test(family.name) ||
      families.some((f) => f.name === family.name)
    )
      throw new Error(`The metric name ${family.name} isn’t valid or is taken.`)
    families.push(family)
  }

  return {
    /** A counter kept in memory, by labels. */
    counter(name: string, help: string) {
      const values = new Map<string, Sample>()
      add({
        name,
        help,
        kind: 'counter',
        render: () => [...values.values()].map((s) => line(name, s.labels, s.value)).join(''),
      })
      return {
        inc(labels: Labels = {}, by = 1) {
          const key = keyOf(labels)
          const s = values.get(key)
          if (s) s.value += by
          else values.set(key, { labels, value: by })
        },
      }
    },

    /** A histogram kept in memory, by labels: cumulative buckets, `_sum` and `_count`. */
    histogram(name: string, help: string, buckets = DEFAULT_BUCKETS) {
      const values = new Map<
        string,
        { labels: Labels; counts: number[]; sum: number; count: number }
      >()
      add({
        name,
        help,
        kind: 'histogram',
        render: () =>
          [...values.values()]
            .map((h) => {
              let out = ''
              buckets.forEach((le, i) => {
                out += line(
                  `${name}_bucket`,
                  { ...h.labels, le: String(le) },
                  h.counts[i] as number,
                )
              })
              out += line(`${name}_bucket`, { ...h.labels, le: '+Inf' }, h.count)
              out += line(`${name}_sum`, h.labels, h.sum)
              out += line(`${name}_count`, h.labels, h.count)
              return out
            })
            .join(''),
      })
      return {
        observe(labels: Labels, value: number) {
          const key = keyOf(labels)
          let h = values.get(key)
          if (!h) {
            h = { labels, counts: buckets.map(() => 0), sum: 0, count: 0 }
            values.set(key, h)
          }
          buckets.forEach((le, i) => {
            if (value <= le) (h.counts[i] as number)++
          })
          h.sum += value
          h.count++
        },
      }
    },

    /** A counter or gauge read when scraped. A collector that throws leaves its family out. */
    collect(name: string, help: string, kind: 'counter' | 'gauge', read: () => Sample[] | number) {
      add({
        name,
        help,
        kind,
        render() {
          const samples = read()
          return (typeof samples === 'number' ? [{ value: samples }] : samples)
            .map((s) => line(name, s.labels, s.value))
            .join('')
        },
      })
    },

    /** The exposition: each family's HELP, TYPE and samples. */
    render(): string {
      let out = ''
      for (const f of families) {
        let body: string
        try {
          body = f.render()
        } catch {
          continue
        }
        out += `# HELP ${f.name} ${escapeHelp(f.help)}\n# TYPE ${f.name} ${f.kind}\n${body}`
      }
      return out
    },
  }
}

export type Registry = ReturnType<typeof createRegistry>

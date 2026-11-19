// SPDX-License-Identifier: AGPL-3.0-only
// Report a problem (indexer-catalog-upkeep.md, "Owners telling us, by choice"): the address of the
// repository's "An indexer isn't working" issue form, filled in through GitHub's documented query
// parameters, one per field id (https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/creating-an-issue#creating-an-issue-from-a-url-query;
// the ids are in .github/ISSUE_TEMPLATE/indexer-broken.yml and catalog/indexers/README.md).
//
// It carries only what describes the definition and highsea: the definition's catalog id, its
// catalog name, its version, the catalog's version and channel, and highsea's version. Never the
// name the owner gave the indexer, its settings or address, the server's address, a search or the
// last error's text (which can hold an address). highsea sends nothing: the browser opens the
// form, and the owner reads it and submits it under their own GitHub account, or doesn't.

/** The form's address. */
export const ISSUE_FORM = 'https://github.com/highsea-tv/highsea-tv/issues/new'
/** The form's file in `.github/ISSUE_TEMPLATE/`. */
export const ISSUE_TEMPLATE = 'indexer-broken.yml'

export type ProblemReport = {
  /** The definition's catalog id, such as `yts`. */
  definitionId: string
  /** The definition's own name in the catalog, never the one the owner gave the indexer. */
  definitionName: string
  definitionVersion: string
  catalogVersion: string | null
  channel: 'stable' | 'beta' | null
  highseaVersion: string | null
}

/** The form's own option labels for the catalog channel dropdown. */
const CHANNEL = { stable: 'Stable', beta: 'Beta' } as const

/**
 * The prefilled form's address. Values are percent-encoded with `encodeURIComponent` (a space is
 * `%20`, never `+`, as the README's example has it); an unknown value is left out, for the owner
 * to fill in.
 */
export function reportProblemUrl(r: ProblemReport): string {
  const fields: [string, string | null][] = [
    ['template', ISSUE_TEMPLATE],
    ['title', `[Indexer] ${r.definitionName}`],
    ['indexer', r.definitionId],
    ['indexer-version', r.definitionVersion || null],
    ['catalog-version', r.catalogVersion],
    ['highsea-version', r.highseaVersion],
    ['channel', r.channel ? CHANNEL[r.channel] : null],
  ]
  const query = fields
    .filter((f): f is [string, string] => f[1] !== null && f[1] !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&')
  return `${ISSUE_FORM}?${query}`
}

/**
 * Whether an installed indexer can be reported: its definition is in highsea's own catalog. A
 * Local definition (from `/config/definitions`) or one from an extra catalog isn't highsea's to
 * fix, and one gone from the catalog has nothing to name.
 */
export const reportable = (
  ix: { local: boolean; missing: boolean },
  def: { origin: string; local: boolean } | null | undefined,
): boolean => !ix.local && !ix.missing && !!def && !def.local && def.origin === 'main'

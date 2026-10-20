// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import { definitionJsonSchema } from '../../src/indexers/json-schema.ts'
import {
  formatIssues,
  type ValidationResult,
  validateDefinition,
} from '../../src/indexers/validate.ts'
import { engineSupports } from '../../src/indexers/version.ts'
import { html, json, rss, torznab } from './examples.ts'

const errors = (r: ValidationResult) => (r.ok ? [] : r.errors.map((e) => `${e.path}: ${e.message}`))
// biome-ignore lint/suspicious/noExplicitAny: the tests bend definitions into invalid shapes
const bend = (base: object, patch: (d: any) => void) => {
  const copy = structuredClone(base)
  patch(copy)
  return validateDefinition(copy)
}

describe('validateDefinition', () => {
  test('a definition of each kind validates', () => {
    for (const d of [torznab, json, html, rss]) expect(errors(validateDefinition(d))).toEqual([])
  })

  test('defaults are filled in', () => {
    const r = validateDefinition(rss)
    if (!r.ok) throw new Error('invalid')
    expect(r.definition.login).toEqual({ method: 'none' })
    expect(r.definition.test).toEqual({ keywords: '' })
    expect(r.definition.starter).toBe(false)
  })

  test('the shape is checked', () => {
    expect(errors(bend(rss, (d) => (d.id = 'Has Spaces')))[0]).toContain('id:')
    expect(errors(bend(rss, (d) => (d.version = '1.0')))[0]).toContain('version:')
    expect(errors(bend(rss, (d) => (d.kind = 'python')))).not.toEqual([])
    expect(errors(bend(rss, (d) => (d.script = 'rm -rf /')))).not.toEqual([])
    expect(errors(bend(rss, (d) => (d.links = ['file:///etc/passwd'])))).not.toEqual([])
    expect(errors(bend(rss, (d) => delete d.license))).not.toEqual([])
    expect(errors(bend(rss, (d) => delete d.source))).not.toEqual([])
    expect(errors(bend(rss, (d) => (d.links = [])))).toEqual([
      'links: Give the site’s address in links, or a baseUrl.',
    ])
  })

  test('templates name only declared settings, known inputs and read fields', () => {
    expect(errors(bend(torznab, (d) => (d.api.apiKey = '{{ .Config.token }}')))).toEqual([
      'api.apiKey: .Config.token isn’t one of the settings.',
    ])
    expect(
      errors(bend(json, (d) => (d.search.request.query.x = '{{ .Query.Password }}')))[0],
    ).toContain('isn’t a search input')
    expect(
      errors(bend(json, (d) => (d.search.request.query.x = '{{ .Result.title }}')))[0],
    ).toContain('.Result isn’t available here')
    expect(
      errors(bend(json, (d) => (d.search.fields.download.text = '{{ .Result.download }}')))[0],
    ).toContain('must be a field read by path or selector')
    expect(errors(bend(torznab, (d) => (d.baseUrl = '{{ .Query.Keywords }}')))[0]).toContain(
      '.Query isn’t available here',
    )
  })

  test('a path stays on the base URL', () => {
    for (const path of ['https://elsewhere.test/x', '//elsewhere.test/x', 'javascript:alert(1)']) {
      expect(errors(bend(rss, (d) => (d.search.request.path = path)))[0]).toContain(
        'can’t name another host',
      )
    }
  })

  test('reserved headers are refused', () => {
    expect(errors(bend(rss, (d) => (d.search.request.headers = { Host: 'x' })))[0]).toContain(
      'set by the engine',
    )
  })

  test('fields fit their kind and results can be fetched', () => {
    expect(errors(bend(json, (d) => (d.search.fields.title = { selector: 'a' })))[0]).toContain(
      'JSON fields are read by path',
    )
    expect(errors(bend(html, (d) => (d.search.fields.title = { path: 'name' })))[0]).toContain(
      'HTML fields are read by selector',
    )
    expect(errors(bend(json, (d) => (d.search.rows = { selector: 'tr' })))[0]).toContain(
      'found by path',
    )
    expect(errors(bend(json, (d) => delete d.search.fields.title))).toContain(
      'search.fields: Every result needs a title.',
    )
    expect(errors(bend(json, (d) => delete d.search.fields.download))).toContain(
      'search.fields: Every result needs a download, magnet or infohash.',
    )
    expect(errors(bend(json, (d) => (d.search.fields.colour = { path: 'c' })))[0]).toContain(
      'helper fields',
    )
  })

  test('patterns must compile', () => {
    const r = bend(
      json,
      (d) => (d.search.fields.title.filters = [{ filter: 'replace', pattern: '(' }]),
    )
    expect(errors(r)[0]).toContain('isn’t a valid regular expression')
  })

  test('starter pack, duplicate keys and categories, selects', () => {
    expect(errors(bend(html, (d) => (d.starter = true)))).toContain(
      'starter: Only public indexers can be in the starter pack.',
    )
    expect(errors(bend(html, (d) => d.settings.push({ ...d.settings[0] })))[0]).toContain(
      'used twice',
    )
    expect(
      errors(bend(rss, (d) => d.categories.push({ id: '2040', standard: 2000 })))[0],
    ).toContain('mapped twice')
    expect(errors(bend(rss, (d) => (d.categories[0].standard = 2999)))[0]).toContain(
      'isn’t a standard category',
    )
    expect(
      errors(bend(rss, (d) => (d.settings = [{ key: 'sort', label: 'Sort', type: 'select' }]))),
    ).toContain('settings.0.options: A select needs options.')
  })

  test('every problem is reported, one per line', () => {
    const r = bend(json, (d) => {
      d.starter = true
      d.privacy = 'private'
      delete d.search.fields.title
    })
    expect(errors(r).length).toBe(2)
    if (!r.ok) expect(formatIssues(r.errors).split('\n').length).toBe(2)
  })
})

describe('engine versions', () => {
  test('same major and no newer than the engine', () => {
    expect(engineSupports('1.0.0', '1.0.0')).toBe(true)
    expect(engineSupports('1.0.0', '1.4.2')).toBe(true)
    expect(engineSupports('1.5.0', '1.4.2')).toBe(false)
    expect(engineSupports('2.0.0', '1.4.2')).toBe(false)
    expect(engineSupports('0.9.0', '1.4.2')).toBe(false)
  })
})

describe('JSON Schema', () => {
  test('exports the five kinds', () => {
    const schema = JSON.stringify(definitionJsonSchema())
    for (const kind of ['torznab', 'newznab', 'json', 'html', 'rss'])
      expect(schema).toContain(`"${kind}"`)
  })
})

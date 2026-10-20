// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import { parseTemplate, renderTemplate, TemplateError } from '../../src/indexers/template.ts'

describe('templates', () => {
  test('values, filters and conditionals', () => {
    const t =
      '/search?{{ if .Query.IMDBID }}imdb={{ .Query.IMDBID }}{{ else }}q={{ .Query.Keywords | urlencode }}{{ end }}'
    expect(renderTemplate(t, { Query: { IMDBID: 'tt0111161' } })).toBe('/search?imdb=tt0111161')
    expect(renderTemplate(t, { Query: { Keywords: 'big buck & bunny' } })).toBe(
      '/search?q=big%20buck%20%26%20bunny',
    )
  })

  test('not, default, prepend, append, replace, lower, upper, trim', () => {
    expect(renderTemplate('{{ if not .Config.x }}none{{ end }}', { Config: {} })).toBe('none')
    expect(renderTemplate('{{ .Config.x | default "25" }}', { Config: {} })).toBe('25')
    expect(
      renderTemplate('{{ .Result.id | prepend "/dl/" | append ".torrent" }}', {
        Result: { id: '7' },
      }),
    ).toBe('/dl/7.torrent')
    expect(
      renderTemplate('{{ .Query.Title | replace " " "." | lower }}', {
        Query: { Title: 'Big Buck' },
      }),
    ).toBe('big.buck')
    expect(renderTemplate('{{ .Config.k | trim | upper }}', { Config: { k: ' ab ' } })).toBe('AB')
  })

  test('missing inputs render empty and false is falsy', () => {
    expect(renderTemplate('[{{ .Config.missing }}]', {})).toBe('[]')
    expect(
      renderTemplate('{{ if .Config.on }}y{{ else }}n{{ end }}', { Config: { on: false } }),
    ).toBe('n')
  })

  test('the paths a template reads are listed', () => {
    const t = parseTemplate('{{ .Config.a }}{{ if .Query.Year }}{{ .Result.b }}{{ end }}')
    expect(t.paths).toEqual([
      { root: 'Config', key: 'a' },
      { root: 'Query', key: 'Year' },
      { root: 'Result', key: 'b' },
    ])
  })

  test('nothing outside the three roots can be named', () => {
    for (const bad of [
      '{{ .Env.HOME }}',
      '{{ process.env }}',
      '{{ .Config.a.b }}',
      '{{ .Config }}',
      '{{ call .Config.a }}',
      '{{ .Config.a | exec "ls" }}',
      '{{ range .Query.Keywords }}{{ end }}',
      '{{ .Config.a | prepend }}',
      '{{ .Config.a | prepend x }}',
      '{{ if .Config.a .Config.b }}{{ end }}',
      '{{ if .Config.a }}',
      '{{ end }}',
      '{{ else }}',
      '{{ .Config.a',
      'a }}',
      '{{ .Config.a | prepend "unclosed }}',
    ]) {
      expect(() => parseTemplate(bad), bad).toThrow(TemplateError)
    }
  })
})

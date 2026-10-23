// SPDX-License-Identifier: AGPL-3.0-only
// Definitions for the fake indexer's JSON API, HTML site and Newznab API: the kinds the catalog
// doesn't ship a definition for yet. The catalog's own generic Torznab, RSS and Internet Archive
// definitions are tested as they are, against the same fake.
import {
  type Definition,
  type DefinitionInput,
  formatIssues,
  validateDefinition,
} from '@highsea-tv/schemas/indexers'

const source = { author: 'highsea tests', documentation: 'https://fake-indexer.test/' }

function valid(input: DefinitionInput): Definition {
  const result = validateDefinition(input)
  if (!result.ok) throw new Error(`${input.id}: ${formatIssues(result.errors)}`)
  return result.definition
}

export function fakeNewznab(origin: string): Definition {
  return valid({
    id: 'fake-newznab',
    version: '1.0.0',
    minEngineVersion: '1.0.0',
    name: 'Fake Newznab',
    description: 'The fake indexer’s Newznab API.',
    kind: 'newznab',
    privacy: 'private',
    language: 'en',
    links: [`${origin}/newznab`],
    categories: [{ id: '2000', standard: 2000 }],
    settings: [{ key: 'apiKey', label: 'API key', type: 'password', required: true }],
    login: { method: 'apikey' },
    api: { path: '/api', apiKey: '{{ .Config.apiKey }}' },
    source,
    license: 'CC0-1.0',
  })
}

export function fakeJson(origin: string): Definition {
  return valid({
    id: 'fake-json',
    version: '1.0.0',
    minEngineVersion: '1.0.0',
    name: 'Fake JSON',
    description: 'The fake indexer’s JSON API.',
    kind: 'json',
    privacy: 'private',
    language: 'en',
    links: [origin],
    categories: [
      { id: '11', standard: 2040, name: 'Movies HD' },
      { id: '12', standard: 2045, name: 'Movies UHD' },
      { id: '13', standard: 2030, name: 'Movies SD' },
      { id: '20', standard: 5040, name: 'TV HD' },
    ],
    settings: [{ key: 'passkey', label: 'Passkey', type: 'password', required: true }],
    login: { method: 'apikey' },
    search: {
      request: {
        path: '/json/api/search',
        query: {
          q: '{{ .Query.Keywords }}',
          imdb: '{{ .Query.IMDBIDShort }}',
          cat: '{{ .Query.Categories }}',
          passkey: '{{ .Config.passkey }}',
        },
      },
      rows: { path: 'data.torrents' },
      fields: {
        _id: { path: 'id' },
        title: { path: 'name' },
        guid: { path: 'id', filters: [{ filter: 'prepend', value: 'fake-json:' }] },
        download: { text: '/json/download/{{ .Result._id }}?passkey={{ .Config.passkey }}' },
        size: { path: 'size', filters: [{ filter: 'size' }] },
        seeders: { path: 'seeders' },
        leechers: { path: 'leechers' },
        category: { path: 'cat' },
        published: { path: 'added', filters: [{ filter: 'date', format: 'unix' }] },
        imdbId: { path: 'imdb', optional: true },
        downloadVolumeFactor: {
          path: 'freeleech',
          optional: true,
          filters: [{ filter: 'map', values: { true: '0', false: '1' } }],
        },
      },
      supports: ['q', 'imdbid'],
    },
    errors: [{ path: 'error', auth: true }],
    rateLimit: { requests: 2, seconds: 10 },
    source,
    license: 'CC0-1.0',
  })
}

export function fakeHtml(origin: string): Definition {
  return valid({
    id: 'fake-html',
    version: '1.0.0',
    minEngineVersion: '1.0.0',
    name: 'Fake HTML',
    description: 'The fake indexer’s website, behind a sign-in form.',
    kind: 'html',
    privacy: 'private',
    language: 'en',
    links: [origin],
    categories: [
      { id: '3', standard: 2030 },
      { id: '4', standard: 2040 },
      { id: '5', standard: 2045 },
      { id: '9', standard: 5040 },
    ],
    settings: [
      { key: 'username', label: 'Username', type: 'text', required: true },
      { key: 'password', label: 'Password', type: 'password', required: true },
    ],
    login: {
      method: 'form',
      request: {
        method: 'POST',
        path: '/html/login',
        form: { username: '{{ .Config.username }}', password: '{{ .Config.password }}' },
      },
      error: { selector: '.login-error' },
      loggedIn: { selector: 'a.logout' },
    },
    search: {
      request: { path: '/html/browse', query: { search: '{{ .Query.Keywords }}' } },
      rows: { selector: 'table.torrents tr', skip: 1 },
      fields: {
        title: { selector: 'td.name a' },
        details: { selector: 'td.name a', attribute: 'href' },
        download: { selector: 'td.dl a', attribute: 'href' },
        size: { selector: 'td.size', filters: [{ filter: 'size' }] },
        seeders: { selector: 'td.seeders' },
        leechers: { selector: 'td.leechers' },
        published: { selector: 'td.added', filters: [{ filter: 'date', format: 'relative' }] },
        category: {
          selector: 'td.cat a',
          attribute: 'href',
          filters: [{ filter: 'querystring', param: 'cat' }],
        },
        downloadVolumeFactor: {
          selector: 'span.freeleech',
          optional: true,
          filters: [{ filter: 'map', values: { Freeleech: '0' } }],
        },
      },
      supports: ['q'],
    },
    source,
    license: 'CC0-1.0',
  })
}

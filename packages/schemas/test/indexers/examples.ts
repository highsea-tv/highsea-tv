// SPDX-License-Identifier: AGPL-3.0-only
// Small, valid definitions of each kind for the tests to bend.
import type { DefinitionInput } from '../../src/indexers/definition.ts'

const shared = {
  version: '1.0.0',
  minEngineVersion: '1.0.0',
  language: 'en',
  links: ['https://indexer.test/'],
  categories: [{ id: '2040', standard: 2040 }],
  source: { author: 'highsea', documentation: 'https://indexer.test/docs' },
  license: 'CC0-1.0',
}

export const torznab: DefinitionInput = {
  ...shared,
  id: 'generic-torznab',
  name: 'Torznab',
  description: 'Any Torznab feed.',
  kind: 'torznab',
  privacy: 'private',
  baseUrl: '{{ .Config.baseUrl }}',
  settings: [
    { key: 'baseUrl', label: 'Address', type: 'url', required: true },
    { key: 'apiKey', label: 'API key', type: 'password', required: true },
  ],
  login: { method: 'apikey' },
  api: { path: '/api', apiKey: '{{ .Config.apiKey }}' },
}

export const json: DefinitionInput = {
  ...shared,
  id: 'json-site',
  name: 'JSON site',
  description: 'A site with a JSON API.',
  kind: 'json',
  privacy: 'public',
  starter: true,
  search: {
    request: {
      path: '/api/search',
      query: { q: '{{ .Query.Keywords }}', imdb: '{{ .Query.IMDBID }}' },
    },
    rows: { path: 'data.results' },
    fields: {
      _id: { path: 'id' },
      title: { path: 'name' },
      download: { text: '{{ .Result._id | prepend "/dl/" }}' },
      size: { path: 'size', filters: [{ filter: 'number' }] },
      seeders: { path: 'stats.seeders', optional: true },
      published: { path: 'added', filters: [{ filter: 'date', format: 'unix' }] },
    },
    supports: ['q', 'imdbid'],
  },
  errors: [{ path: 'error', auth: false }],
}

export const html: DefinitionInput = {
  ...shared,
  id: 'html-site',
  name: 'HTML site',
  description: 'A site without an API.',
  kind: 'html',
  privacy: 'semi-private',
  settings: [
    { key: 'username', label: 'Username', type: 'text', required: true },
    { key: 'password', label: 'Password', type: 'password', required: true },
  ],
  login: {
    method: 'form',
    request: {
      method: 'POST',
      path: '/login',
      form: { user: '{{ .Config.username }}', pass: '{{ .Config.password }}' },
    },
    error: { selector: '.login-error' },
  },
  search: {
    request: { path: '/browse', query: { s: '{{ .Query.Keywords }}' } },
    rows: { selector: 'table.results tr', skip: 1 },
    fields: {
      title: { selector: 'td.name a' },
      download: { selector: 'a.dl', attribute: 'href' },
      size: { selector: 'td.size', filters: [{ filter: 'size' }] },
      category: {
        selector: 'td.cat a',
        attribute: 'href',
        filters: [{ filter: 'querystring', param: 'cat' }],
      },
    },
  },
  errors: [{ selector: '.error', auth: true }],
}

export const rss: DefinitionInput = {
  ...shared,
  id: 'rss-site',
  name: 'RSS site',
  description: 'A feed.',
  kind: 'rss',
  privacy: 'public',
  search: { request: { path: '/rss', query: { q: '{{ .Query.Keywords }}' } } },
}

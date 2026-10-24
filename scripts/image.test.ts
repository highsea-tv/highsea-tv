// SPDX-License-Identifier: AGPL-3.0-only
import { afterEach, describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { attestationProblems, type Inspect, pruneOtherLibc, publishedProblems } from './image.ts'

const dirs: string[] = []
const temp = () => {
  const dir = mkdtempSync(join(tmpdir(), 'highsea-image-'))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('pruneOtherLibc', () => {
  /** An isolated install's store: each entry holds its package and links to its dependencies. */
  function store() {
    const root = temp()
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'root', workspaces: [] }))
    const bun = join(root, 'node_modules', '.bun')
    const pkg = (entry: string, name: string, manifest: object = {}) => {
      const dir = join(bun, entry, 'node_modules', name)
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, ...manifest }))
      return dir
    }
    const link = (entry: string, name: string, target: string) => {
      const at = join(bun, entry, 'node_modules', name)
      mkdirSync(join(at, '..'), { recursive: true })
      symlinkSync(target, at)
      return at
    }
    // as sharp's musl build was on amd64: its own entry also links to its musl libvips, which
    // comes after it, so a prune that deletes as it reads trips over its own links
    pkg('@img+sharp-linuxmusl-x64@1', '@img/sharp-linuxmusl-x64', { libc: ['musl'] })
    const vips = pkg('@img+sharp-libvips-linuxmusl-x64@1', '@img/sharp-libvips-linuxmusl-x64', {
      libc: ['musl'],
    })
    link('@img+sharp-linuxmusl-x64@1', '@img/sharp-libvips-linuxmusl-x64', vips)
    const gnu = pkg('@img+sharp-linux-x64@1', '@img/sharp-linux-x64', { libc: ['glibc'] })
    pkg('sharp@1', 'sharp', { optionalDependencies: {} })
    const musl = join(
      bun,
      '@img+sharp-linuxmusl-x64@1',
      'node_modules',
      '@img',
      'sharp-linuxmusl-x64',
    )
    const toMusl = link('sharp@1', '@img/sharp-linuxmusl-x64', musl)
    const toGnu = link('sharp@1', '@img/sharp-linux-x64', gnu)
    return { root, bun, toMusl, toGnu }
  }

  test('removes the other C library’s packages and the links to them, and keeps the rest', () => {
    const { root, bun, toMusl, toGnu } = store()
    expect(pruneOtherLibc(root, 'glibc')).toEqual([
      '@img/sharp-libvips-linuxmusl-x64',
      '@img/sharp-linuxmusl-x64',
    ])
    expect(existsSync(join(bun, '@img+sharp-linuxmusl-x64@1'))).toBe(false)
    expect(existsSync(join(bun, '@img+sharp-libvips-linuxmusl-x64@1'))).toBe(false)
    expect(() => lstatSync(toMusl)).toThrow()
    expect(lstatSync(toGnu).isSymbolicLink()).toBe(true)
    expect(existsSync(join(bun, 'sharp@1', 'node_modules', 'sharp', 'package.json'))).toBe(true)
  })

  test('keeps everything for the C library the packages ask for', () => {
    const { root } = store()
    expect(pruneOtherLibc(root, 'musl')).toEqual(['@img/sharp-linux-x64'])
  })
})

describe('attestationProblems', () => {
  /** An OCI layout as BuildKit's `type=oci,tar=false` writes it, with what's asked for. */
  function layout(options: { labels?: Record<string, string>; predicates?: string[] }) {
    const root = temp()
    mkdirSync(join(root, 'blobs', 'sha256'), { recursive: true })
    const put = (value: object) => {
      const text = JSON.stringify(value)
      const hex = createHash('sha256').update(text).digest('hex')
      writeFileSync(join(root, 'blobs', 'sha256', hex), text)
      return { digest: `sha256:${hex}`, size: text.length }
    }
    const config = put({ config: { Labels: options.labels ?? {} } })
    const image = {
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
      ...put({
        config: { mediaType: 'application/vnd.oci.image.config.v1+json', ...config },
        layers: [],
      }),
      platform: { os: 'linux', architecture: 'arm64' },
    }
    const manifests: object[] = [image]
    if (options.predicates) {
      const attestation = put({
        config,
        layers: options.predicates.map((p) => ({
          mediaType: 'application/vnd.in-toto+json',
          digest: 'sha256:0',
          annotations: { 'in-toto.io/predicate-type': p },
        })),
      })
      manifests.push({
        mediaType: 'application/vnd.oci.image.manifest.v1+json',
        ...attestation,
        annotations: {
          'vnd.docker.reference.type': 'attestation-manifest',
          'vnd.docker.reference.digest': image.digest,
        },
      })
    }
    const index = put({ manifests })
    writeFileSync(
      join(root, 'index.json'),
      JSON.stringify({
        manifests: [{ mediaType: 'application/vnd.oci.image.index.v1+json', ...index }],
      }),
    )
    return root
  }
  const LABELS = {
    'org.opencontainers.image.source': 'https://github.com/highsea-tv/highsea-tv',
    'org.opencontainers.image.description': 'highsea.',
    'org.opencontainers.image.licenses': 'AGPL-3.0-only',
  }

  test('passes an image with GitHub’s labels, provenance and an SBOM', () => {
    const result = attestationProblems(
      layout({
        labels: LABELS,
        predicates: ['https://spdx.dev/Document', 'https://slsa.dev/provenance/v1'],
      }),
    )
    expect(result.problems).toEqual([])
    expect(result.found).toEqual([
      'linux/arm64: labels, https://spdx.dev/Document, https://slsa.dev/provenance/v1',
    ])
  })

  test('names each thing missing', () => {
    expect(attestationProblems(layout({})).problems).toEqual([
      'linux/arm64: no org.opencontainers.image.source label',
      'linux/arm64: no org.opencontainers.image.description label',
      'linux/arm64: no org.opencontainers.image.licenses label',
      'linux/arm64: no attestations',
    ])
    expect(
      attestationProblems(
        layout({
          labels: { ...LABELS, 'org.opencontainers.image.description': 'x'.repeat(513) },
          predicates: ['https://slsa.dev/provenance/v0.2'],
        }),
      ).problems,
    ).toEqual([
      "linux/arm64: the description is over GitHub's 512 characters",
      'linux/arm64: no SBOM',
    ])
  })
})

describe('publishedProblems', () => {
  // what `docker buildx imagetools inspect` printed for an image pushed by digest to a local
  // registry (buildx 0.37.2): the index, the attestation manifest, and the image's config
  const IMAGE = 'sha256:b8359dbf4df354c005203fc301ec6496d7e52b92a73f671bdaf03be2da1dd6ed'
  const ATTESTATION = 'sha256:ad8f30548cb88e63b932877f87f33ccc08fcd11dd634621bd1a7e893ff91aa50'
  const INDEX = 'sha256:0e8da0c9f76b55144681b39f82a4027f122b14ac58ebb4236a058c82955214bb'
  const index = {
    manifests: [
      {
        mediaType: 'application/vnd.oci.image.manifest.v1+json',
        digest: IMAGE,
        platform: { architecture: 'arm64', os: 'linux' },
      },
      {
        mediaType: 'application/vnd.oci.image.manifest.v1+json',
        digest: ATTESTATION,
        annotations: {
          'vnd.docker.reference.digest': IMAGE,
          'vnd.docker.reference.type': 'attestation-manifest',
        },
        platform: { architecture: 'unknown', os: 'unknown' },
      },
    ],
  }
  const attestation = {
    layers: ['https://spdx.dev/Document', 'https://slsa.dev/provenance/v1'].map((p) => ({
      annotations: { 'in-toto.io/predicate-type': p },
    })),
  }
  function registry(labels: Record<string, string>): { inspect: Inspect; asked: string[] } {
    const asked: string[] = []
    const inspect: Inspect = (ref, args) => {
      asked.push(`${ref} ${args.join(' ')}`)
      if (args[0] === '--format') return JSON.stringify({ config: { Labels: labels } })
      if (ref.endsWith(INDEX)) return JSON.stringify(index)
      if (ref.endsWith(ATTESTATION)) return JSON.stringify(attestation)
      throw new Error(`not in the registry: ${ref}`)
    }
    return { inspect, asked }
  }

  test('reads the pushed index, its attestations and the image’s labels from the registry', () => {
    const { inspect, asked } = registry({
      'org.opencontainers.image.source': 'https://github.com/highsea-tv/highsea-tv',
      'org.opencontainers.image.description': 'highsea.',
      'org.opencontainers.image.licenses': 'AGPL-3.0-only',
    })
    const result = publishedProblems(`ghcr.io/highsea-tv/highsea@${INDEX}`, inspect)
    expect(result).toEqual({
      problems: [],
      found: ['linux/arm64: labels, https://spdx.dev/Document, https://slsa.dev/provenance/v1'],
    })
    expect(asked).toEqual([
      `ghcr.io/highsea-tv/highsea@${INDEX} --raw`,
      `ghcr.io/highsea-tv/highsea@${IMAGE} --format {{json .Image}}`,
      `ghcr.io/highsea-tv/highsea@${ATTESTATION} --raw`,
    ])
  })

  test('names the labels a pushed image lacks', () => {
    const { inspect } = registry({})
    expect(publishedProblems(`ghcr.io/highsea-tv/highsea@${INDEX}`, inspect).problems).toEqual([
      'linux/arm64: no org.opencontainers.image.source label',
      'linux/arm64: no org.opencontainers.image.description label',
      'linux/arm64: no org.opencontainers.image.licenses label',
    ])
  })
})

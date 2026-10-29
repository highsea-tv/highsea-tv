// SPDX-License-Identifier: AGPL-3.0-only
// install.sh, served at get.highsea.tv (install-simplicity.md › C): its published SHA-256 is its
// own, it parses as POSIX sh, and the compose file it writes is the repository's compose.yaml with
// the data folder, version and NVIDIA's runtime filled in. Runs nothing that touches Docker.
import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const publicDir = join(import.meta.dir, '..', 'public')
const script = join(publicDir, 'install.sh')
const root = join(import.meta.dir, '..', '..', '..')

function sh(...args: string[]) {
  const run = Bun.spawnSync(['sh', script, ...args], { stdout: 'pipe', stderr: 'pipe' })
  return { code: run.exitCode, out: run.stdout.toString(), err: run.stderr.toString() }
}

describe('install.sh', () => {
  test('install.sh.sha256 is its checksum, in sha256sum’s format', () => {
    const sum = createHash('sha256').update(readFileSync(script)).digest('hex')
    expect(readFileSync(join(publicDir, 'install.sh.sha256'), 'utf8')).toBe(`${sum}  install.sh\n`)
  })

  test('it parses as POSIX sh', () => {
    expect(Bun.spawnSync(['sh', '-n', script]).exitCode).toBe(0)
  })

  test('its compose file is the repository’s, with the data folder filled in', () => {
    const { code, out } = sh('--print-compose', '--data', '/srv/media')
    expect(code).toBe(0)
    const repo = Bun.YAML.parse(readFileSync(join(root, 'compose.yaml'), 'utf8')) as {
      services: { highsea: { volumes: string[] } }
    }
    repo.services.highsea.volumes = repo.services.highsea.volumes.map((v) =>
      v === './data:/data' ? '/srv/media:/data' : v,
    )
    expect(Bun.YAML.parse(out)).toEqual(repo)
  })

  test('a version is pinned when asked, and the data folder defaults to one beside the settings', () => {
    const { out } = sh('--print-compose', '--version', '0.2.0', '--dir', '/srv/highsea')
    const { services } = Bun.YAML.parse(out) as {
      services: { highsea: { image: string; volumes: string[] } }
    }
    expect(services.highsea.image).toBe('ghcr.io/highsea-tv/highsea:0.2.0')
    expect(services.highsea.volumes).toContain('/srv/highsea/data:/data')
  })

  test('an unknown option is refused, and --help says what there is', () => {
    const wrong = sh('--nope')
    expect(wrong.code).toBe(1)
    expect(wrong.err).toContain("There's no option --nope")
    const help = sh('--help')
    expect(help.code).toBe(0)
    expect(help.out).toContain('--data FOLDER')
  })
})

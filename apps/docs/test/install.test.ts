// SPDX-License-Identifier: AGPL-3.0-only
// install.sh, served at get.highsea.tv (install-simplicity.md › C): its published SHA-256 is its
// own, it parses as POSIX sh, and the compose file it writes is the repository's compose.yaml with
// the data folder, version and NVIDIA's runtime filled in. Runs nothing that touches Docker.
import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
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
    const written = Bun.YAML.parse(out) as {
      services: { highsea: { hostname?: string } & Record<string, unknown> }
    }
    // the one line the repository's file can't know: this machine's name
    expect(written.services.highsea.hostname).toBeTruthy()
    delete written.services.highsea.hostname
    expect(written).toEqual(repo)
  })

  test('it writes a compose file ready for the built-in VPN, off host networking, and discovery kept', () => {
    const { services } = Bun.YAML.parse(sh('--print-compose').out) as {
      services: {
        highsea: { network_mode?: string; cap_add: string[]; ports: string[]; volumes: string[] }
      }
    }
    expect(services.highsea.network_mode).toBeUndefined()
    // Bonjour through the host's avahi, and the apps' broadcast through the published port (ADR 0020)
    expect(services.highsea.volumes).toContain('/run/dbus:/run/dbus:ro')
    expect(services.highsea.cap_add).toEqual(['NET_ADMIN'])
    expect(services.highsea.ports).toEqual([
      '3000:3000',
      '6881:6881/tcp',
      '6881:6881/udp',
      '7368:7368/udp',
    ])
  })

  test('a version is pinned when asked, and the data folder defaults to one beside the settings', () => {
    const { out } = sh('--print-compose', '--version', '0.2.0', '--dir', '/srv/highsea')
    const { services } = Bun.YAML.parse(out) as {
      services: { highsea: { image: string; volumes: string[] } }
    }
    expect(services.highsea.image).toBe('ghcr.io/highsea-tv/highsea:0.2.0')
    expect(services.highsea.volumes).toContain('/srv/highsea/data:/data')
  })

  test('on a host without avahi, it installs and starts it, so Bonjour reaches the iPhone', () => {
    const r = withStubs({ avahi: false })
    expect(r.code).toBe(0)
    expect(r.calls).toContain(
      'apt-get install -y -qq -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold avahi-daemon',
    )
    expect(r.calls).toContain('systemctl enable --now avahi-daemon')
    expect(r.out).toContain('Installed and started avahi-daemon.')
    // the compose file it wrote is the bridge, with the host's bus for avahi
    const compose = readFileSync(join(r.dir, 'compose.yaml'), 'utf8')
    expect(compose).toContain('- /run/dbus:/run/dbus:ro')
    expect(compose).not.toContain('network_mode')
    r.cleanup()
  })

  test('where avahi runs it installs nothing, and --no-avahi never does', () => {
    const running = withStubs({ avahi: true })
    expect(running.code).toBe(0)
    expect(running.calls.filter((c) => c.startsWith('apt-get'))).toEqual([])
    expect(running.out).toContain('Found avahi.')
    running.cleanup()
    const skipped = withStubs({ avahi: false }, '--no-avahi')
    expect(skipped.code).toBe(0)
    expect(skipped.calls.filter((c) => c.startsWith('apt-get'))).toEqual([])
    skipped.cleanup()
  })

  test('a failed install finishes all the same, and says the apps need the address', () => {
    const r = withStubs({ avahi: false, aptFails: true })
    expect(r.code).toBe(0)
    expect(r.out).toContain("installing or starting it didn't work")
    expect(r.out).toContain("the iPhone and Apple TV apps won't find highsea by themselves")
    expect(r.out).toContain('choose Add a server and type its address')
    expect(existsSync(join(r.dir, 'compose.yaml'))).toBe(true)
    r.cleanup()
  })

  test('a package manager it doesn’t know: nothing installed, the install finishes and says so', () => {
    const r = withStubs({ avahi: false, packages: 'none' })
    expect(r.code).toBe(0)
    expect(r.out).toContain("this installer doesn't know this system's package manager")
    expect(r.out).toContain('choose Add a server and type its address')
    expect(existsSync(join(r.dir, 'compose.yaml'))).toBe(true)
    r.cleanup()
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

const TOOLS = [
  'sh',
  'cat',
  'chown',
  'dirname',
  'env',
  'hostname',
  'id',
  'mkdir',
  'mv',
  'printf',
  'sed',
  'stat',
  'tee',
  'true',
]

/**
 * The installer run for real against stand-ins for uname, docker, sudo, pgrep, systemctl and
 * apt-get, which log each call: nothing is installed, pulled or started (--no-start).
 */
function withStubs(
  host: { avahi: boolean; aptFails?: boolean; packages?: 'apt' | 'none' },
  ...args: string[]
) {
  const root = mkdtempSync(join(tmpdir(), 'highsea-install-'))
  const bin = join(root, 'bin')
  const dir = join(root, 'highsea')
  const log = join(root, 'calls')
  const marker = join(root, 'avahi-installed')
  Bun.spawnSync(['mkdir', '-p', bin])
  writeFileSync(log, '')
  if (host.avahi) writeFileSync(marker, '')
  const stub = (name: string, body: string) => {
    writeFileSync(join(bin, name), `#!/bin/sh\necho "${name} $*" >> '${log}'\n${body}\n`)
    chmodSync(join(bin, name), 0o755)
  }
  stub('uname', 'echo Linux')
  stub('sudo', '[ "$1" = -n ] && shift; exec "$@"')
  stub(
    'docker',
    'case "$1" in info) [ "$2" = --format ] && echo Ubuntu; exit 0 ;; compose) exit 0 ;; *) exit 1 ;; esac',
  )
  stub('pgrep', `[ -e '${marker}' ]`)
  stub('systemctl', `case "$1" in is-active) [ -e '${marker}' ] ;; *) exit 0 ;; esac`)
  if (host.packages !== 'none')
    stub('apt-get', host.aptFails ? 'exit 100' : `[ "$1" = install ] && : > '${marker}'; exit 0`)
  // Only the stand-ins and the plain tools the installer uses, so a real package manager on the
  // machine running the tests (apt-get on CI's Ubuntu) is never found or run
  for (const tool of TOOLS) {
    const real = Bun.which(tool, { PATH: '/usr/bin:/bin' })
    if (real && !existsSync(join(bin, tool))) symlinkSync(real, join(bin, tool))
  }
  const run = Bun.spawnSync(['/bin/sh', script, '--dir', dir, '--no-start', ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
    env: { PATH: bin, HOME: root },
  })
  return {
    code: run.exitCode,
    out: run.stdout.toString() + run.stderr.toString(),
    calls: readFileSync(log, 'utf8').trim().split('\n'),
    dir,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  }
}

// SPDX-License-Identifier: AGPL-3.0-only
// The dependency rule (docs/plans/phase-3-server.md#standing-rules): pin exact versions released
// at least two weeks ago, with a compatible license. This prints, for each package, the highest
// stable version published before the cutoff, its date and its license.
// Usage: bun run pin hono zod next
import { execFileSync } from 'node:child_process';
const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
const semver = (v) => v.split('.').map(Number);
for (const name of process.argv.slice(2)) {
    try {
        const view = (field) => execFileSync('npm', ['view', name, field, '--json'], {
            stdio: ['ignore', 'pipe', 'ignore'],
        }).toString();
        const times = JSON.parse(view('time'));
        const license = JSON.parse(view('license') || '"UNKNOWN"');
        const [version, date] = Object.entries(times)
            .filter(([v, d]) => /^\d+\.\d+\.\d+$/.test(v) && Date.parse(d) < cutoff)
            .sort(([a], [b]) => {
            const [x, y] = [semver(a), semver(b)];
            return y[0] - x[0] || y[1] - x[1] || y[2] - x[2];
        })[0] ?? [];
        console.log(version
            ? `${name}@${version}  (${date?.slice(0, 10)}, ${license})`
            : `${name}: nothing older than two weeks`);
    }
    catch {
        console.log(`${name}: not found`);
    }
}

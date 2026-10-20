// SPDX-License-Identifier: AGPL-3.0-only
// D-pad reachability on every TV route: from the screen's initial focus, every visible focusable
// must be reachable with the arrow keys (tv.md#spatial-focus-model). Usage: bun scripts/sweeps/dpad.ts
import { launch, prototypeRoutes, screenUrl } from './lib.ts';
const browser = await launch();
const problems = [];
for (const r of [...prototypeRoutes().tv, '/tv/nowhere']) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await page.addInitScript(() => localStorage.clear());
    await page.goto(screenUrl(r));
    await page.waitForTimeout(1500);
    if (await page.getByRole('button', { name: 'Got it' }).count()) {
        await page.keyboard.press('Enter');
        await page.waitForTimeout(600);
    }
    if (r.startsWith('/tv/play'))
        await page.keyboard.press('ArrowDown');
    await page.evaluate(() => document.querySelectorAll('[data-platform="tv"] [data-focusable]').forEach((e, i) => {
        e.setAttribute('data-k', String(i));
    }));
    const start = await page.evaluate(() => document.activeElement?.getAttribute('data-k') ?? null);
    if (start === null) {
        problems.push(`${r}: no initial focus`);
        await page.close();
        continue;
    }
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length) {
        const k = queue.shift();
        for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
            await page.evaluate((k) => document.querySelector(`[data-k="${k}"]`)?.focus({
                preventScroll: true,
            }), k);
            await page.keyboard.press(key);
            await page.waitForTimeout(30);
            const n = await page.evaluate(() => document.activeElement?.getAttribute('data-k') ?? null);
            if (n !== null && !seen.has(n)) {
                seen.add(n);
                queue.push(n);
            }
        }
    }
    const missing = await page.evaluate((seen) => [...document.querySelectorAll('[data-k]')]
        .filter((e) => !seen.includes(e.getAttribute('data-k') ?? '') && e.getBoundingClientRect().width > 0)
        .map((e) => (e.getAttribute('aria-label') ?? e.textContent ?? '').trim().slice(0, 30)), [...seen]);
    if (missing.length)
        problems.push(`${r}: unreachable: ${missing.slice(0, 8).join(' | ')}`);
    await page.close();
}
await browser.close();
console.log(problems.length ? problems.join('\n') : 'clean: every TV focusable is reachable');
process.exit(problems.length ? 1 : 0);

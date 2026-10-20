// SPDX-License-Identifier: AGPL-3.0-only
// Shared pieces of the browser sweeps: the routes to visit, the browser, and page helpers.
// The routes come from the prototypes' routes test list (design/prototypes/src/routes.tsx), the
// same list happy-dom renders; Phase 3 adds the server's admin routes the same way.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
export const ROOT = join(import.meta.dir, '..', '..');
/** `screenRoutes` from the prototypes, by platform. */
export function prototypeRoutes() {
    const src = readFileSync(join(ROOT, 'design/prototypes/src/routes.tsx'), 'utf8');
    const start = src.indexOf('screenRoutes');
    const block = src.slice(start, src.indexOf('\n}', start));
    const out = {};
    for (const p of ['admin', 'web', 'mobile', 'tv']) {
        const m = block.match(new RegExp(`${p}: \\[([\\s\\S]*?)\\]`));
        out[p] = m ? [...(m[1] ?? '').matchAll(/'([^']+)'/g)].map((x) => x[1]) : [];
    }
    return out;
}
/** The widths each platform is checked at (accessibility.md, platform guides). */
export const WIDTHS = {
    admin: [1440, 390],
    web: [1440, 768, 390],
    mobile: [390],
    tv: [1600],
};
export const heightFor = (width) => (width === 390 ? 844 : 900);
/** The prototypes' dev server (`bun run prototypes`); override with SWEEP_BASE. */
export const BASE = process.env.SWEEP_BASE ?? 'http://localhost:4500';
/** A screen URL with toolbar state from the query (design/prototypes/README.md#url-parameters). */
export const screenUrl = (route, query = '') => `${BASE}/index.html?screen&time=pause&sound=off${query ? `&${query}` : ''}#${route}`;
/**
 * Chromium from Playwright's own download (`bunx playwright-core install chromium`), or the one at
 * CHROMIUM_PATH.
 */
export const launch = () => chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
/** Dismisses the client announcement modal, if it's up, and waits out its exit animation. */
export async function acknowledge(page) {
    const got = page.getByRole('button', { name: 'Got it' });
    if (await got.count()) {
        await got.first().click();
        await page.waitForTimeout(1200);
    }
}
/** Waits for running animations, so axe doesn't measure contrast on something mid-fade. */
export const settleAnimations = (page) => page.evaluate(() => Promise.race([
    Promise.all(document.getAnimations().map((a) => a.finished.catch(() => { }))),
    new Promise((r) => setTimeout(r, 3000)),
]));
const AXE = readFileSync(join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
/** WCAG 2.x A/AA violations on the page, as `rule: selector` strings. */
export async function axe(page) {
    if (!(await page.evaluate(() => 'axe' in window)))
        await page.addScriptTag({ content: AXE });
    return page.evaluate(async () => {
        const w = window;
        const r = await w.axe.run(document, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
        });
        return r.violations.flatMap((v) => v.nodes.slice(0, 2).map((n) => `${v.id}: ${n.target.join(' ')}`));
    });
}
/** How far the page is wider than the viewport, in px (0 is good). */
export const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
/** Runs `jobs` with `n` at a time. */
export async function pool(jobs, n, run) {
    const queue = [...jobs];
    await Promise.all(Array.from({ length: n }, async () => {
        while (queue.length)
            await run(queue.shift());
    }));
}

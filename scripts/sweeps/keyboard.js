// SPDX-License-Identifier: AGPL-3.0-only
// The keyboard walk: Tab through every admin, web and mobile route. Every stop must be visible
// and show a focus indicator (WCAG 2.4.7). A stop whose indicator is drawn by a descendant is
// checked by comparing the element focused and blurred. Usage: bun scripts/sweeps/keyboard.ts
import { acknowledge, heightFor, launch, pool, prototypeRoutes, screenUrl } from './lib.ts';
const routes = prototypeRoutes();
const jobs = [
    ...routes.admin.flatMap((r) => [1440, 390].map((w) => ({ r, w }))),
    ...routes.web.flatMap((r) => [1440, 390].map((w) => ({ r, w }))),
    ...routes.mobile.map((r) => ({ r, w: 390 })),
];
const browser = await launch();
const problems = [];
await pool(jobs, 5, async ({ r, w }) => {
    const page = await browser.newPage({ viewport: { width: w, height: heightFor(w) } });
    await page.addInitScript(() => localStorage.clear());
    await page.goto(screenUrl(r));
    await page.waitForTimeout(1400);
    await acknowledge(page);
    await page.evaluate(() => document.activeElement?.blur());
    const seen = new Set();
    const bad = [];
    for (let i = 0; i < 120; i++) {
        await page.keyboard.press('Tab');
        const info = await page.evaluate(() => {
            const a = document.activeElement;
            if (!a || a === document.body)
                return null;
            const cs = getComputedStyle(a);
            const box = a.getBoundingClientRect();
            a.setAttribute('data-kbk', '');
            const desc = `${a.tagName.toLowerCase()} "${(a.getAttribute('aria-label') ?? a.textContent ?? '').trim().slice(0, 30)}"`;
            return {
                key: `${desc}${Math.round(box.x)},${Math.round(box.y + scrollY)}`,
                desc,
                visible: box.width > 0 && box.height > 0 && cs.visibility !== 'hidden' && cs.opacity !== '0',
                ring: (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) ||
                    cs.boxShadow !== 'none',
            };
        });
        if (!info || seen.has(info.key))
            break;
        seen.add(info.key);
        if (!info.visible)
            bad.push(`hidden: ${info.desc}`);
        else if (!info.ring) {
            const el = page.locator('[data-kbk]');
            const box = await el.boundingBox();
            if (box) {
                const clip = {
                    x: Math.max(0, box.x - 4),
                    y: Math.max(0, box.y - 4),
                    width: box.width + 8,
                    height: box.height + 8,
                };
                await page.waitForTimeout(250);
                const on = await page.screenshot({ clip });
                await el.evaluate((e) => e.blur());
                await page.waitForTimeout(250);
                const off = await page.screenshot({ clip });
                await el.evaluate((e) => e.focus({ preventScroll: true }));
                if (on.equals(off))
                    bad.push(`no focus indicator: ${info.desc}`);
            }
        }
        await page.evaluate(() => document.querySelector('[data-kbk]')?.removeAttribute('data-kbk'));
    }
    if (bad.length)
        problems.push(`${r} ${w} (${seen.size} stops): ${[...new Set(bad)].slice(0, 6).join(' ; ')}`);
    await page.close();
});
await browser.close();
console.log(problems.length ? problems.sort().join('\n') : `clean: ${jobs.length} pages walked`);
process.exit(problems.length ? 1 : 0);

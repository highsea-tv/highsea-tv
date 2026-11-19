// SPDX-License-Identifier: AGPL-3.0-only
// What the app reports (ADR 0066): the same failure is sent once, but each failed play's session
// is a report of its own (HT-64), and one run sends ten at most.
import { describe, expect, test } from 'bun:test';
import { createReporter, REPORTS_MAX } from '../src/data/reports.ts';
const about = () => ({ app: 'ios', version: '0.4.4', device: 'iPhone' });
const play = (sessionId) => ({
    type: 'movie',
    id: 1,
    versionId: null,
    audioId: null,
    subtitleId: null,
    profile: 'ios',
    sessionId,
    decision: null,
    position: 63,
});
function reporter() {
    const sent = [];
    const r = createReporter(async (b) => void sent.push(b), about);
    return { r, sent };
}
describe('a failed play', () => {
    test('each session that fails is reported, though the error is the same', () => {
        const { r, sent } = reporter();
        for (const id of ['a', 'b', 'c'])
            r.play('Failed to load the player item', '/play/1', play(id));
        expect(sent.map((b) => b.play?.sessionId ?? null)).toEqual(['a', 'b', 'c']);
    });
    test('the same session’s failure twice is sent once', () => {
        const { r, sent } = reporter();
        r.play('Failed', '/play/1', play('a'));
        r.play('Failed', '/play/1', play('a'));
        expect(sent).toHaveLength(1);
    });
});
test('an error nothing handled is still sent once', () => {
    const { r, sent } = reporter();
    r.error(new Error('boom'), '/');
    r.error(new Error('boom'), '/');
    expect(sent).toHaveLength(1);
});
test('one run sends ten at most', () => {
    const { r, sent } = reporter();
    for (let i = 0; i < 20; i++)
        r.play('Failed', '/play/1', play(String(i)));
    expect(sent).toHaveLength(REPORTS_MAX);
});

// SPDX-License-Identifier: AGPL-3.0-only
// The native apps' server list (connectivity.md), as the desktop app's servers.rs keeps it.
import { describe, expect, test } from 'bun:test';
import { addressesOf, claim, codeFrom, forget, looksLikeCode, looksLocal, normalCode, normalize, remember, showCode, tokenKey, } from '../src/servers/index.ts';
import cases from './claim-cases.json';
describe('servers', () => {
    test('typed addresses get the scheme a home server or a domain needs', () => {
        expect(normalize('192.168.1.20:3000')).toBe('http://192.168.1.20:3000');
        expect(normalize('harbor.local:3000/')).toBe('http://harbor.local:3000');
        expect(normalize('harbor.example.net')).toBe('https://harbor.example.net');
        expect(normalize(' http://harbor.example.net ')).toBe('http://harbor.example.net');
        expect(normalize('')).toBeNull();
        expect(normalize('https://')).toBeNull();
        expect(normalize(':3000')).toBeNull();
        expect(normalize('not an address')).toBeNull();
    });
    test('local hosts', () => {
        expect(looksLocal('localhost:3000')).toBe(true);
        expect(looksLocal('[fe80::1]:3000')).toBe(true);
        expect(looksLocal('nas.example.net')).toBe(false);
    });
    test('addresses: the LAN ones, the remote one, then the one used, once each', () => {
        const info = {
            localAddresses: ['http://192.168.1.20:3000/'],
            publicUrl: 'https://harbor.example.net',
        };
        expect(addressesOf(info, 'http://192.168.1.20:3000')).toEqual([
            { url: 'http://192.168.1.20:3000', kind: 'local' },
            { url: 'https://harbor.example.net', kind: 'remote' },
        ]);
        expect(addressesOf({ localAddresses: [], publicUrl: null }, 'http://harbor.local:3000')).toEqual([{ url: 'http://harbor.local:3000', kind: 'local' }]);
    });
    test('the list keeps the most recent first, once per server', () => {
        const a = { id: 'a', name: 'A', addresses: [], lastSeen: 1 };
        const b = { id: 'b', name: 'B', addresses: [], lastSeen: 2 };
        const list = remember(remember([], a), b);
        expect(list.map((k) => k.id)).toEqual(['b', 'a']);
        expect(remember(list, { ...a, lastSeen: 3 }).map((k) => k.id)).toEqual(['a', 'b']);
        expect(forget(list, 'b').map((k) => k.id)).toEqual(['a']);
    });
    test('an address answers for one server: a new one there takes it from the old', () => {
        const local = { url: 'http://192.168.1.20:3000', kind: 'local' };
        const remote = { url: 'https://harbor.example.net', kind: 'remote' };
        const old = { id: 'old', name: 'Harbor', addresses: [local], lastSeen: 1 };
        const kept = { id: 'kept', name: 'Harbor', addresses: [local, remote], lastSeen: 1 };
        const other = { id: 'attic', name: 'Attic', addresses: [], lastSeen: 1 };
        const fresh = { id: 'new', name: 'Harbor', addresses: [{ ...local, url: `${local.url}/` }] };
        // the old entry had only that address, so it goes; one still reached elsewhere keeps the rest
        const { list, gone } = claim([old, kept, other], fresh);
        expect(gone).toEqual(['old']);
        expect(list.map((k) => [k.id, k.addresses.map((a) => a.url)])).toEqual([
            ['kept', [remote.url]],
            ['attic', []],
        ]);
        // nothing to take: the same list back
        const none = [other];
        expect(claim(none, fresh).list).toBe(none);
        // remembered, the new server is listed once, first
        const after = remember([old, other], { ...fresh, lastSeen: 2 });
        expect(after.map((k) => k.id)).toEqual(['new', 'attic']);
    });
    // the same cases run against the desktop app's claim() in Rust (servers.rs), so the two keep one rule
    test.each(cases)('claim: $name', ({ list, server, after, gone }) => {
        const out = claim(list, server);
        expect(out.gone).toEqual(gone);
        expect(out.list.map((k) => [k.id, k.addresses.map((a) => a.url)])).toEqual(after);
    });
    test('keychain keys are safe for SecureStore', () => {
        expect(tokenKey('srv_5k2m9x0q')).toBe('highsea.token.srv_5k2m9x0q');
        expect(tokenKey('a/b:c')).toBe('highsea.token.a_b_c');
    });
});
describe('pairing codes', () => {
    test('typed any way, a code compares without its dash, spaces or case', () => {
        expect(normalCode(' kq7-4pm ')).toBe('KQ74PM');
        expect(showCode('kq74pm')).toBe('KQ7-4PM');
        expect(looksLikeCode('KQ7-4P')).toBe(false);
        expect(looksLikeCode('KQ7-4PM')).toBe(true);
    });
    test('a scanned QR code: the /link address, a highsea:// link, or the code alone', () => {
        expect(codeFrom('https://harbor.example.net/link?code=KQ7-4PM')).toBe('KQ74PM');
        expect(codeFrom('highsea://link/kq7-4pm')).toBe('KQ74PM');
        expect(codeFrom('KQ7-4PM')).toBe('KQ74PM');
        expect(codeFrom('hello')).toBeNull();
    });
});

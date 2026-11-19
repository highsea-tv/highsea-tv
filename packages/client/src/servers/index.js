/** An IPv4 address, `localhost` or a `.local` name: reached on the LAN, usually without TLS. */
export function looksLocal(hostAndPort) {
    const host = hostAndPort.startsWith('[') ? hostAndPort : (hostAndPort.split(':')[0] ?? '');
    return (host === 'localhost' ||
        host.endsWith('.local') ||
        host.startsWith('[') ||
        /^\d{1,3}(\.\d{1,3}){3}$/.test(host));
}
/**
 * What someone typed, as an address: `harbor.example.net` is https, `192.168.1.20:3000` http.
 * Null when it can't be one.
 */
export function normalize(input) {
    const t = input.trim().replace(/\/+$/, '');
    if (!t || /^https?:$/.test(t))
        return null;
    const scheme = /^https?:\/\//.test(t);
    const rest = t.replace(/^https?:\/\//, '');
    if (!rest || rest.startsWith(':') || /\s/.test(rest))
        return null;
    const url = scheme ? t : `${looksLocal(rest) ? 'http' : 'https'}://${rest}`;
    try {
        if (!new URL(url).hostname)
            return null;
    }
    catch {
        return null;
    }
    return url;
}
const kindOf = (url) => looksLocal(url.replace(/^https?:\/\//, '').split('/')[0] ?? '') ? 'local' : 'remote';
/** A server's addresses from its public info: every LAN address, its remote one, then the one used. */
export function addressesOf(info, reached) {
    const out = [];
    const push = (raw, kind) => {
        const url = raw.replace(/\/+$/, '');
        if (!out.some((a) => a.url === url))
            out.push({ url, kind });
    };
    for (const a of info.localAddresses)
        push(a, 'local');
    if (info.publicUrl)
        push(info.publicUrl, 'remote');
    push(reached, kindOf(reached));
    return out;
}
const bare = (url) => url.replace(/\/+$/, '');
/**
 * An address answers for one server at a time: the SDK's ServerConnection takes a server that
 * answers with another id as not this one (packages/sdk/src/connection.ts). So the addresses
 * `server` answers at leave every other entry, and an entry left with none is gone, as when a
 * server is set up afresh where another was (the owner's decision of 2026-11-15). An old server
 * still reached at another address, its remote one, stays with that. `gone` lists the ids
 * dropped, whose tokens go too; the list comes back as it was when nothing changed.
 */
export function claim(list, server) {
    const taken = new Set(server.addresses.map((a) => bare(a.url)));
    const gone = [];
    let changed = false;
    const out = [];
    for (const k of list) {
        const left = k.id === server.id ? k.addresses : k.addresses.filter((a) => !taken.has(bare(a.url)));
        if (left.length === k.addresses.length)
            out.push(k);
        else {
            changed = true;
            if (left.length > 0)
                out.push({ ...k, addresses: left });
            else
                gone.push(k.id);
        }
    }
    return changed ? { list: out, gone } : { list, gone };
}
/**
 * The list with this server added or brought up to date, most recently reached first, its
 * addresses taken from any other entry that listed them (`claim`).
 */
export function remember(list, server) {
    return [server, ...claim(list, server).list.filter((k) => k.id !== server.id)];
}
export const forget = (list, id) => list.filter((k) => k.id !== id);
/** The keychain's key for a server's device token. */
export const tokenKey = (id) => `highsea.token.${id.replace(/[^A-Za-z0-9._-]/g, '_')}`;
// ---------------------------------------------------------------------------------------------
// Signing in a TV from another device (connectivity.md#pairing-a-tv-from-the-phone): the code's
// rules, which the phone's Connect a device and the web's /link share. The server's codes are two
// groups of three (`newCode` in @highsea-tv/auth) and it compares them without dashes or case.
/** A code as typed or scanned, without its dash or spaces, in capitals. */
export const normalCode = (code) => code.replace(/[^a-z0-9]/gi, '').toUpperCase();
/** Whether what was typed could be a code: six characters, as the TV shows (with room for eight). */
export const looksLikeCode = (code) => {
    const n = normalCode(code).length;
    return n >= 6 && n <= 8;
};
/** "KQ74PM" as the TV shows it, "KQ7-4PM". */
export const showCode = (code) => {
    const n = normalCode(code);
    return n.length === 6 ? `${n.slice(0, 3)}-${n.slice(3)}` : n;
};
/** The code in a scanned QR code: the /link address's `code`, a highsea:// link, or the code itself. */
export function codeFrom(data) {
    try {
        const url = new URL(data);
        const q = url.searchParams.get('code');
        if (q)
            return normalCode(q);
        if (url.protocol === 'highsea:')
            return normalCode(url.pathname.split('/').pop() ?? '');
    }
    catch { }
    return looksLikeCode(data) ? normalCode(data) : null;
}

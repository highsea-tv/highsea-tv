/** Reports one run of the app sends at most. */
export const REPORTS_MAX = 10;
const cut = (s, max) => String(s ?? '').slice(0, max);
function errorOf(e, componentStack) {
    const error = e instanceof Error ? e : new Error(typeof e === 'string' ? e : 'Unknown error');
    return {
        name: cut(error.name || 'Error', 100),
        message: cut(error.message, 2000),
        stack: error.stack ? cut(error.stack, 16000) : null,
        ...(componentStack ? { componentStack: cut(componentStack, 8000) } : {}),
    };
}
export function createReporter(send, about) {
    const seen = new Set();
    let sent = 0;
    function report(body) {
        try {
            const b = body();
            // a failed play is one per session: each start that fails is a report of its own (HT-64:
            // three failed starts of one film in a row left one), while the same error twice in one
            // session, or from anywhere else, is still sent once
            const key = `${b.kind}|${b.screen}|${b.error.name}|${b.error.message}|${b.play?.sessionId ?? ''}`;
            if (sent >= REPORTS_MAX || seen.has(key))
                return;
            seen.add(key);
            sent++;
            // a report that can't be sent is dropped: it's never worth an error of its own
            Promise.resolve(send(b)).catch(() => { });
        }
        catch {
            // nor is one that can't be put together
        }
    }
    return {
        /** An error nothing handled, with React's component stack when a boundary caught it. */
        error(e, screen, componentStack) {
            report(() => {
                const a = about();
                return {
                    kind: 'error',
                    app: a.app,
                    version: cut(a.version, 32),
                    device: cut(a.device, 400),
                    screen: cut(screen, 200),
                    error: errorOf(e, componentStack),
                };
            });
        },
        /** A play that failed, with the profile and the decision to reproduce it from. */
        play(message, screen, play) {
            report(() => {
                const a = about();
                return {
                    kind: 'play',
                    app: a.app,
                    version: cut(a.version, 32),
                    device: cut(a.device, 400),
                    screen: cut(screen, 200),
                    error: { name: 'PlaybackError', message: cut(message, 2000), stack: null },
                    play,
                };
            });
        },
    };
}

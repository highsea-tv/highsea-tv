import { createT, defineMessages } from '@highsea-tv/i18n';
/** One nudge of the subtitle timing, matching the admin's (movies.md#decisions). */
export const NUDGE_MS = 50;
/** The server's limit on the nudge (PlaybackPrefsPatch). */
export const NUDGE_LIMIT_MS = 60000;
/** ← and → seek this far. */
export const SEEK_S = 10;
/** Without a pointer, the scrubber's preview shows while scrubbing by key and this long after. */
export const SCRUB_MS = 1000;
/** The chrome hides after this long without input while playing. */
export const HIDE_MS = 3000;
/** Next up shows for a film's last this-many seconds, counting down to the next. */
export const NEXT_UP_S = 10;
/** The position goes to the session this often while playing (and on pause, seek and leaving). */
export const REPORT_MS = 10000;
/** The speeds the web and desktop player offer, as YouTube's and Netflix's do (player.md). */
export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
/** A stall shows Buffering only after this long, so a short one never flashes a spinner. */
export const BUFFERING_DELAY_MS = 1000;
export const initialPlayer = (at = 0) => ({
    phase: 'idle',
    method: null,
    playing: false,
    position: 0,
    duration: 0,
    waitingSince: null,
    inputAt: at,
    reportedAt: null,
    reportedPosition: null,
    nextCancelled: false,
    stoppedBy: null,
    error: null,
});
/** Inside Next up's window: the film's last NEXT_UP_S seconds. */
const nearEnd = (s) => s.duration > 0 && s.duration - s.position <= NEXT_UP_S;
export function playerReducer(s, e) {
    switch (e.type) {
        case 'start':
            return {
                ...s,
                phase: 'starting',
                method: null,
                waitingSince: e.at,
                stoppedBy: null,
                error: null,
            };
        case 'session':
            return {
                ...s,
                phase: e.method === 'unplayable' ? 'failed' : 'starting',
                method: e.method,
                position: e.start,
                duration: e.duration ?? s.duration,
                waitingSince: e.at,
                error: e.method === 'unplayable' ? 'unplayable' : null,
            };
        case 'ready':
            return s.phase === 'starting' || s.phase === 'ready'
                ? { ...s, phase: 'ready', waitingSince: null }
                : s;
        case 'play':
            return { ...s, playing: true };
        case 'pause':
            return { ...s, playing: false, waitingSince: null };
        case 'waiting':
            return s.phase === 'ready' && s.waitingSince === null ? { ...s, waitingSince: e.at } : s;
        case 'time':
            // seeking back out of the last seconds lets Next up show again at the end
            return {
                ...s,
                position: e.position,
                nextCancelled: s.nextCancelled && nearEnd({ ...s, position: e.position }),
            };
        case 'duration':
            return e.duration > 0 && Number.isFinite(e.duration) ? { ...s, duration: e.duration } : s;
        case 'seek':
            return {
                ...s,
                position: e.position,
                nextCancelled: s.nextCancelled && nearEnd({ ...s, position: e.position }),
            };
        case 'ended':
            return { ...s, playing: false, waitingSince: null, position: s.duration || s.position };
        case 'error':
            return { ...s, phase: 'failed', playing: false, waitingSince: null, error: e.message };
        case 'stopped':
            return { ...s, phase: 'stopped', playing: false, waitingSince: null, stoppedBy: e.by };
        case 'input':
            return { ...s, inputAt: e.at };
        case 'reported':
            return { ...s, reportedAt: e.at, reportedPosition: e.position };
        case 'cancel-next':
            return { ...s, nextCancelled: true };
    }
}
/**
 * What's drawn over the frame. Getting it ready is a stream the server is making (a remux or a
 * transcode) before its first segments; anything else that waits shows Buffering only after
 * BUFFERING_DELAY_MS. Next up needs a next film, and shows in the last seconds until cancelled.
 */
export function streamState(s, now, hasNext) {
    if (s.phase === 'failed')
        return 'failed';
    if (s.phase === 'stopped')
        return 'stopped';
    if (s.phase === 'idle')
        return 'normal';
    if (s.phase === 'starting' && (s.method === 'direct-stream' || s.method === 'transcode'))
        return 'preparing';
    if (s.waitingSince !== null && now - s.waitingSince >= BUFFERING_DELAY_MS)
        return 'buffering';
    if (s.phase === 'ready' && hasNext && !s.nextCancelled && nearEnd(s))
        return 'next-up';
    return 'normal';
}
/**
 * Whether the picture and its subtitle lines are drawn: not under a stream's message (HT-64). A
 * failed item's picture is the player's own placeholder (AVPlayerViewController draws a play
 * glyph), which showed through the message's scrim, as did the line showing when it failed.
 */
export const pictureShown = (s) => s.phase !== 'failed' && s.phase !== 'stopped';
/**
 * How long a stream may play, in seconds of the film, without one frame of its picture drawn
 * before it counts as a start that failed (HT-64). AVPlayer that can't show a stream's picture
 * may still play its sound, with nothing said, drawing its own placeholder where the film should
 * be: a start that looks like it worked and never leaves a report. A first frame comes well
 * within a second of playing; 8 s leaves room for a slow phone.
 */
export const NO_PICTURE_SECONDS = 8;
/** The failed play's words for the report when the picture never came (`NO_PICTURE_SECONDS`). */
export const NO_PICTURE = 'Played without a picture: no video frame was drawn';
/**
 * Whether a start has played `NO_PICTURE_SECONDS` without a frame: from where it began playing to
 * where it is. Not while it plays on another screen (AirPlay), where this device draws none.
 */
export function playsWithoutPicture(o) {
    return !o.framed && !o.external && o.from !== null && o.position - o.from >= NO_PICTURE_SECONDS;
}
/** When `streamState` may next change on its own: Buffering's delay running out. */
export function nextChange(s, now) {
    if (s.waitingSince === null)
        return null;
    const at = s.waitingSince + BUFFERING_DELAY_MS;
    return at > now ? at : null;
}
/** Next up's "Starts in N s": the film's seconds left, so it pauses when the film does. */
export const nextUpIn = (s) => Math.max(0, Math.ceil(s.duration - s.position));
/**
 * Whether the chrome shows: while paused, while waiting, while a panel is open, and for HIDE_MS
 * after the last input.
 */
export function chromeShown(s, now, panel = false) {
    return (panel ||
        !s.playing ||
        s.phase !== 'ready' ||
        s.waitingSince !== null ||
        now - s.inputAt < HIDE_MS);
}
/** Whether the position is due at the server: every REPORT_MS while playing, once it has moved. */
export function reportDue(s, now) {
    if (s.phase !== 'ready' || !s.playing)
        return false;
    if (s.reportedPosition !== null && Math.abs(s.reportedPosition - s.position) < 1)
        return false;
    return s.reportedAt === null || now - s.reportedAt >= REPORT_MS;
}
/**
 * Leaves the player for the page it was opened from, so Back there doesn't return to the player.
 * Opened directly, `to` (the title's page) takes the player's place.
 */
export const leavePlayer = (h, to) => h.canGoBack() ? h.back() : h.replace(to);
/** The next title takes the player's place, so leaving it still goes back where this began. */
export const playNext = (h, id) => h.replace(`/play/${id}`);
/** The title's page, where leaving a player opened directly goes: an episode's show. */
export const titlePage = (d, id) => d?.episode ? `/shows/${d.episode.show.id}` : `/movies/${id}`;
/** The player's title and the line under it: an episode is its show, then "S1, E1 · Pilot". */
export const titleLines = (d) => d?.episode
    ? { title: d.episode.show.title, line: `${d.episode.code} · ${d.episode.title}` }
    : { title: d?.item.title ?? '', line: null };
/** How many of More like this Next up offers when nothing comes next by itself. */
export const NEXT_CHOICES = 3;
/**
 * A film's Next up: its collection's next part (the server's `items/{type}/{id}/next`), else the
 * first of More like this, as choices.
 */
export function filmUpNext(part, collection, related) {
    if (part)
        return {
            kind: 'part',
            id: part.id,
            title: part.title,
            line: collection ?? '',
            still: part.still,
            season: null,
        };
    return related.length ? { kind: 'choices', items: related.slice(0, NEXT_CHOICES) } : null;
}
/**
 * A shuffle's Next up (player.md › Shuffle): its next item, an episode with its place as its line
 * or a film, and nothing at the end, so the last item ends as any film does. It never falls back
 * to the show's next episode or More like this.
 */
export function shuffleUpNext(item) {
    if (!item)
        return null;
    return {
        kind: 'shuffle',
        id: item.id,
        title: item.episode?.title ?? item.title,
        line: item.episode?.code ?? '',
        still: item.still,
        season: null,
    };
}
/** Whether Next up counts down to play by itself: choices wait to be picked. */
export const countsDown = (u) => !!u && u.kind !== 'choices';
/**
 * What Back does in the player (prototype-gaps.md › 1.2), as the Apple TV app does: it closes an
 * open panel, hides controls that show while playing, and otherwise leaves. It never wakes the
 * controls; paused, they always show, so Back leaves at once.
 */
export function backStep(s) {
    if (s.panel)
        return 'close-panel';
    if (s.shown && s.playing)
        return 'hide';
    return 'leave';
}
/** Seconds to seek to, kept inside the film. */
export const clampSeek = (s, to) => Math.max(0, s.duration > 0 ? Math.min(s.duration, to) : to);
/**
 * The cues showing at `t` seconds with the offset applied: a positive offset shows each cue
 * later. A cue's own times aren't changed; the player asks with the offset each time.
 */
export function cuesAt(cues, t, offsetMs) {
    const at = t - offsetMs / 1000;
    const out = [];
    for (const c of cues)
        if (c.startTime <= at && at < c.endTime)
            out.push(c.text);
    return out;
}
const VTT_TIME = /^(?:(\d+):)?(\d{2}):(\d{2})\.(\d{3})/;
/**
 * The cues of a WebVTT file, for players with no `<track>` to read it (the native apps). It
 * follows the W3C's parser where it matters here (https://www.w3.org/TR/webvtt1/#webvtt-parser-algorithm):
 * blocks are separated by blank lines, a cue's timing line holds `-->`, after an optional
 * identifier line, and a cue whose times don't parse is dropped. NOTE, STYLE and REGION blocks
 * have no `-->`, so they fall away.
 */
export function parseCues(text) {
    const seconds = (m) => Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000;
    const cues = [];
    for (const block of text.replace(/\r\n?/g, '\n').split(/\n{2,}/)) {
        const lines = block.split('\n');
        const at = lines.findIndex((l) => l.includes('-->'));
        if (at < 0 || at > 1)
            continue;
        const [from = '', to = ''] = (lines[at] ?? '').split('-->');
        const start = VTT_TIME.exec(from.trim());
        const end = VTT_TIME.exec(to.trim());
        if (!start || !end)
            continue;
        cues.push({
            startTime: seconds(start),
            endTime: seconds(end),
            text: lines.slice(at + 1).join('\n'),
        });
    }
    return cues;
}
/** Whether a subtitle's path is a rendition playlist, rather than a whole WebVTT file. */
export const isSubtitlePlaylist = (path) => /\.m3u8(?:[?#]|$)/.test(path);
/**
 * The segments of a subtitle's media playlist at `path`: each `#EXTINF` duration (RFC 8216
 * § 4.3.2.1) and the URI after it, one after another from 0. A relative URI is resolved against
 * the playlist's folder (§ 4.1, RFC 3986 § 5.2), the way the server writes them.
 */
export function subtitleSegments(playlist, path) {
    const folder = (path.split(/[?#]/)[0] ?? '').replace(/[^/]*$/, '');
    const out = [];
    let at = 0;
    let duration = null;
    for (const raw of playlist.split(/\r?\n/)) {
        const line = raw.trim();
        if (line.startsWith('#EXTINF:'))
            duration = Number.parseFloat(line.slice(8));
        else if (line && !line.startsWith('#') && duration !== null && Number.isFinite(duration)) {
            const uri = /^[a-z][a-z0-9+.-]*:|^\//i.test(line) ? line : folder + line;
            out.push({ start: at, end: at + duration, path: uri });
            at += duration;
            duration = null;
        }
    }
    return out;
}
/** How far past the playhead a subtitle's segments are loaded: a few of the picture's. */
export const SUBTITLE_AHEAD_S = 30;
/** The segments to have at `t` seconds: the one showing, and those starting within `ahead`. */
export function subtitleSegmentsFor(segments, t, ahead = SUBTITLE_AHEAD_S) {
    const out = [];
    for (let i = 0; i < segments.length; i++) {
        const s = segments[i];
        if (s.start >= t + ahead)
            break;
        if (s.end > t)
            out.push(i);
    }
    return out;
}
/**
 * Cues from another segment added to those in hand, each once, in the order they start. A cue
 * that shows across a boundary is in each segment it shows in (RFC 8216 § 3.5), the same times
 * and text: one is kept, the one already in hand, so a cue drawn keeps its identity.
 */
export function mergeCues(have, more) {
    const key = (c) => `${c.startTime}|${c.endTime}|${c.text}`;
    const seen = new Set(have.map(key));
    const added = more.filter((c) => {
        const k = key(c);
        if (seen.has(k))
            return false;
        seen.add(k);
        return true;
    });
    if (!added.length)
        return have;
    return [...have, ...added].sort((a, b) => a.startTime - b.startTime || a.endTime - b.endTime);
}
/** WebVTT cue text without its tags (`<i>`, `<c.yellow>`, `<00:01.000>`), as plain lines. */
export const cueText = (text) => text
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lrm;|&rlm;/g, '');
/** One more nudge, back to on time, or the same offset kept inside the server's limit. */
export const nudged = (offsetMs, dir) => dir === 0 ? 0 : Math.max(-NUDGE_LIMIT_MS, Math.min(NUDGE_LIMIT_MS, offsetMs + dir * NUDGE_MS));
/** The tile for `seconds` in: thumbnail `n` shows `n × interval` (TrickplayManifest). */
export function trickplayTile(m, seconds) {
    if (m.count < 1 || m.interval <= 0)
        return null;
    const n = Math.max(0, Math.min(m.count - 1, Math.floor(seconds / m.interval)));
    const perSheet = m.columns * m.rows;
    const i = n % perSheet;
    return {
        sheet: Math.floor(n / perSheet),
        x: (i % m.columns) * m.width,
        y: Math.floor(i / m.columns) * m.height,
        width: m.width,
        height: m.height,
    };
}
/**
 * The built-in profile a browser starts from, from its user agent. The desktop app names its
 * webview's (`app`), since WKWebView's user agent doesn't say Safari.
 */
export function baseProfile(userAgent, app) {
    if (app)
        return app === 'mac' ? 'desktop-macos' : app === 'windows' ? 'desktop-windows' : 'desktop-linux';
    if (/Firefox\//.test(userAgent))
        return 'web-firefox';
    if (/Safari\//.test(userAgent) && !/Chrom(e|ium)\//.test(userAgent))
        return 'web-safari';
    return /Macintosh/.test(userAgent) ? 'web-chromium-macos' : 'web-chromium';
}
/**
 * What a player that gave up says, for the failed play's report (HT-56): hls.js's error type and
 * details, its own reason or error message, the HTTP status of a failed load, and the media
 * element's own error, which holds the browser's decoder's words when an append is refused
 * because the element failed first (hls.js's `ErrorData`,
 * https://github.com/video-dev/hls.js/blob/v1.7.3/docs/API.md#errors; `MediaError.message`,
 * https://html.spec.whatwg.org/multipage/media.html#dom-mediaerror-message). Kept to a line.
 */
export function playerFailure(hls, media) {
    const parts = [
        [hls.type, hls.details].filter(Boolean).join(' '),
        hls.reason,
        hls.error?.message,
        hls.response?.code ? `HTTP ${hls.response.code}` : undefined,
        media ? `media error ${media.code}${media.message ? `: ${media.message}` : ''}` : undefined,
    ];
    const line = [...new Set(parts.filter((p) => !!p))].join('; ');
    return (line || 'media error').slice(0, 500);
}
/**
 * The report from what the browser says it decodes. `hdr` comes from `decodingInfo()` and the
 * screen (`dynamic-range: high`), which the caller asks, since they're asynchronous.
 */
export function deviceReport(base, can, hdr = { formats: [], dolbyVision: [] }) {
    const video = [];
    if (can('video/mp4; codecs="avc1.640028"'))
        video.push({
            codec: 'h264',
            profiles: ['constrained baseline', 'baseline', 'main', 'high'],
            bitDepths: [8],
        });
    const hevc = [
        can('video/mp4; codecs="hvc1.1.6.L120.90"') && 'main',
        can('video/mp4; codecs="hvc1.2.4.L120.90"') && 'main 10',
    ].filter((p) => !!p);
    if (hevc.length)
        video.push({
            codec: 'hevc',
            profiles: hevc,
            bitDepths: hevc.includes('main 10') ? [8, 10] : [8],
            // Safari plays HEVC in MP4 only with the `hvc1` sample entry (Apple's HLS authoring spec)
            ...(base === 'web-safari' || base === 'desktop-macos' ? { tag: 'hvc1' } : {}),
        });
    if (can('video/webm; codecs="vp8"'))
        video.push({ codec: 'vp8', bitDepths: [8] });
    if (can('video/webm; codecs="vp09.00.10.08"')) {
        const p2 = can('video/webm; codecs="vp09.02.10.10"');
        video.push({
            codec: 'vp9',
            profiles: p2 ? ['profile 0', 'profile 2'] : ['profile 0'],
            bitDepths: p2 ? [8, 10] : [8],
        });
    }
    if (can('video/mp4; codecs="av01.0.05M.08"'))
        video.push({
            codec: 'av1',
            profiles: ['main'],
            bitDepths: can('video/mp4; codecs="av01.0.05M.10"') ? [8, 10] : [8],
        });
    const audio = [];
    const add = (type, codec, maxChannels) => {
        if (can(type))
            audio.push({ codec, maxChannels });
    };
    add('audio/mp4; codecs="mp4a.40.2"', 'aac', 8);
    add('audio/mpeg', 'mp3', 2);
    add('audio/mp4; codecs="flac"', 'flac', 8);
    add('audio/webm; codecs="opus"', 'opus', 8);
    add('audio/webm; codecs="vorbis"', 'vorbis', 8);
    add('audio/mp4; codecs="alac"', 'alac', 8);
    add('audio/mp4; codecs="ac-3"', 'ac3', 6);
    add('audio/mp4; codecs="ec-3"', 'eac3', 8);
    return { base, video, audio, hdr };
}
/**
 * What a report depends on: the browser and its version. When it changes, the browser asks
 * again and reports again; the same browser never reports twice.
 */
export const reportKey = (userAgent) => `v1 ${userAgent}`;
// ---------------------------------------------------------------------------------------------
// The nudge's words (ADR 0021), the same on every platform.
export const playerMessages = defineMessages({
    onTime: 'On time',
    later: '+{ms} ms',
    earlier: '−{ms} ms',
    hintOnTime: 'Subtitles match the audio track’s timing.',
    hintLater: 'Subtitles appear {ms} ms later.',
    hintEarlier: 'Subtitles appear {ms} ms earlier.',
    speedNormal: 'Normal',
    speed: '{speed}×',
});
export function createPlayerText(locale = 'en') {
    const t = createT(playerMessages, locale);
    return {
        /** "+150 ms", "−50 ms", "On time". */
        offsetLabel: (ms) => ms === 0 ? t('onTime') : t(ms > 0 ? 'later' : 'earlier', { ms: Math.abs(ms) }),
        /** Plain words for the nudge's direction. */
        offsetHint: (ms) => ms === 0 ? t('hintOnTime') : t(ms > 0 ? 'hintLater' : 'hintEarlier', { ms: Math.abs(ms) }),
        /** "Normal" at 1, "1.5×" otherwise. */
        speedLabel: (x) => (x === 1 ? t('speedNormal') : t('speed', { speed: x })),
    };
}

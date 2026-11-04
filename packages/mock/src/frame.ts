// SPDX-License-Identifier: AGPL-3.0-only
// The one control channel between the prototypes' chrome and the client it frames
// (one-client-platform.md › The prototypes are the clients). The chrome (the parent page) holds
// apps/client's mock web export in an iframe and tells it the form factor's input and the
// toolbar's states; the client answers with its route, the role after a sign-in and that it's
// ready. Both sides import this module, so the messages have one shape and one check.
//
// It's the mock's, not the client's shared logic: only a client built in mock mode
// (EXPO_PUBLIC_HIGHSEA_MOCK=1) loads it, beside the transport, so a real client never listens to
// a parent page, and scripts/bundles.ts finds it in any bundle built without mock mode. It touches
// no DOM, as the transport doesn't (test/frame.test.ts): the windows are structural types.
//
// postMessage (https://html.spec.whatwg.org/multipage/web-messaging.html#posting-messages): each
// side posts to the other's origin by name, and drops a message from any other window or origin.
// The two are served from one origin (the prototypes' Vite server serves the export under /web), so
// the origin each expects is its own; an opaque origin ("null", a page opened from disk) is never
// accepted.
import { CONTROL_PLATFORMS, type Input } from '@highsea-tv/tokens'
import {
  AIRPLAYS,
  CONNECTIONS,
  DATA_STATES,
  LANS,
  PLATFORMS,
  type ProtoState,
  ROLES,
  type Role,
  STREAMS,
  THEMES,
  TIMES,
} from './state.ts'

/** The toolbar's Desktop app, its computer and its update (state.ts's WebApp, DesktopOs, AppUpdate). */
const WEB_APPS = ['browser', 'desktop'] as const satisfies readonly ProtoState['app'][]
const DESKTOP_OSES = ['mac', 'windows', 'linux'] as const satisfies readonly ProtoState['os'][]
const APP_UPDATES = ['none', 'ready'] as const satisfies readonly ProtoState['update'][]
/** The toolbar's Downloads on the phone: built (4.6), or not yet (state.ts's PhoneDownloads). */
const PHONE_DOWNLOADS = ['built', 'later'] as const satisfies readonly ProtoState['downloads'][]

/** Every message's `channel`, so the chrome's other messages (bridge.ts) never collide. */
export const FRAME_CHANNEL = 'highsea:frame'

/**
 * What the toolbar sets that the framed client follows: the transport's states and the clock, and
 * the two the client draws by, 200% text (ThemeProvider's `fontScale`) and reduced motion.
 */
export type FrameState = Pick<
  ProtoState,
  | 'data'
  | 'role'
  | 'theme'
  | 'sound'
  | 'connection'
  | 'lan'
  | 'time'
  | 'largeText'
  | 'reducedMotion'
  | 'app'
  | 'os'
  | 'update'
  | 'downloads'
  | 'stream'
  | 'airplay'
>

/** Chrome → client. `state` goes on `ready` and on every change; `navigate` on the chrome's own. */
export type FrameMessage =
  | { channel: typeof FRAME_CHANNEL; type: 'state'; input: Input; state: FrameState }
  | { channel: typeof FRAME_CHANNEL; type: 'navigate'; path: string }

/** Client → chrome. */
export type ClientMessage =
  | { channel: typeof FRAME_CHANNEL; type: 'ready' }
  /** The client's route, as Expo Router's `usePathname` gives it (without `/web`). */
  | { channel: typeof FRAME_CHANNEL; type: 'route'; path: string }
  /** Signing in as someone else changed the role (the transport's `onRole`). */
  | { channel: typeof FRAME_CHANNEL; type: 'role'; role: Role }

// ---------------------------------------------------------------- validation

type Loose = Record<string, unknown>
const isObject = (v: unknown): v is Loose => typeof v === 'object' && v !== null
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): v is T =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v)
/**
 * A route: an absolute path and its query (`/settings?section=devices`), no scheme or host, so it
 * can't send the client elsewhere. A backslash
 * is refused too, since a browser reads `/\\host` as `//host`
 * (https://url.spec.whatwg.org/#path-state), and so is any control character.
 */
const isPath = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.startsWith('/') &&
  !v.startsWith('//') &&
  v.length <= 2048 &&
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what it refuses
  !/[\\\u0000-\u001f\u007f]/.test(v)

function stateOf(v: unknown): FrameState | null {
  if (!isObject(v)) return null
  const sound = v.sound
  if (!isObject(sound) || !PLATFORMS.every((p) => typeof sound[p] === 'boolean')) return null
  if (typeof v.largeText !== 'boolean' || typeof v.reducedMotion !== 'boolean') return null
  if (
    !oneOf(v.data, DATA_STATES) ||
    !oneOf(v.role, ROLES) ||
    !oneOf(v.theme, THEMES) ||
    !oneOf(v.connection, CONNECTIONS) ||
    !oneOf(v.lan, LANS) ||
    !oneOf(v.time, TIMES) ||
    !oneOf(v.app, WEB_APPS) ||
    !oneOf(v.os, DESKTOP_OSES) ||
    !oneOf(v.update, APP_UPDATES) ||
    !oneOf(v.downloads, PHONE_DOWNLOADS) ||
    !oneOf(v.stream, STREAMS) ||
    !oneOf(v.airplay, AIRPLAYS)
  )
    return null
  return {
    data: v.data,
    role: v.role,
    theme: v.theme,
    connection: v.connection,
    lan: v.lan,
    time: v.time,
    sound: { admin: !!sound.admin, web: !!sound.web, mobile: !!sound.mobile, tv: !!sound.tv },
    largeText: v.largeText,
    reducedMotion: v.reducedMotion,
    app: v.app,
    os: v.os,
    update: v.update,
    downloads: v.downloads,
    stream: v.stream,
    airplay: v.airplay,
  }
}

/** The toolbar's state as the channel carries it: only the fields the client follows. */
export const frameStateOf = (state: ProtoState): FrameState => ({
  data: state.data,
  role: state.role,
  theme: state.theme,
  sound: { ...state.sound },
  connection: state.connection,
  lan: state.lan,
  time: state.time,
  largeText: state.largeText,
  reducedMotion: state.reducedMotion,
  app: state.app,
  os: state.os,
  update: state.update,
  downloads: state.downloads,
  stream: state.stream,
  airplay: state.airplay,
})

/** What `queryState` reads: `URLSearchParams`, or anything with its `get`. */
export type Query = { get(name: string): string | null }

/**
 * The toolbar's states from a client's address, for the client opened on its own in mock mode (the
 * sweeps open `/web/connect?ff=touch&theme=oled&text=200`): the prototypes' own parameters
 * (design/prototypes/README.md#url-parameters), only those the channel carries, each checked.
 * What's missing or not one of the values is left out, so the mock's default stands.
 */
export function queryState(query: Query): Partial<FrameState> {
  const out: Partial<FrameState> = {}
  const pick = <T extends string>(name: string, allowed: readonly T[]) => {
    const v = query.get(name)
    return oneOf(v, allowed) ? v : undefined
  }
  const data = pick('data', DATA_STATES)
  const role = pick('role', ROLES)
  const theme = pick('theme', THEMES)
  const connection = pick('connection', CONNECTIONS)
  const lan = pick('lan', LANS)
  const time = pick('time', TIMES)
  if (data) out.data = data
  if (role) out.role = role
  if (theme) out.theme = theme
  if (connection) out.connection = connection
  if (lan) out.lan = lan
  if (time) out.time = time
  // the desktop app's host compositions (`?app=desktop&os=windows&update=ready`)
  const app = pick('app', WEB_APPS)
  const os = pick('os', DESKTOP_OSES)
  const update = pick('update', APP_UPDATES)
  if (app) out.app = app
  if (os) out.os = os
  if (update) out.update = update
  // the phone's Offline before downloads (`?downloads=later`)
  const downloads = pick('downloads', PHONE_DOWNLOADS)
  if (downloads) out.downloads = downloads
  // the player's states (`?stream=failed`, `?airplay=on`)
  const stream = pick('stream', STREAMS)
  const airplay = pick('airplay', AIRPLAYS)
  if (stream) out.stream = stream
  if (airplay) out.airplay = airplay
  const sound = query.get('sound')
  if (sound === 'on' || sound === 'off') {
    const on = sound === 'on'
    out.sound = { admin: on, web: on, mobile: on, tv: on }
  }
  const text = query.get('text')
  if (text !== null) out.largeText = text === '200'
  const motion = query.get('motion')
  if (motion !== null) out.reducedMotion = motion === 'reduced'
  return out
}

/** A chrome's message, checked field by field and copied, or null for anything else. */
export function parseFrameMessage(data: unknown): FrameMessage | null {
  if (!isObject(data) || data.channel !== FRAME_CHANNEL) return null
  if (data.type === 'state') {
    const state = stateOf(data.state)
    return state && oneOf(data.input, CONTROL_PLATFORMS)
      ? { channel: FRAME_CHANNEL, type: 'state', input: data.input, state }
      : null
  }
  if (data.type === 'navigate' && isPath(data.path))
    return { channel: FRAME_CHANNEL, type: 'navigate', path: data.path }
  return null
}

/** A client's message, checked field by field and copied, or null for anything else. */
export function parseClientMessage(data: unknown): ClientMessage | null {
  if (!isObject(data) || data.channel !== FRAME_CHANNEL) return null
  if (data.type === 'ready') return { channel: FRAME_CHANNEL, type: 'ready' }
  if (data.type === 'route' && isPath(data.path))
    return { channel: FRAME_CHANNEL, type: 'route', path: data.path }
  if (data.type === 'role' && oneOf(data.role, ROLES))
    return { channel: FRAME_CHANNEL, type: 'role', role: data.role }
  return null
}

/** Whether a message's origin is the one expected: the same, and never an opaque one. */
export const sameOrigin = (origin: string, expected: string) =>
  origin === expected && origin !== 'null' && origin !== ''

// ---------------------------------------------------------------- the windows

/** A window to post to (an iframe's `contentWindow`, or `window.parent`). */
export type Target = { postMessage(message: unknown, targetOrigin: string): void }

/** What a message event carries that the channel reads. */
export type MessageLike = { data: unknown; origin: string; source: unknown }

/** The window that listens: the page's own. */
export type Listener = {
  addEventListener(type: 'message', listener: (event: MessageLike) => void): void
  removeEventListener(type: 'message', listener: (event: MessageLike) => void): void
}

/**
 * Posts one of the channel's messages to `target` at `origin`. An opaque origin can't be named as a
 * target (postMessage would throw on it), and its messages would be dropped anyway, so it posts
 * nothing.
 */
export function postFrame(
  target: Target | null | undefined,
  message: FrameMessage | ClientMessage,
  origin: string,
): void {
  if (origin === 'null' || origin === '') return
  target?.postMessage(message, origin)
}

/** Listens for messages from `source` at `origin` that `parse` accepts; returns the stop. */
export function listenFrame<M>(
  self: Listener,
  source: () => unknown,
  origin: string,
  parse: (data: unknown) => M | null,
  handle: (message: M) => void,
): () => void {
  const onMessage = (event: MessageLike) => {
    if (event.source !== source() || !sameOrigin(event.origin, origin)) return
    const message = parse(event.data)
    if (message) handle(message)
  }
  self.addEventListener('message', onMessage)
  return () => self.removeEventListener('message', onMessage)
}

// ---------------------------------------------------------------- the client's side

export type FrameLinkOptions = {
  /** The client's own window, which hears the chrome. */
  self: Listener
  /** The chrome's window: `window.parent`. */
  parent: Target
  /** The page's origin, which the chrome must share. */
  origin: string
  /** The mock transport the toolbar's states go to. */
  transport: { setState(patch: Partial<ProtoState>): void }
  /** The chrome's input and states, after the transport has them. */
  onState?: (input: Input, state: FrameState) => void
  /** The chrome navigated (its launcher, toolbar or back button). */
  onNavigate?: (path: string) => void
  /** How often `ready` is repeated until the chrome's first state arrives, in ms. */
  retry?: number
}

export type FrameLink = {
  /** Tells the chrome the client's route. */
  route(path: string): void
  /** Tells the chrome the role a sign-in changed to. */
  role(role: Role): void
  close(): void
}

/**
 * The client's end of the channel: the chrome's states go to the transport's `setState`, and the
 * client tells the chrome it's ready at once, and again every `retry` ms until the chrome's first
 * state arrives, in case the chrome wasn't listening yet.
 */
export function linkFrame(options: FrameLinkOptions): FrameLink {
  const { parent, origin } = options
  let repeat: ReturnType<typeof setInterval> | undefined
  const settled = () => {
    if (repeat !== undefined) clearInterval(repeat)
    repeat = undefined
  }
  const stop = listenFrame(
    options.self,
    () => parent,
    origin,
    parseFrameMessage,
    (message) => {
      if (message.type === 'state') {
        settled()
        options.transport.setState(message.state)
        options.onState?.(message.input, message.state)
      } else options.onNavigate?.(message.path)
    },
  )
  const send = (message: ClientMessage) => postFrame(parent, message, origin)
  const ready = () => send({ channel: FRAME_CHANNEL, type: 'ready' })
  ready()
  repeat = setInterval(ready, options.retry ?? 250)
  return {
    route: (path) => send({ channel: FRAME_CHANNEL, type: 'route', path }),
    role: (role) => send({ channel: FRAME_CHANNEL, type: 'role', role }),
    close: () => {
      settled()
      stop()
    },
  }
}

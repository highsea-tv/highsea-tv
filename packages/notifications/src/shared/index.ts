// SPDX-License-Identifier: AGPL-3.0-only
// What every channel shares (checkpoint 8b, ADR 0046):
// - the event catalogue and each event's payload, which the runtime fills from what happened;
// - the messages, from an i18n catalog in the server's language (ADR 0021), in the brief's voice:
//   "Sintel (2010) is in the library. Bluray-1080p, 1.2 GB.";
// - rendering a payload into a message: a title, a body, and the link and poster when the server's
//   external URL is known;
// - the delivery error a channel throws, which says whether the service asked to try again later.
import { bytes, retryAfterMs } from '@highsea/core'
import { schema } from '@highsea/db'
import { createT, defineMessages, type T } from '@highsea/i18n'

export const NOTIFICATION_EVENTS = schema.NOTIFICATION_EVENTS
export const CONNECTION_KINDS = schema.CONNECTION_KINDS
export type ConnectionKind = schema.ConnectionKind
export type NotificationEvent = schema.NotificationEvent

/** The movie each event is about. The URLs are absolute, and null without an external URL. */
export type MovieRef = {
  title: string
  year: number | null
  tmdbId: number
  posterUrl?: string | null
  url?: string | null
}

export type EventPayloads = {
  grabbed: { movie: MovieRef; release: string; indexer: string; size: number }
  imported: { movie: MovieRef; quality: string; size: number; upgradedFrom: string | null }
  upgraded: { movie: MovieRef; quality: string; size: number; upgradedFrom: string }
  'download-failed': { movie: MovieRef; release: string; reason: string; replaced: boolean }
  /** `language` is a name already, in the server's language ("French"). */
  'subtitle-added': { movie: MovieRef; language: string; synced: boolean }
  health: {
    level: 'warning' | 'error'
    source: string
    message: string
    cleared: boolean
    url?: string | null
  }
  update: { version: string; url?: string | null }
  /**
   * One per list run, or one when a person adds a movie: `movies` holds the first few. `source` is
   * the list's name, or the person's when `by` is `person`.
   */
  'movie-added': { count: number; source: string; movies: MovieRef[]; by?: 'list' | 'person' }
  test: Record<string, never>
}

export type MessageEvent = NotificationEvent | 'test'
export type EventPayload<E extends MessageEvent = MessageEvent> = EventPayloads[E]

/** A message as every channel sends it: rich channels use the parts, plain ones `text`. */
export type Message = {
  event: MessageEvent
  /** Colour and priority: `success` for a file in the library, `warning` and `error` for trouble. */
  level: 'info' | 'success' | 'warning' | 'error'
  title: string
  body: string
  /** `title. body`, for channels with a single line of text. */
  text: string
  url: string | null
  image: string | null
  at: number
  /** The event's payload as it came, for the webhook. */
  payload: EventPayload
}

export const notificationMessages = defineMessages({
  movie: '{title} ({year})',
  'grabbed.title': 'Grabbed {movie}',
  'grabbed.body': '{release} from {indexer}, {size}.',
  'imported.title': '{movie} is in the library',
  'imported.body': '{quality}, {size}.',
  'imported.bodyUpgrade': '{quality}, {size}. It replaced {from}.',
  'upgraded.title': '{movie} was upgraded',
  'upgraded.body': '{from} to {quality}, {size}.',
  'failed.title': '{movie} didn’t download',
  'failed.body':
    '{release}: {reason}. {replaced, select, yes {Another release was grabbed in its place.} other {Nothing else suits it yet.}}',
  'subtitle.title': '{language} subtitles for {movie}',
  'subtitle.synced': 'Synced to the audio.',
  'subtitle.unsynced': 'Kept as they came: they couldn’t be synced to the audio.',
  'health.title': '{source} needs attention',
  'health.cleared': '{source} is fine again',
  'health.clearedBody': 'This has cleared: {message}',
  'update.title': 'highsea {version} is available',
  'update.body': 'System › Updates has what’s new.',
  'added.one': '{movie} was added',
  'added.many': '{count, plural, one {# movie was} other {# movies were}} added',
  'added.body': 'From {source}.',
  'added.bodyPerson': 'Added by {source}.',
  'added.bodyNames': 'From {source}: {names}.',
  'added.bodyMore': 'From {source}: {names} and {more, plural, one {# other} other {# others}}.',
  'test.title': 'A test from highsea',
  'test.body': 'This connection works. Messages you choose will arrive here.',
  text: '{title}. {body}',
  open: 'Open in highsea',
})

export type NotificationT = T<typeof notificationMessages>

export const notificationT = (locale = 'en'): NotificationT => createT(notificationMessages, locale)

/** "Sintel (2010)", or the title alone when the year isn't known. */
export const movieName = (t: NotificationT, m: MovieRef) =>
  m.year ? t('movie', { title: m.title, year: String(m.year) }) : m.title

const NAMED = 3

/** The payload as words, in the server's language. */
export function render<E extends MessageEvent>(
  event: E,
  payload: EventPayload<E>,
  { t, now, locale = 'en' }: { t: NotificationT; now: number; locale?: string },
): Message {
  const parts = parts_(event, payload as EventPayload, t, locale)
  return {
    event,
    ...parts,
    text: t('text', { title: parts.title, body: parts.body }),
    url: parts.url ?? null,
    image: parts.image ?? null,
    at: now,
    payload,
  }
}

type Parts = Pick<Message, 'level' | 'title' | 'body'> & {
  url?: string | null
  image?: string | null
}

function parts_(
  event: MessageEvent,
  payload: EventPayload,
  t: NotificationT,
  locale: string,
): Parts {
  const of = (m: MovieRef) => ({ url: m.url ?? null, image: m.posterUrl ?? null })
  switch (event) {
    case 'grabbed': {
      const p = payload as EventPayloads['grabbed']
      return {
        level: 'info',
        title: t('grabbed.title', { movie: movieName(t, p.movie) }),
        body: t('grabbed.body', { release: p.release, indexer: p.indexer, size: bytes(p.size) }),
        ...of(p.movie),
      }
    }
    case 'imported': {
      const p = payload as EventPayloads['imported']
      const size = bytes(p.size)
      return {
        level: 'success',
        title: t('imported.title', { movie: movieName(t, p.movie) }),
        body: p.upgradedFrom
          ? t('imported.bodyUpgrade', { quality: p.quality, size, from: p.upgradedFrom })
          : t('imported.body', { quality: p.quality, size }),
        ...of(p.movie),
      }
    }
    case 'upgraded': {
      const p = payload as EventPayloads['upgraded']
      return {
        level: 'success',
        title: t('upgraded.title', { movie: movieName(t, p.movie) }),
        body: t('upgraded.body', { from: p.upgradedFrom, quality: p.quality, size: bytes(p.size) }),
        ...of(p.movie),
      }
    }
    case 'download-failed': {
      const p = payload as EventPayloads['download-failed']
      return {
        level: 'warning',
        title: t('failed.title', { movie: movieName(t, p.movie) }),
        body: t('failed.body', {
          release: p.release,
          reason: p.reason.replace(/\.$/, ''),
          replaced: p.replaced ? 'yes' : 'no',
        }),
        ...of(p.movie),
      }
    }
    case 'subtitle-added': {
      const p = payload as EventPayloads['subtitle-added']
      return {
        level: 'info',
        title: t('subtitle.title', { language: p.language, movie: movieName(t, p.movie) }),
        body: t(p.synced ? 'subtitle.synced' : 'subtitle.unsynced'),
        ...of(p.movie),
      }
    }
    case 'health': {
      const p = payload as EventPayloads['health']
      return p.cleared
        ? {
            level: 'success',
            title: t('health.cleared', { source: p.source }),
            body: t('health.clearedBody', { message: p.message }),
            url: p.url ?? null,
          }
        : {
            level: p.level,
            title: t('health.title', { source: p.source }),
            body: p.message,
            url: p.url ?? null,
          }
    }
    case 'update': {
      const p = payload as EventPayloads['update']
      return {
        level: 'info',
        title: t('update.title', { version: p.version }),
        body: t('update.body'),
        url: p.url ?? null,
      }
    }
    case 'movie-added': {
      const p = payload as EventPayloads['movie-added']
      const [first] = p.movies
      if (p.count === 1 && first)
        return {
          level: 'info',
          title: t('added.one', { movie: movieName(t, first) }),
          body:
            p.by === 'person'
              ? t('added.bodyPerson', { source: p.source })
              : t('added.body', { source: p.source }),
          ...of(first),
        }
      const named = p.movies.slice(0, NAMED).map((m) => movieName(t, m))
      const more = p.count - named.length
      const names = new Intl.ListFormat(locale, { type: 'conjunction' }).format(named)
      return {
        level: 'info',
        title: t('added.many', { count: p.count }),
        body: !named.length
          ? t('added.body', { source: p.source })
          : more > 0
            ? t('added.bodyMore', { source: p.source, names: named.join(', '), more })
            : t('added.bodyNames', { source: p.source, names }),
        image: first?.posterUrl ?? null,
      }
    }
    case 'test':
      return { level: 'info', title: t('test.title'), body: t('test.body') }
  }
}

/**
 * A send that didn't arrive. `retryable` when the service may take it later: a 429, a 5xx, or no
 * answer at all. Anything else (a 4xx) means the connection's settings are wrong, and trying again
 * won't help.
 */
export class DeliveryError extends Error {
  readonly retryable: boolean
  /** How long the service asked us to wait, when it said (`Retry-After`, or its own field). */
  readonly retryAfterMs: number | null
  readonly status: number | null
  constructor(
    message: string,
    options: { retryable: boolean; retryAfterMs?: number | null; status?: number | null },
  ) {
    super(message)
    this.name = 'DeliveryError'
    this.retryable = options.retryable
    this.retryAfterMs = options.retryAfterMs ?? null
    this.status = options.status ?? null
  }
}

export const isDeliveryError = (e: unknown): e is DeliveryError => e instanceof DeliveryError

/** Throws a DeliveryError for anything but a 2xx, with what the service said, cut short. */
export async function expectOk(
  res: Response,
  { service, now, retryAfter }: { service: string; now: number; retryAfter?: number | null },
): Promise<Response> {
  if (res.ok) return res
  const text = (await res.text().catch(() => '')).trim().slice(0, 200)
  const retryable = res.status === 429 || res.status >= 500
  return Promise.reject(
    new DeliveryError(`${service} answered ${res.status}${text ? `: ${text}` : ''}`, {
      retryable,
      retryAfterMs: retryAfter ?? retryAfterMs(res.headers.get('retry-after'), now),
      status: res.status,
    }),
  )
}

/** A fetch that never answered (DNS, refused, reset): worth trying again. */
export function unreachable(service: string, e: unknown): DeliveryError {
  if (isDeliveryError(e)) return e
  const reason = e instanceof Error ? e.message : String(e)
  return new DeliveryError(`${service} couldn’t be reached: ${reason}`, { retryable: true })
}

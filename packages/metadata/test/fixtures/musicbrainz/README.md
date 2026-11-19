# MusicBrainz and Cover Art Archive recordings

Real answers, recorded on 2026-11-19 with `bun run record:musicbrainz` in `packages/metadata`
(ADR 0065), through highsea's own client at MusicBrainz's pace of one request a second and with
its User-Agent, `highsea/<version> ( https://highsea.tv )`. MusicBrainz needs no key, so there's no
credential to keep out. MusicBrainz's core data is CC0
(https://musicbrainz.org/doc/About/Data_License); the Cover Art Archive's answers are lists of
addresses, and the images themselves are never recorded (the replay answers placeholders).

- Blur (`ba853904-…`), and the release `23a46e92-…` of *Parklife* (1994) with its release group
  `67461c8e-…` and that group's cover list.
- Pink Floyd (`83d91898-…`), and *The Wall* (1979, two discs), release group `f2026101-…`, with its
  cover list.
- `00000000-0000-4000-8000-000000000000`, an artist MusicBrainz doesn't know: its 404.

The replaying `fetch` (src/replay.ts) answers `musicbrainz.org` and `coverartarchive.org` from
these files and fails on any request it has none for, so a test never reaches the network. Run the
script with no ids to ask for every recorded request again.

// SPDX-License-Identifier: AGPL-3.0-only
// The words of a show's poster and its page (the prototype's client/show-card.tsx and
// web/, mobile/ and tv/show.tsx). The counts, years, episode codes and what Play plays are
// @highsea-tv/client/shows's (createShowsText); Information's labels are
// @highsea-tv/client/library's; the page's rows and cards share a film's (detailMessages).
import { defineMessages } from '@highsea-tv/i18n'

export const showMessages = defineMessages({
  // a poster's count of episodes left, read with its title
  posterLabel:
    '{title}, {caption}{unwatched, plural, =0 {} one {, # unwatched episode} other {, # unwatched episodes}}',
  // the head: who made it, quieter than the names it leads, as a film's "Directed by "
  createdBy: 'Created by ',
  // Play's spoken name, the place in full
  playNamed: 'Play {place}, {title}',
  resumeNamed: 'Resume {place}, {title}',
  markShow: 'Mark the show as watched',
  unmarkShow: 'Mark the show as unwatched',
  // the episodes
  episodes: 'Episodes',
  season: 'Season',
  markSeason: 'Mark season as watched',
  unmarkSeason: 'Mark season as unwatched',
  markEpisode: 'Mark as watched: {title}',
  unmarkEpisode: 'Mark as unwatched: {title}',
  playEpisode: 'Play {place}, {title}, {time}{watched, select, yes {, watched} other {}}',
  // the TV: an episode's eyebrow, and OK held on it
  episodeNumber: 'Episode {number}',
  holdForMore: '{label}. Hold OK for more.',
  markWatched: 'Mark as watched',
  markUnwatched: 'Mark as unwatched',
  fromStart: 'From the start',
  watched: 'Watched',
  // a show that isn't here (client-detail.md › Errors): the way out is Shows
  missingTitle: 'That show isn’t on this server.',
  missingBody: 'It may have been removed.',
  missingBodyWeb: 'It may have been removed. Shows lists every show you can watch.',
  shows: 'Shows',
  downloadSeason: 'Download season',
  seasonOfShow: '{season} of {show}',
  downloadEpisode: 'Download {code}',
  markFailed: 'Couldn’t change it. {message}',
})

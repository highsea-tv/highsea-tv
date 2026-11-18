// SPDX-License-Identifier: AGPL-3.0-only
// The strings of the widgets' next round (widgets-next.tsx and widgets-next-drafts.tsx), the
// prototype's review page and the widgets drafted on it.
import { defineMessages } from '@highsea-tv/i18n'

export const widgetsNext = defineMessages({
  title: 'Widgets, next round',
  description:
    'Drafts for review, on mock data. Nothing here is on the server yet, and nothing leaves this page.',

  'tab.label': 'What to show',
  'tab.drafts': 'New and redrawn',
  'tab.sizes': 'Every widget at one size',

  'sizes.width': 'Columns',
  'sizes.height': 'Rows',
  'sizes.mode': 'Mode',
  'sizes.viewing': 'Viewing',
  'sizes.customizing': 'Customizing',
  'sizes.note': 'Each widget stays within its own range of sizes.',

  'variant.label': 'Recently added',
  'variant.posters': 'Posters',
  'variant.featured': 'Featured',
  'variant.list': 'List',
  'variant.postersFor':
    'Posters: for recognising what arrived at a glance. The posters size themselves so whole rows fit, with the title and when each was added.',
  'variant.featuredFor':
    'Featured: for the newest arrival. It gets its artwork, year, runtime and versions; the ones before it are a short list.',
  'variant.listFor':
    'List: for the most titles in the least room. One line each with a small poster, the year and runtime, its versions and when it was added.',

  'pattern.label': 'Network data',
  'pattern.mixed': 'A usual evening',
  'pattern.busy': 'Everything at once',
  'pattern.idle': 'Nothing running',

  'units.temperature': 'Temperature',
  'units.celsius': '°C',
  'units.fahrenheit': '°F',
  'units.wind': 'Wind',
  'units.kmh': 'km/h',
  'units.mph': 'mph',
  'units.ms': 'm/s',

  error: 'Couldn’t load this',
  retry: 'Try again',
  more: '{count} more in {page}',
  'page.movies': 'Movies',

  'recent.title': 'Recently added',
  'recent.meta': '{count, plural, one {# this week} other {# this week}}',
  'recent.none': 'Nothing added yet',
  'recent.noneBody': 'Movies you add show here.',
  'recent.added': 'Added {when}',
  'recent.newest': 'Newest',
  'recent.minutes': '{hours}h {minutes}m',
  'recent.minutesOnly': '{minutes}m',

  'network.title': 'Network',
  'network.meta': 'last {minutes} min',
  'network.filter': 'Show',
  'network.all': 'All',
  'network.down': 'Downloads',
  'network.up': 'Uploads',
  'network.streams': 'Streams',
  'network.allCaption': 'in and out',
  'network.downCaption':
    '{count, plural, =0 {nothing downloading} one {# download} other {# downloads}}',
  'network.upCaption': '{count, plural, =0 {nothing seeding} other {# seeding}}',
  'network.streamsCaption': '{local} local · {remote} remote',
  'network.noStreams': 'nothing playing',
  'network.peak': 'peak {rate}',
  'network.ago': '{minutes} min ago',
  'network.now': 'now',
  'network.chart':
    'Over the last {minutes} minutes. Now: downloads {down}, uploads {up}, streams {streams}.',

  'clock.title': 'Date and time',
  'clock.zone': '{zone} · week {week}',
  'clock.yours': 'Your time {time}',
  'clock.label': 'The server’s time: {time}, {date}',

  'weather.title': 'Weather',
  'weather.feels': 'Feels like {temperature}',
  'weather.range': 'High {high} · Low {low}',
  'weather.wind': 'Wind {speed}',
  'weather.humidity': 'Humidity {percent}',
  'weather.updated': 'Updated {when}',
  'weather.today': 'Today',
  'weather.rain': '{percent} rain',
  'weather.days': 'The next days',
  'weather.condition.clear': 'Clear',
  'weather.condition.partly-cloudy': 'Partly cloudy',
  'weather.condition.cloudy': 'Cloudy',
  'weather.condition.fog': 'Fog',
  'weather.condition.drizzle': 'Drizzle',
  'weather.condition.rain': 'Rain',
  'weather.condition.showers': 'Showers',
  'weather.condition.thunderstorm': 'Thunderstorm',
  'weather.condition.snow': 'Snow',
})

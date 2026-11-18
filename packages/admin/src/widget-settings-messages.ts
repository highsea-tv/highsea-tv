// SPDX-License-Identifier: AGPL-3.0-only
// A3 Dashboard › a widget's settings (HT-60): the sheet where Recently added picks how it draws
// and Weather its place and units, which HT-47's review page stood in for with its own controls.
// The privacy lines say what is sent to Open-Meteo, and when, as the task asked.
import { defineMessages } from '@highsea-tv/i18n'

export const widgetSettings = defineMessages({
  title: '{widget} settings',
  description: 'Saved with your dashboard.',
  save: 'Save',
  cancel: 'Cancel',
  saved: 'Widget settings saved',
  saveError: 'Couldn’t save the widget’s settings',

  'recent.variant': 'Show as',
  'recent.featured': 'Featured',
  'recent.posters': 'Posters',
  'recent.list': 'List',
  'recent.featuredHint': 'The newest arrival with its artwork, then the ones before it.',
  'recent.postersHint': 'Posters in whole rows, each with when it was added.',
  'recent.listHint': 'The most titles in the least room, one line each.',

  'weather.place': 'Place',
  'weather.none': 'None yet. Nothing is asked for until you choose one.',
  'weather.forget': 'Forget this place',
  'weather.search': 'Search for a place',
  'weather.searchButton': 'Search',
  'weather.clear': 'Clear',
  'weather.results': 'Places found',
  'weather.noResults': 'No place by that name.',
  'weather.searchError': 'Open-Meteo’s place search can’t be reached right now.',
  'weather.coordinates': 'Or coordinates',
  'weather.latitude': 'Latitude',
  'weather.longitude': 'Longitude',
  'weather.useCoordinates': 'Use these',
  'weather.badCoordinates': 'Latitude runs from -90 to 90, longitude from -180 to 180.',
  'weather.coordinatesName': '{latitude}, {longitude}',
  'weather.temperature': 'Temperature',
  'weather.celsius': '°C',
  'weather.fahrenheit': '°F',
  'weather.wind': 'Wind',
  'weather.kmh': 'km/h',
  'weather.mph': 'mph',
  'weather.ms': 'm/s',
  'weather.privacy':
    'highsea’s server asks Open-Meteo for the weather at this place’s coordinates, rounded to about a kilometre, at most every 15 minutes while a dashboard shows it. A search sends what you type to Open-Meteo’s place search. Your browser’s location is never used.',
})

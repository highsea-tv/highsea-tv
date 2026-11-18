// SPDX-License-Identifier: AGPL-3.0-only
// The strings of the widgets' review page (widgets-next.tsx): every widget at one size.
import { defineMessages } from '@highsea-tv/i18n'

export const widgetsNext = defineMessages({
  title: 'Widgets at every size',
  description:
    'Every dashboard widget at one size, on mock data, so one that cuts its content off shows.',

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

  'place.label': 'Weather',
  'place.set': 'A place',
  'place.none': 'No place',
})

// SPDX-License-Identifier: AGPL-3.0-only
// C6 Search, TV (client-search.md#tv, the prototype's tv/search.tsx): an on-screen keyboard on the
// left and results on the right, updating as each letter lands. Right from the keyboard enters the
// results and Left comes back, each to where focus last was. The keys are letters in alphabetical
// rows of seven, with numbers and symbols on a second layout behind &123, so nothing moves between
// them. Typing never moves focus off the keys; picking a suggestion does go into the results, since
// its button goes away; a person opens their page. Results come in a section per kind, the best-matching first;
// kinds the TV doesn't show (`discover`) are skipped, as the API asks. The query lives in this
// screen, which stays mounted under a result, so Back finds it as it was.
import type { SearchSection } from '@highsea-tv/api-contract'
import { useSearch } from '@highsea-tv/client/data'
import { useT } from '@highsea-tv/i18n/react'
import { useFormat } from '@highsea-tv/native/format'
import { useMedia } from '@highsea-tv/native/media'
import { useServers } from '@highsea-tv/native/servers'
import { Button, Text, tokens, useControl, useTheme } from '@highsea-tv/ui'
import { focusOn, TvGrid, TvKey, TvPage, TvTile, type ViewHandle } from '@highsea-tv/ui/tv'
import { router } from 'expo-router'
import { type Ref, useCallback, useEffect, useRef, useState } from 'react'
import { TVFocusGuideView, useWindowDimensions, View } from 'react-native'
import { TvHead } from '../kit.tsx'
import { search as messages } from '../messages.ts'

const tv = tokens.tv

const LAYOUTS = {
  letters: "abcdefghijklmnopqrstuvwxyz-'".split(''),
  // digits as a keypad on the left (1 2 3 / 4 5 6 / 7 8 9 / * 0 #), symbols beside them
  symbols: "123&.,:456!?'-789()/+*0#$%@=".split(''),
} as const

/** Quick picks for an empty search, as the web and the phone have them. */
const SUGGESTIONS = ['Comedy', 'Horror', 'Animation', 'Science Fiction', 'Drama']

const KINDS = ['movies', 'collections', 'people'] as const
type Shown = Extract<SearchSection, { kind: (typeof KINDS)[number] }>
const shown = (s: SearchSection): s is Shown => (KINDS as readonly string[]).includes(s.kind)

/** The keyboard's column and the gap beside it, in units. */
const KEYS = 30
const GAP = 3

export default function Search() {
  const t = useT(messages)
  const theme = useTheme()
  const u = theme.u
  const field = useControl()
  const { width } = useWindowDimensions()
  const name = useServers().current?.server.name ?? ''
  const [q, setQ] = useState('')
  const [layout, setLayout] = useState<keyof typeof LAYOUTS>('letters')
  const live = useSearch(q)
  // a suggestion's button goes with its results, so focus follows it into the new
  // ones, or to the keys when there are none; typing never moves it. Until they come, what was
  // showing stays and keeps focus: were the button to go first, tvOS would hand focus to the root's
  // preferred view (the first key) on the way, and the keys would remember it. The render that
  // settles the query still has the old results (useQuery resets in its effect), so new ones are
  // told apart from those by identity.
  const [held, setHeld] = useState<{ search: typeof live; done: unknown } | null>(null)
  const [arrive, setArrive] = useState(false)
  const done = (r: typeof live.results) =>
    r.status === 'success' ? r.data : r.status === 'error' ? r.error : undefined
  const now = done(live.results)
  const fresh = held !== null && now !== undefined && now !== held.done && live.settled === q
  useEffect(() => {
    if (!fresh) return
    setHeld(null)
    setArrive(true)
  }, [fresh])
  const { results, settled } = held?.search ?? live
  const sections = results.data?.sections.filter(shown)

  // the first key, kept as state too: the navigation's Down goes to it
  const firstKey = useRef<ViewHandle>(null)
  const [down, setDown] = useState<ViewHandle | null>(null)
  const keyOne = useCallback((node: ViewHandle | null) => {
    firstKey.current = node
    setDown(node)
  }, [])
  // focus starts on the first key as the screen opens, and only then: a preferred view takes focus
  // as it appears, so the other layout's first key would take it from &123. It stays preferred until
  // a key has focus, as Settings' first section does: dropped in an effect, it went before tvOS's
  // focus update for the new screen ran
  const [opening, setOpening] = useState(true)
  const opened = () => setOpening(false)
  const firstResult = useRef<ViewHandle>(null)
  useEffect(() => {
    if (!arrive) return
    // the first result took focus as it appeared (`preferred` for that render only, since a
    // preferred view takes focus back whenever it's laid out again); with none, the keys do
    if (!firstResult.current) focusOn(firstKey.current)
    setArrive(false)
  }, [arrive])
  const pick = (text: string) => {
    const next = text.toLowerCase()
    // the same query again fetches nothing new: its results are already there
    if (next === q) return focusOn(firstResult.current)
    setHeld({ search: live, done: now })
    setQ(next)
  }

  const keyWidth = (KEYS - 6 * 0.5) / 7
  const actionWidth = (KEYS - 3 * 0.5) / 4
  const span = width / u - 2 * tv.safe.x - KEYS - GAP
  return (
    <View style={{ flex: 1 }}>
      <TvHead down={down} />
      {/* the title across both columns, as the other screens head theirs, so the field and the
      results start level under it */}
      <Text
        variant="heroTitle"
        size={2.6}
        accessibilityRole="header"
        style={{ paddingHorizontal: tv.safe.x * u, paddingTop: 1.6 * u }}
      >
        {t('title')}
      </Text>
      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          gap: GAP * u,
          paddingHorizontal: tv.safe.x * u,
          paddingTop: 1.6 * u,
          paddingBottom: tv.safe.y * u,
        }}
      >
        <View style={{ width: KEYS * u, gap: 1.2 * u }}>
          <View
            accessibilityLabel={t('title')}
            accessibilityLiveRegion="polite"
            style={{
              // a text field at the TV rule (controls.md), shown rather than typed into: the
              // on-screen keys fill it, so it's no TextInput and never brings up tvOS's keyboard
              height: field.height,
              flexDirection: 'row',
              alignItems: 'center',
              borderRadius: field.radius,
              borderWidth: 0.15 * u,
              borderColor: theme.colors.text,
              paddingHorizontal: field.fieldPad,
            }}
          >
            <Text variant="button" weight={400} color={q ? 'text' : 'text-3'} numberOfLines={1}>
              {q || t('placeholder')}
            </Text>
            <Text variant="button" weight={400} color="text-3">
              |
            </Text>
          </View>
          {/* the keys and their actions are one group: Left from the results comes back to the
          key last used */}
          <TVFocusGuideView autoFocus style={{ gap: 1.2 * u }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 0.5 * u }}>
              {LAYOUTS[layout].map((k, i) => (
                <TvKey
                  key={`${layout}:${k}`}
                  ref={i === 0 ? keyOne : undefined}
                  preferred={opening && i === 0}
                  onFocus={opened}
                  width={keyWidth * u}
                  onPress={() => setQ((v) => v + k)}
                >
                  {k}
                </TvKey>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 0.5 * u }}>
              <TvKey
                width={actionWidth * u}
                onFocus={opened}
                label={layout === 'letters' ? t('symbols') : t('letters')}
                onPress={() => setLayout((l) => (l === 'letters' ? 'symbols' : 'letters'))}
              >
                {layout === 'letters' ? t('symbolsKey') : t('lettersKey')}
              </TvKey>
              <TvKey width={actionWidth * u} onFocus={opened} onPress={() => setQ((v) => `${v} `)}>
                {t('space')}
              </TvKey>
              <TvKey
                width={actionWidth * u}
                onFocus={opened}
                onPress={() => setQ((v) => v.slice(0, -1))}
              >
                {t('delete')}
              </TvKey>
              <TvKey width={actionWidth * u} onFocus={opened} onPress={() => setQ('')}>
                {t('clear')}
              </TvKey>
            </View>
          </TVFocusGuideView>
        </View>
        {/* the whole column takes Right from any key; the clip reaches past it by the focus lift,
        so a lifted poster isn't cut */}
        <TVFocusGuideView
          autoFocus
          style={{ flex: 1, margin: -2 * u, padding: 2 * u, overflow: 'hidden' }}
        >
          {!settled.trim() ? (
            <View style={{ gap: 1 * u }}>
              <Text variant="rowTitle" accessibilityRole="header">
                {t('try')}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 0.8 * u }}>
                {SUGGESTIONS.map((s, i) => (
                  <Button
                    variant="overlay"
                    key={s}
                    ref={i === 0 ? firstResult : undefined}
                    onPress={() => pick(s)}
                  >
                    {s}
                  </Button>
                ))}
              </View>
            </View>
          ) : results.status === 'error' ? (
            <Text variant="synopsis" color="text-2" accessibilityRole="alert">
              {t('failed', { message: results.error.message })}
            </Text>
          ) : !sections ? (
            <Text variant="meta" color="text-3">
              {t('searching')}
            </Text>
          ) : sections.length === 0 ? (
            <Text variant="synopsis" color="text-2">
              {t('nothing', { name, query: settled.trim() })}
            </Text>
          ) : (
            // the page reaches past the column by the lift too, and fades only within that
            <View style={{ flex: 1, margin: -2 * u }}>
              <TvPage keep={0.4} fade={2}>
                <View style={{ padding: 2 * u, gap: 2.4 * u }}>
                  {sections.map((section, i) => (
                    <View
                      key={section.kind}
                      accessibilityLabel={t(section.kind)}
                      style={{ gap: 0.8 * u }}
                    >
                      <Text variant="rowTitle" accessibilityRole="header">
                        {t(section.kind)}
                      </Text>
                      <Results
                        section={section}
                        span={span}
                        first={i === 0 ? firstResult : undefined}
                        arrive={i === 0 && arrive}
                      />
                    </View>
                  ))}
                </View>
              </TvPage>
            </View>
          )}
        </TVFocusGuideView>
      </View>
    </View>
  )
}

function Results({
  section,
  span,
  first,
  arrive,
}: {
  section: Shown
  span: number
  first?: Ref<ViewHandle>
  /** The results just came for a pick: the first takes focus as it appears. */
  arrive: boolean
}) {
  const f = useFormat()
  const u = useTheme().u
  const media = useMedia()
  switch (section.kind) {
    case 'movies':
      return (
        <TvGrid
          items={section.items}
          keyOf={(m) => m.id}
          columns={5}
          span={span}
          render={(m, at) => (
            <TvTile
              ref={at.index === 0 ? first : undefined}
              preferred={arrive && at.index === 0}
              title={m.title}
              caption={m.year ? String(m.year) : ''}
              src={media(m.art.poster)}
              width={at.width}
              progress={m.progress}
              onPress={() => router.push(`/movies/${m.id}`)}
              onPlay={() => router.push(`/play/${m.id}`)}
            />
          )}
        />
      )
    case 'collections':
      return (
        <TvGrid
          items={section.items}
          keyOf={(c) => c.id}
          columns={5}
          span={span}
          render={(c, at) => (
            <TvTile
              ref={at.index === 0 ? first : undefined}
              preferred={arrive && at.index === 0}
              title={c.name}
              caption={f.caption(c)}
              src={media(c.art.poster)}
              width={at.width}
              onPress={() => router.push(`/collections/${c.id}`)}
            />
          )}
        />
      )
    case 'people':
      return (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 0.8 * u }}>
          {section.items.map((p, i) => (
            <Button
              variant="overlay"
              key={p.id}
              ref={i === 0 ? first : undefined}
              hasTVPreferredFocus={arrive && i === 0}
              image={media(p.photo) ?? null}
              accessibilityLabel={`${p.name}, ${f.moviesHere(p.titles)}`}
              onPress={() => router.push(`/people/${p.id}`)}
            >
              {p.name}
            </Button>
          ))}
        </View>
      )
  }
}

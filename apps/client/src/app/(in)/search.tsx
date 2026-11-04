// SPDX-License-Identifier: AGPL-3.0-only
// C6 Search (client-search.md), one screen for every client: the field, quick picks while it's
// empty, then a section per kind as the text settles (about 150 ms after the last letter), the
// best-matching kind first. Films only for now (one-client-platform-b.md › B1): Movies,
// Collections and People, from @highsea-tv/client/films; shows and music come in B3, and kinds no
// client shows yet (`discover`) are skipped, as the API asks. Each result opens its page
// (`/movies/{id}`, `/collections/{id}`, `/people/{id}`). The text is in the address as it settles
// (`/search?q=…`, ../../search/query.ts), so a search can be linked, and Back from a result finds
// it as it was. Two compositions, since the TV's is a different screen:
// - touch and a pointer, one page laid out by the form factor, from the prototypes' mobile/more.tsx
//   and web/search.tsx: on touch the large title, the field, the picks as chips, Movies three a
//   row, Collections and People in rows that scroll sideways (People as portraits); with a pointer
//   the field alone at the top (focused on arrival), Try over the picks, Movies and Collections in
//   a grid of posters at least 9rem wide, People as links with their photo, name and how many
//   films they're in here, and the line saying what Search covers at the foot. The grid, the film
//   posters and the films' words are the library's (../../library/parts.tsx);
// - the TV, from the prototype's tv/search.tsx: the on-screen keyboard down the left
//   (letters in alphabetical rows of seven, numbers and symbols behind &123, then &123, Space,
//   Delete and Clear) and the results beside it, five a row. Typing never moves focus off the
//   keys; a quick pick hands it to the first result, since its button goes away (or back to the
//   keys when there are none).
import type { SearchSection } from '@highsea-tv/api-contract'
import { isShownKind, SEARCH_SUGGESTIONS, type SearchKind } from '@highsea-tv/client/films'
import { useT } from '@highsea-tv/i18n/react'
import { useFormat } from '@highsea-tv/native/format'
import { useMedia } from '@highsea-tv/native/media'
import { web } from '@highsea-tv/tokens'
import {
  Button,
  Chip,
  fieldBox,
  HiddenHeading,
  Icon,
  PersonTile,
  ScrollView,
  SearchField,
  SectionHeading,
  Text,
  tokens,
  useControl,
  useFormFactor,
  usePageGutter,
  usePosterWidth,
  useTheme,
} from '@highsea-tv/ui'
import { FocusGuide, focusOn, TvGrid, TvKey, TvPage, type ViewHandle } from '@highsea-tv/ui/tv'
import { type Href, router } from 'expo-router'
import { type ReactNode, type Ref, useCallback, useEffect, useRef, useState } from 'react'
import { useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFilmsText } from '../../films.ts'
import { TouchHeader, useHeadDown, useServerName } from '../../kit.tsx'
import {
  LibraryCollectionTile,
  LibraryGrid,
  LibraryPoster,
  LibraryTitle,
} from '../../library/parts.tsx'
import { TV_LIBRARY } from '../../library/sizes.ts'
import { useAnnounceResults } from '../../search/announce.ts'
import { searchMessages } from '../../search/messages.ts'
import { useSearchText } from '../../search/query.ts'

const { space } = tokens
const tv = tokens.tv

type Shown = Extract<SearchSection, { kind: SearchKind }>
type Search = ReturnType<typeof useSearchText>

const open = (path: string) => router.push(path as Href)

/** The sections a client shows, in the server's order. */
const shownOf = (search: Search) =>
  search.results.data?.sections.filter(isShownKind) as Shown[] | undefined

/** What VoiceOver says as results come: how many, or that nothing matched. */
function useAnnounced(sections: Shown[] | undefined, nothing: string) {
  const t = useT(searchMessages)
  const count = sections?.reduce((n, s) => n + s.items.length, 0) ?? 0
  useAnnounceResults(sections, sections ? (count ? t('found', { count }) : nothing) : null)
}

export default function SearchScreen() {
  const search = useSearchText()
  if (useFormFactor().input === 'tv') return <TvSearch search={search} />
  return <PageSearch search={search} />
}

// ---------------------------------------------------------------- touch and a pointer

function PageSearch({ search }: { search: Search }) {
  const t = useT(searchMessages)
  const words = useFilmsText().search
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const touch = useFormFactor().input === 'touch'
  const gutter = usePageGutter()
  const name = useServerName()
  const { q, setQ, results, settled } = search
  const sections = shownOf(search)
  const query = settled.trim()
  // the rows that scroll sideways on touch reach the screen's edges, so the page pads the rest
  const inset = { paddingHorizontal: touch ? gutter : 0 }
  const nothing = t(touch ? 'nothing' : 'nothingHint', { name, query })
  useAnnounced(sections, nothing)
  /** A line where the results go: what went wrong (an alert), that they're on their way, or none. */
  const status = (text: string, kind: 'failed' | 'busy' | 'nothing') => (
    <Text
      variant={kind === 'busy' ? 'caption' : 'body'}
      color={kind === 'failed' ? 'badge-danger' : kind === 'busy' ? 'text-3' : 'text-2'}
      accessibilityRole={kind === 'failed' ? 'alert' : undefined}
      // "Searching…" says the results are on their way (aria-busy on the web, busy for VoiceOver)
      aria-busy={kind === 'busy' || undefined}
      accessibilityState={kind === 'busy' ? { busy: true } : undefined}
      style={inset}
    >
      {text}
    </Text>
  )
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={{
        width: '100%',
        maxWidth: touch ? undefined : web.maxWidth,
        alignSelf: 'center',
        // on touch the phone's header heads the page, under the safe area's top
        paddingTop: touch ? insets.top : space['8'],
        paddingBottom: space['8'],
        paddingHorizontal: touch ? 0 : gutter,
        gap: touch ? space['4'] : space['8'],
      }}
    >
      {/* the phone's header, as every destination's (mobile/more.tsx draws the shell's Header) */}
      {touch ? <TouchHeader title={t('title')} /> : null}
      <View style={[inset, { gap: space['4'] }]}>
        {touch ? null : (
          // a pointer's page draws no title, as the prototype's: the page's h1 is only read
          <HiddenHeading>{t('title')}</HiddenHeading>
        )}
        <SearchField
          value={q}
          onChangeText={setQ}
          placeholder={words.placeholder}
          label={words.field}
          clearLabel={t('clear')}
          autoCorrect={false}
          autoCapitalize="none"
          // a search field, as the prototype's <input type="search"> is read
          role="searchbox"
          // a pointer's page is the field's: it takes the keyboard as Search opens (the
          // prototype's autoFocus); the phone's keyboard waits for a tap, as the prototype's does
          autoFocus={!touch}
        />
      </View>
      {!query ? (
        <View role="region" accessibilityLabel={t('try')} style={[inset, { gap: space['3'] }]}>
          {touch ? null : (
            // the prototype's <section aria-label="Try"> and its <h2>
            <Text variant="label" color="text-3" accessibilityRole="header" aria-level={2}>
              {t('try')}
            </Text>
          )}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space['2'] }}>
            {SEARCH_SUGGESTIONS.map((s) => (
              <Chip key={s} onPress={() => setQ(s)}>
                {s}
              </Chip>
            ))}
          </View>
        </View>
      ) : results.status === 'error' ? (
        status(t('failed', { message: results.error.message }), 'failed')
      ) : !sections ? (
        status(t('searching'), 'busy')
      ) : sections.length === 0 ? (
        status(nothing, 'nothing')
      ) : (
        <View accessibilityLiveRegion="polite" style={{ gap: touch ? space['6'] : space['8'] }}>
          {sections.map((section) => (
            <View
              key={section.kind}
              // a landmark on the web, named by its kind (react-native-web draws `region` as <section>)
              role="region"
              accessibilityLabel={words.kind(section.kind)}
              style={{ gap: touch ? space['2'] + space['0.5'] : space['3'] }}
            >
              <SectionHeading
                level={2}
                title={words.kind(section.kind)}
                count={section.items.length}
                inset={touch ? gutter : 0}
              />
              <PageResults section={section} touch={touch} gutter={gutter} />
            </View>
          ))}
        </View>
      )}
      {touch ? null : (
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: space['1'] + space['0.5'] }}
        >
          <Icon name="info" size={tokens.icon.size.sm} color="text-3" />
          <Text variant="caption" color="text-3" style={{ flexShrink: 1 }}>
            {t('footer', { name })}
          </Text>
        </View>
      )}
    </ScrollView>
  )
}

function PageResults({
  section,
  touch,
  gutter,
}: {
  section: Shown
  touch: boolean
  gutter: number
}) {
  const t = useT(searchMessages)
  const f = useFormat()
  const media = useMedia()
  const rowWidth = usePosterWidth()
  switch (section.kind) {
    case 'movies':
      return (
        <View style={{ paddingHorizontal: touch ? gutter : 0 }}>
          <LibraryGrid
            items={section.items}
            keyOf={(m) => String(m.id)}
            render={(m, width) => <LibraryPoster item={m} width={width} />}
          />
        </View>
      )
    case 'collections': {
      const poster = (c: (typeof section.items)[number], width: number) => (
        <LibraryCollectionTile
          key={c.id}
          collection={c}
          width={width}
          // the phone's row says only how many films (mobile/more.tsx); the pointer's grid adds
          // their years
          caption={touch ? 'count' : 'full'}
        />
      )
      if (touch)
        return (
          <Sideways gutter={gutter} gap={tokens.mobile.posterGap}>
            {section.items.map((c) => poster(c, rowWidth))}
          </Sideways>
        )
      return <LibraryGrid items={section.items} keyOf={(c) => String(c.id)} render={poster} />
    }
    case 'people': {
      // the library's search result (PersonTile's `result`): by touch portraits in a row that
      // scrolls sideways, the photo 64 in a 72 column with how many films only read out; with a
      // pointer links of the photo, the name and "N movies here"
      const people = section.items.map((p) => (
        <PersonTile
          key={p.id}
          layout="result"
          name={p.name}
          role={f.moviesHere(p.titles)}
          photo={media(p.photo)}
          accessibilityLabel={t('person', { name: p.name, credits: f.movies(p.titles) })}
          onPress={() => open(`/people/${p.id}`)}
        />
      ))
      if (touch)
        return (
          <Sideways gutter={gutter} gap={space['3']}>
            {people}
          </Sideways>
        )
      return (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space['2'] }}>{people}</View>
      )
    }
  }
}

/** A row that scrolls sideways on touch, its first item on the gutter. */
function Sideways({ gutter, gap, children }: { gutter: number; gap: number; children: ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: gutter, gap }}
    >
      {children}
    </ScrollView>
  )
}

// ---------------------------------------------------------------- the TV

const LAYOUTS = {
  letters: "abcdefghijklmnopqrstuvwxyz-'".split(''),
  // digits as a keypad on the left (1 2 3 / 4 5 6 / 7 8 9 / * 0 #), symbols beside them
  symbols: "123&.,:456!?'-789()/+*0#$%@=".split(''),
} as const
/** Keys in a row of the keyboard. */
const PER_ROW = 7
/**
 * The keyboard's column: three tenths of the screen's width, the prototype's `30cqw` (a unit is a
 * hundredth of the width, so 30u).
 */
const KEYBOARD_SHARE = 3 / 10
/** Between the keyboard and the results, in units: the prototype's 3. */
const BESIDE = tv.poster.gap * 2.5
/** How far the results' clip reaches past their column, so a lifted tile's shadow isn't cut. */
const LIFT_ROOM = tokens.focus.tv.shadow.blur
/** Where a focused section of results lands: the prototype's `data-keep`. */
const RESULTS_KEEP = 0.4

function TvSearch({ search }: { search: Search }) {
  const t = useT(searchMessages)
  const words = useFilmsText().search
  const theme = useTheme()
  const u = theme.u
  const m = useControl()
  const { width } = useWindowDimensions()
  const name = useServerName()
  const { q } = search
  const [layout, setLayout] = useState<keyof typeof LAYOUTS>('letters')
  // A pick's button goes with its results, so focus follows it into the new ones, or to the keys
  // when there are none; typing never moves it. Until they come, what was showing stays and keeps
  // focus: were the button to go first, tvOS would hand focus to the screen's preferred view (the
  // first key) on the way. The render that settles the query still has the old results (useQuery
  // resets in its effect), so new ones are told apart from those by identity.
  const [held, setHeld] = useState<{ search: Search; done: unknown } | null>(null)
  const [arrive, setArrive] = useState(false)
  // typing during a pick's wait ends it: what the keys type is never a pick, so it moves no focus
  const setQ: Search['setQ'] = (next) => {
    setHeld(null)
    search.setQ(next)
  }
  const done = (r: Search['results']) =>
    r.status === 'success' ? r.data : r.status === 'error' ? r.error : undefined
  const now = done(search.results)
  const fresh = held !== null && now !== undefined && now !== held.done && search.settled === q
  useEffect(() => {
    if (!fresh) return
    setHeld(null)
    setArrive(true)
  }, [fresh])
  const shown = held?.search ?? search
  const { results, settled } = shown
  const sections = shownOf(shown)
  useAnnounced(held ? undefined : sections, t('nothing', { name, query: settled.trim() }))

  const firstKey = useRef<ViewHandle>(null)
  // Down from the TV's head lands on the first key (kit's useHeadDown), so it needs the key itself
  const [firstKeyStop, setFirstKeyStop] = useState<ViewHandle | null>(null)
  const keyRef = useCallback((h: ViewHandle | null) => {
    firstKey.current = h
    setFirstKeyStop(h)
  }, [])
  useHeadDown(firstKeyStop)
  // focus starts on the first key as the screen opens, and only then: a preferred view takes
  // focus as it appears, so the other layout's first key would take it from &123. It stays
  // preferred until a key has focus
  const [opening, setOpening] = useState(true)
  const opened = () => setOpening(false)
  const firstResult = useRef<ViewHandle>(null)
  useEffect(() => {
    if (!arrive) return
    // the first result took focus as it appeared (preferred for that render only); with none,
    // the keys do
    if (!firstResult.current) focusOn(firstKey.current)
    setArrive(false)
  }, [arrive])
  const pick = (text: string) => {
    const next = text.toLowerCase()
    // the same text again fetches nothing new: its results are already there
    if (next === q) return focusOn(firstResult.current)
    setHeld({ search, done: now })
    search.setQ(next)
  }

  const keyboard = width * KEYBOARD_SHARE
  const keyWidth = (keyboard - (PER_ROW - 1) * m.gap) / PER_ROW
  const actionWidth = (keyboard - 3 * m.gap) / 4
  const span = (width - keyboard) / u - 2 * tv.safe.x - BESIDE
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      {/* the title across both columns, as the library's pages head theirs, so the field and the
          results start level under it (the prototype's 2.6u title and 1.6u gaps) */}
      <View style={{ paddingHorizontal: tv.safe.x * u, paddingTop: TV_LIBRARY.pageGap * u }}>
        <LibraryTitle>{t('title')}</LibraryTitle>
      </View>
      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          gap: BESIDE * u,
          paddingHorizontal: tv.safe.x * u,
          paddingTop: TV_LIBRARY.pageGap * u,
          paddingBottom: tv.safe.y * u,
        }}
      >
        {/* the keys are one group: focus coming back from the results lands on the key it left */}
        <FocusGuide autoFocus style={{ width: keyboard, gap: tv.poster.gap * u }}>
          <View
            accessible
            accessibilityLabel={words.field}
            accessibilityValue={{ text: q }}
            accessibilityLiveRegion="polite"
            style={{
              // the library's field at the TV rule, focused while the on-screen keys fill it (as
              // sign-in's): shown rather than typed into, so it's no TextInput and never brings
              // up tvOS's keyboard
              ...fieldBox(theme, m, true, false),
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: m.fieldPad,
            }}
          >
            <Text variant="button" weight={400} color={q ? 'text' : 'text-3'} numberOfLines={1}>
              {q || words.placeholder}
            </Text>
            {/* the cursor is drawn, not read */}
            <Text
              variant="button"
              weight={400}
              color="text-3"
              aria-hidden
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              |
            </Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: m.gap }}>
            {LAYOUTS[layout].map((k, i) => (
              <TvKey
                key={`${layout}:${k}`}
                ref={i === 0 ? keyRef : undefined}
                preferred={opening && i === 0}
                onFocus={opened}
                width={keyWidth}
                onPress={() => setQ((v) => v + k)}
              >
                {k}
              </TvKey>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: m.gap }}>
            <TvKey
              width={actionWidth}
              onFocus={opened}
              label={layout === 'letters' ? t('symbols') : t('letters')}
              onPress={() => setLayout((l) => (l === 'letters' ? 'symbols' : 'letters'))}
            >
              {layout === 'letters' ? t('symbolsKey') : t('lettersKey')}
            </TvKey>
            <TvKey width={actionWidth} onFocus={opened} onPress={() => setQ((v) => `${v} `)}>
              {t('space')}
            </TvKey>
            <TvKey width={actionWidth} onFocus={opened} onPress={() => setQ((v) => v.slice(0, -1))}>
              {t('delete')}
            </TvKey>
            <TvKey width={actionWidth} onFocus={opened} label={t('clear')} onPress={() => setQ('')}>
              {t('clearKey')}
            </TvKey>
          </View>
        </FocusGuide>
        {/* the results are one group too, and their clip reaches past the column by the focus
            lift, so a lifted poster isn't cut */}
        <FocusGuide
          autoFocus
          style={{
            flex: 1,
            margin: -LIFT_ROOM * u,
            padding: LIFT_ROOM * u,
            overflow: 'hidden',
          }}
        >
          {!settled.trim() ? (
            <View style={{ gap: m.gap }}>
              <SectionHeading title={t('try')} />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: m.gap }}>
                {SEARCH_SUGGESTIONS.map((s, i) => (
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
            <View style={{ flex: 1, margin: -LIFT_ROOM * u }}>
              <TvPage keep={RESULTS_KEEP} fade={LIFT_ROOM}>
                <View style={{ padding: LIFT_ROOM * u, gap: tv.poster.gap * 2 * u }}>
                  {sections.map((section, i) => (
                    <View
                      key={section.kind}
                      role="region"
                      accessibilityLabel={words.kind(section.kind)}
                      style={{ gap: m.gap }}
                    >
                      <SectionHeading title={words.kind(section.kind)} />
                      <TvResults
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
        </FocusGuide>
      </View>
    </View>
  )
}

/** Results on the TV: posters five a row, people as buttons with their photo. */
function TvResults({
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
  const t = useT(searchMessages)
  const f = useFormat()
  const m = useControl()
  const media = useMedia()
  switch (section.kind) {
    case 'movies':
      return (
        <TvGrid
          items={section.items}
          keyOf={(x) => x.id}
          columns={5}
          span={span}
          render={(x, at) => (
            <LibraryPoster
              item={x}
              ref={at.index === 0 ? first : undefined}
              preferred={arrive && at.index === 0}
              width={at.width}
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
            <LibraryCollectionTile
              collection={c}
              ref={at.index === 0 ? first : undefined}
              preferred={arrive && at.index === 0}
              width={at.width}
            />
          )}
        />
      )
    case 'people':
      // the library's search result: a button with the photo before the name, the first asking
      // for focus as it arrives, as the posters do
      return (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: m.gap }}>
          {section.items.map((p, i) => (
            <PersonTile
              key={p.id}
              layout="result"
              ref={i === 0 ? first : undefined}
              preferred={arrive && i === 0}
              name={p.name}
              role={f.moviesHere(p.titles)}
              photo={media(p.photo)}
              accessibilityLabel={t('person', { name: p.name, credits: f.movies(p.titles) })}
              onPress={() => open(`/people/${p.id}`)}
            />
          ))}
        </View>
      )
  }
}

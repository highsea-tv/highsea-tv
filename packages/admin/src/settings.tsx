'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Settings (A12; docs/product/settings.md), ported from the prototype: an index of every area in
// five groups, and each area's page with the areas beside it from expanded widths. Drawn with the
// library's native renderer since D3 (one-client-platform-d.md): a group is the library's Panel in
// its `group` look, and links are Presses with `href`, which react-native-web writes as `<a>`
// (https://necolas.github.io/react-native-web/docs/view/#href).
import { useT } from '@highsea-tv/i18n/react'
import { blur, breakpoints } from '@highsea-tv/tokens'
import {
  alpha,
  Button,
  Icon,
  Panel,
  Press,
  Text,
  tokens,
  useTheme,
  useWindowAtLeast,
} from '@highsea-tv/ui/native'
import type { ReactNode } from 'react'
import { Platform, View, type ViewStyle } from 'react-native'
import { type Area, type AreaId, areaGroupsFor } from './settings-areas.ts'
import { settings as messages } from './settings-messages.ts'
import { AdminPage, useShell } from './shell.tsx'

const s = tokens.space
const ui = tokens.adminText.ui
const areaHref = (a: Area) => a.href ?? `/settings/${a.id}`
/** react-native-web's link prop, which React Native's types don't name. */
const linkTo = (href: string) => ({ href }) as object

/** A small label over a list: the mono, uppercase label style in text-3. */
function GroupLabel({ id, children }: { id?: string; children: string }) {
  return (
    <Text
      nativeID={id}
      variant="label"
      mono
      color="text-3"
      role={id ? 'heading' : undefined}
      aria-level={id ? 2 : undefined}
      style={{ textTransform: 'uppercase' }}
    >
      {children}
    </Text>
  )
}

/** `/settings`: every area, grouped, as cards that say what's inside. */
export function SettingsIndex() {
  const t = useT(messages)
  const theme = useTheme()
  const groups = areaGroupsFor(useShell().role)
  const medium = useWindowAtLeast(breakpoints.medium)
  const wide = useWindowAtLeast(breakpoints.wide)
  const columns = wide ? 3 : medium ? 2 : 1
  return (
    <AdminPage title={t('title')} description={t('description')}>
      <View style={{ gap: s['8'] }}>
        {groups.map((g) => (
          <View
            key={g.id}
            role="region"
            aria-labelledby={`settings-${g.id}`}
            style={{ gap: s['3'] }}
          >
            <GroupLabel id={`settings-${g.id}`}>{t(`group.${g.id}`)}</GroupLabel>
            <View
              role="list"
              style={
                {
                  display: 'grid',
                  gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                  gap: s['3'],
                } as unknown as ViewStyle
              }
            >
              {g.areas.map((a) => (
                <View key={a.id} role="listitem">
                  <Press
                    role="link"
                    {...linkTo(areaHref(a))}
                    style={({ hovered }) => ({
                      height: '100%',
                      flexDirection: 'row',
                      gap: s['3'],
                      padding: s['4'],
                      borderWidth: 1,
                      borderColor: theme.colors.line,
                      borderRadius: tokens.radius.lg,
                      backgroundColor: hovered ? theme.colors.s2 : theme.colors.s1,
                    })}
                  >
                    <View style={{ paddingTop: s['0.5'] }}>
                      <Icon name={a.icon} size={18} color="accent-text" />
                    </View>
                    <View style={{ flex: 1, minWidth: 0, gap: s['1'] }}>
                      <Text size={ui.size} leading={ui.leading} weight={600}>
                        {t(`area.${a.id}`)}
                      </Text>
                      <Text variant="caption" color="text-3">
                        {t(`area.${a.id}.description`)}
                      </Text>
                    </View>
                  </Press>
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>
    </AdminPage>
  )
}

/** The areas beside an area's page, from expanded widths. */
function AreaNav({ current }: { current: AreaId }) {
  const t = useT(messages)
  const theme = useTheme()
  const groups = areaGroupsFor(useShell().role)
  return (
    <View role="navigation" aria-label={t('nav')} style={{ gap: s['5'] }}>
      {groups.map((g) => (
        <View key={g.id} style={{ gap: s['1'] }}>
          <View style={{ paddingHorizontal: s['2'] + s['0.5'] }}>
            <GroupLabel>{t(`group.${g.id}`)}</GroupLabel>
          </View>
          <View role="list" style={{ gap: s['0.5'] }}>
            {g.areas.map((a) => {
              const active = a.id === current
              return (
                <View key={a.id} role="listitem">
                  <Press
                    role="link"
                    aria-current={active ? 'page' : undefined}
                    {...linkTo(areaHref(a))}
                    style={({ hovered }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: s['2'],
                      paddingHorizontal: s['2'] + s['0.5'],
                      paddingVertical: 6,
                      borderRadius: tokens.radius.sm,
                      backgroundColor:
                        active || hovered ? alpha(theme.colors.text, 0.06) : 'transparent',
                    })}
                  >
                    {({ hovered }) => (
                      <>
                        <Text
                          size={ui.size}
                          leading={ui.leading}
                          color={active || hovered ? 'text' : 'text-2'}
                        >
                          {t(`area.${a.id}`)}
                        </Text>
                        {a.href ? <Icon name="external" size={12} color="text-3" /> : null}
                      </>
                    )}
                  </Press>
                </View>
              )
            })}
          </View>
        </View>
      ))}
    </View>
  )
}

/** An area's page: the page header, the nav beside it, and the area's content. Staff only. */
export function AreaPage({
  id,
  actions,
  children,
}: {
  id: AreaId
  actions?: ReactNode
  children: ReactNode
}) {
  const t = useT(messages)
  const expanded = useWindowAtLeast(breakpoints.expanded)
  return (
    <AdminPage title={t(`area.${id}`)} description={t(`area.${id}.description`)} actions={actions}>
      <View style={{ flexDirection: 'row', gap: s['6'], alignItems: 'flex-start' }}>
        {expanded ? (
          <View style={{ width: 208, flexShrink: 0 }}>
            <AreaNav current={id} />
          </View>
        ) : null}
        <View style={{ flex: 1, minWidth: 0, gap: s['6'] }}>
          {expanded ? null : (
            <Press
              role="link"
              {...linkTo('/settings')}
              style={{
                alignSelf: 'flex-start',
                flexDirection: 'row',
                alignItems: 'center',
                gap: s['1'],
                borderRadius: tokens.radius.sm,
              }}
            >
              {({ hovered }) => (
                <>
                  <Icon name="chevron-left" size={16} color={hovered ? 'text' : 'text-2'} />
                  <Text size={ui.size} leading={ui.leading} color={hovered ? 'text' : 'text-2'}>
                    {t('all')}
                  </Text>
                </>
              )}
            </Press>
          )}
          {children}
        </View>
      </View>
    </AdminPage>
  )
}

/** A titled block of settings: the library's Panel in its group look. */
export function Group({
  title,
  description,
  children,
}: {
  title: string
  description?: ReactNode
  children: ReactNode
}) {
  return (
    <Panel look="group" title={title} description={description}>
      {children}
    </Panel>
  )
}

/** Only the web draws a blur behind the bar (react-native-web's backdropFilter). */
const BLURS = Platform.OS === 'web'
const BAR_BLUR = {
  backdropFilter: `blur(${blur.bar.radius}px) saturate(${blur.bar.saturate})`,
} as object
/** Held to the window's bottom while the page scrolls under it (CSS's sticky, on the web). */
const STICKY = { position: 'sticky', bottom: tokens.space['3'], zIndex: 10 } as unknown as ViewStyle

/** The save bar: sticks to the bottom while there are unsaved changes. */
export function SaveBar({
  dirty,
  saving,
  onSave,
  onDiscard,
}: {
  dirty: boolean
  saving: boolean
  onSave: () => void
  onDiscard: () => void
}) {
  const t = useT(messages)
  const theme = useTheme()
  if (!dirty) return null
  return (
    <View
      role="region"
      aria-label={t('unsaved.label')}
      style={[
        STICKY,
        {
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: s['2'],
          paddingHorizontal: s['4'],
          paddingVertical: s['3'],
          borderWidth: 1,
          borderColor: theme.colors['line-strong'],
          borderRadius: tokens.radius.lg,
          backgroundColor: alpha(theme.colors.bg, BLURS ? blur.bar.opacity : blur.fallbackOpacity),
          boxShadow: tokens.elevation[3].boxShadow,
        } as ViewStyle,
        BLURS ? (BAR_BLUR as ViewStyle) : null,
      ]}
    >
      <Text
        size={ui.size}
        leading={ui.leading}
        color="text-2"
        style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}
      >
        {t('unsaved.body')}
      </Text>
      <Button variant="ghost" onPress={onDiscard} disabled={saving}>
        {t('discard')}
      </Button>
      <Button variant="primary" onPress={onSave} loading={saving}>
        {t('save')}
      </Button>
    </View>
  )
}

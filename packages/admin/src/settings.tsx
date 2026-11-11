'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Settings (A12; docs/product/settings.md), ported from the prototype: an index of every area in
// five groups, and each area's page with the areas beside it once there's room for both (below
// that, folded into a menu above the content: the owner's decision of 2026-11-10). Drawn with the
// library's native renderer since D3 (one-client-platform-d.md): a group is the library's Panel in
// its `group` look, and links are Presses with `href`, which react-native-web writes as `<a>`
// (https://necolas.github.io/react-native-web/docs/view/#href).
import { useT } from '@highsea-tv/i18n/react'
import { admin, blur, density, line } from '@highsea-tv/tokens'
import {
  alpha,
  Button,
  Icon,
  Menu,
  Panel,
  Press,
  Text,
  tokens,
  useRegularWindow,
  useTheme,
  useWindowAtLeast,
} from '@highsea-tv/ui/native'
import { type ComponentRef, type ReactNode, useRef, useState } from 'react'
import { Platform, View, type ViewStyle } from 'react-native'
import { useRouter } from './navigation.tsx'
import { type Area, type AreaId, areaGroupsFor } from './settings-areas.ts'
import { settings as messages } from './settings-messages.ts'
import { AdminPage, useShell } from './shell.tsx'

const s = tokens.space
const ui = tokens.adminText.ui
const areaHref = (a: Area) => a.href ?? `/settings/${a.id}`
/** react-native-web's link prop, which React Native's types don't name. */
const linkTo = (href: string) => ({ href }) as object

/**
 * The window from which the areas sit beside an area's page: the sidebar, the page's padding, the
 * areas' column and its gap, and the least the page's content needs beside them
 * (`admin.settings.contentMin`). A component's own threshold, not a second width rule: the page
 * is regular from 768 either way, and only the areas fold.
 */
const NAV_BESIDE_FROM =
  density.sidebar + 2 * density.mainPadding + admin.sideColumn + s['6'] + admin.settings.contentMin

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
  const regular = useRegularWindow()
  const columns = regular ? 3 : 1
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
                      borderWidth: line.thin,
                      borderColor: theme.colors.line,
                      borderRadius: tokens.radius.lg,
                      backgroundColor: hovered ? theme.colors.s2 : theme.colors.s1,
                    })}
                  >
                    <View style={{ paddingTop: s['0.5'] }}>
                      <Icon name={a.icon} size={tokens.icon.size.md} color="accent-text" />
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

/** The areas beside an area's page, once there's room for both. */
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
                      paddingVertical: tokens.space['1.5'],
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
                        {a.href ? (
                          <Icon name="external" size={tokens.icon.size['2xs']} color="text-3" />
                        ) : null}
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
  const beside = useWindowAtLeast(NAV_BESIDE_FROM)
  return (
    <AdminPage title={t(`area.${id}`)} description={t(`area.${id}.description`)} actions={actions}>
      <View style={{ flexDirection: 'row', gap: s['6'], alignItems: 'flex-start' }}>
        {beside ? (
          <View style={{ width: admin.sideColumn, flexShrink: 0 }}>
            <AreaNav current={id} />
          </View>
        ) : null}
        <View style={{ flex: 1, minWidth: 0, gap: s['6'] }}>
          {beside ? null : <FoldedNav current={id} />}
          {children}
        </View>
      </View>
    </AdminPage>
  )
}

/**
 * The areas folded above an area's page while there isn't room beside it: All settings, and the
 * area in force as a menu button (the library's Menu, as the admin's other menus) of every area.
 */
function FoldedNav({ current }: { current: AreaId }) {
  const t = useT(messages)
  const router = useRouter()
  const groups = areaGroupsFor(useShell().role)
  const anchor = useRef<ComponentRef<typeof View>>(null)
  const [open, setOpen] = useState(false)
  const items = groups.flatMap((g) =>
    g.areas.map((a) => ({
      label: t(`area.${a.id}`),
      group: t(`group.${g.id}`),
      current: a.id === current,
      closes: 'leave' as const,
      onSelect: () => router.push(areaHref(a)),
    })),
  )
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: s['2'],
      }}
    >
      <Press
        role="link"
        {...linkTo('/settings')}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: s['1'],
          borderRadius: tokens.radius.sm,
        }}
      >
        {({ hovered }) => (
          <>
            <Icon
              name="chevron-left"
              size={tokens.icon.size.sm}
              color={hovered ? 'text' : 'text-2'}
            />
            <Text size={ui.size} leading={ui.leading} color={hovered ? 'text' : 'text-2'}>
              {t('all')}
            </Text>
          </>
        )}
      </Press>
      <Button
        ref={anchor}
        size="sm"
        iconEnd="chevron-down"
        hasPopup="menu"
        accessibilityLabel={t('navMenu', { area: t(`area.${current}`) })}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
      >
        {t(`area.${current}`)}
      </Button>
      <Menu
        title={t('nav')}
        open={open}
        onClose={() => setOpen(false)}
        anchor={anchor}
        items={items}
      />
    </View>
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
          borderWidth: line.thin,
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

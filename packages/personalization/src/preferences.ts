// SPDX-License-Identifier: AGPL-3.0-only
// Preferences in layers (ADR 0027): the server holds every layer, and a client gets its effective
// preferences in one call. Most specific first: this device, then every app of its type a person
// has (all their TVs), then the person on every device, then the server's defaults from
// Appearance. A device's layer goes with the device: a TV that signs out starts again from the
// person's layers.
import { AppError } from '@highsea-tv/core'
import { schema } from '@highsea-tv/db'
import type { ClientType } from '@highsea-tv/db/schema'
import { and, eq } from 'drizzle-orm'
import type { AppearanceService } from './appearance.ts'
import type { Ctx } from './context.ts'
import {
  appKind,
  type Layer,
  PREFERENCE_KEYS,
  type PreferenceKey,
  type PreferenceLayer,
  type PreferencePatch,
  type Preferences,
  preferenceLayer,
} from './keys.ts'

export type PreferencesView = {
  /** What this device uses. */
  values: Preferences
  /** Which layer each value came from, so anyone can see why a device behaves as it does. */
  from: Record<PreferenceKey, Layer>
  layers: { device: PreferenceLayer; client: PreferenceLayer; user: PreferenceLayer }
  /** The kind of app this device is; null when the request isn't from a device (an API key). */
  client: ClientType | null
  deviceId: string | null
}

export type EditableLayer = 'user' | 'client' | 'device'

export function createPreferences(ctx: Ctx, appearance: AppearanceService) {
  const { db, clock, events } = ctx

  const scopeFor = (layer: EditableLayer, target?: string) =>
    layer === 'user' ? 'user' : `${layer}:${target}`

  const read = (userId: string, scope: string): PreferenceLayer => {
    const row = db
      .select()
      .from(schema.preferences)
      .where(and(eq(schema.preferences.userId, userId), eq(schema.preferences.scope, scope)))
      .get()
    // stored by this code, so it parses; anything that no longer does is ignored, not fatal
    const parsed = preferenceLayer.safeParse(row?.values ?? {})
    return parsed.success ? parsed.data : {}
  }

  const device = (userId: string, deviceId: string | null) => {
    if (!deviceId) return null
    const d = db.select().from(schema.devices).where(eq(schema.devices.id, deviceId)).get()
    return d && d.userId === userId ? d : null
  }

  /** A theme a layer names may have been deleted since: then the next layer shows through. */
  const usable = (key: PreferenceKey, value: unknown) =>
    key !== 'theme' || appearance.themeExists(value as string)

  const resolve = (userId: string, deviceId: string | null): PreferencesView => {
    const d = device(userId, deviceId)
    const client = d?.client ?? null
    const layers = {
      device: d ? read(userId, scopeFor('device', d.id)) : {},
      client: client ? read(userId, scopeFor('client', client)) : {},
      user: read(userId, 'user'),
    }
    const s = appearance.settings()
    const server: Preferences = {
      theme: s.defaultTheme,
      sound: s.sound[appKind(client)],
      volume: s.sound.volume,
      'admin.addMovie.defaults': null,
    }
    const values = { ...server }
    const from = Object.fromEntries(PREFERENCE_KEYS.map((k) => [k, 'server'])) as Record<
      PreferenceKey,
      Layer
    >
    for (const key of PREFERENCE_KEYS)
      for (const layer of ['device', 'client', 'user'] as const) {
        const value = layers[layer][key]
        if (value !== undefined && usable(key, value)) {
          ;(values as Record<string, unknown>)[key] = value
          from[key] = layer
          break
        }
      }
    return { values, from, layers, client, deviceId: d?.id ?? null }
  }

  return {
    resolve,

    /**
     * Changes one layer: a value sets a key, `null` clears it. The device layer is the caller's own
     * device; the client layer is one kind of app.
     */
    save(
      userId: string,
      deviceId: string | null,
      layer: EditableLayer,
      patch: PreferencePatch,
      client?: ClientType,
    ): PreferencesView {
      const d = device(userId, deviceId)
      if (layer === 'device' && !d)
        throw new AppError('invalid', 'Only an app signed in as a device has a device layer.', {
          reason: 'no-device',
        })
      if (patch.theme && !appearance.themeExists(patch.theme))
        throw new AppError('invalid', 'There’s no theme with that id.', { reason: 'theme' })
      const target = layer === 'device' ? d?.id : client
      const scope = scopeFor(layer, target)
      const next: Record<string, unknown> = { ...read(userId, scope) }
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) continue
        if (v === null) delete next[k]
        else next[k] = v
      }
      const where = and(eq(schema.preferences.userId, userId), eq(schema.preferences.scope, scope))
      if (Object.keys(next).length === 0) db.delete(schema.preferences).where(where).run()
      else {
        const values = { values: next, updatedAt: clock.now() }
        db.insert(schema.preferences)
          .values({
            userId,
            scope,
            deviceId: layer === 'device' ? (d?.id ?? null) : null,
            ...values,
          })
          .onConflictDoUpdate({
            target: [schema.preferences.userId, schema.preferences.scope],
            set: values,
          })
          .run()
      }
      events.emit({ topic: 'preferences.updated', ids: [userId] })
      return resolve(userId, deviceId)
    },
  }
}

export type PreferenceService = ReturnType<typeof createPreferences>

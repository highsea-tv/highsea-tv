'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Change artwork (HT-66): a film's or a collection's poster, backdrop and logo. A tab per kind; the
// image shown now, who chose it and when; Upload and Reset; then TMDB's others, best voted first,
// with their language and size and the current one marked. Choosing one is a tap. Drawn from the
// library's parts (Dialog, Tabs, Press, Image, Badge, Banner), as every admin dialog is; the
// prototype draws this same file over the mock (packages/mock's admin/artwork.ts).
import {
  ARTWORK_KINDS,
  type ArtworkKind,
  type ArtworkKindView,
  type ArtworkOption,
  type ArtworkOwner,
  MEDIA_TOPICS,
} from '@highsea-tv/api-contract'
import { useLocale, useT } from '@highsea-tv/i18n/react'
import { useAction, useQuery } from '@highsea-tv/sdk/react'
import { admin, line } from '@highsea-tv/tokens'
import {
  Badge,
  Banner,
  Button,
  Dialog,
  EmptyState,
  Image,
  Press,
  Skeleton,
  Tabs,
  Text,
  Tooltip,
  toast,
  tokens,
  useTheme,
} from '@highsea-tv/ui/native'
import { useState } from 'react'
import { View } from 'react-native'
import { artwork as messages } from './artwork-messages.ts'
import { toBase64 } from './base64.ts'
import { pickFile, useFileDrop } from './pick-file.ts'
import { useRelative } from './time.ts'

/** Each kind's frame: a poster's 2:3, a backdrop's 16:9, a logo's wide band. */
const SHAPE: Record<ArtworkKind, number> = { poster: 2 / 3, backdrop: 16 / 9, logo: 5 / 2 }
/** The image shown now, and the grid's tiles, by their width. */
const { shown: SHOWN, tile: TILE, wordsMin: WORDS_MIN } = admin.artwork
/** What an upload may be: a logo a PNG only, so its ground can be transparent. */
const ACCEPT: Record<ArtworkKind, string> = {
  poster: 'image/png,image/jpeg',
  backdrop: 'image/png,image/jpeg',
  logo: 'image/png',
}

export function ArtworkDialog({
  owner,
  id,
  title,
  open,
  onOpenChange,
}: {
  owner: ArtworkOwner
  id: number
  /** The film's or collection's name, for the description. */
  title: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useT(messages)
  return (
    <Dialog
      open={open}
      onClose={() => onOpenChange(false)}
      closable
      size="lg"
      title={t('title')}
      description={t('description', { title })}
      footer={
        <Button variant="primary" onPress={() => onOpenChange(false)}>
          {t('done')}
        </Button>
      }
    >
      {/* read only while open, and afresh each time it opens */}
      {open ? <Picker owner={owner} id={id} /> : null}
    </Dialog>
  )
}

/** The dialog's body: the tabs, the image shown now, Upload and Reset, and TMDB's others. */
function Picker({ owner, id }: { owner: ArtworkOwner; id: number }) {
  const t = useT(messages)
  const [kind, setKind] = useState<ArtworkKind>('poster')
  // refetched on `metadata.updated`, which every change raises
  const view = useQuery(`artwork:${owner}:${id}`, (c) => c.artwork.get({ params: { owner, id } }), [
    MEDIA_TOPICS.metadata,
  ])
  const choose = useAction((c, file: string) =>
    c.artwork.choose({ params: { owner, id, kind }, body: { file } }),
  )
  const upload = useAction((c, data: string) =>
    c.artwork.upload({ params: { owner, id, kind }, body: { data } }),
  )
  const reset = useAction((c) => c.artwork.reset({ params: { owner, id, kind } }))
  const name = t(`kind.${kind}`)

  const done = (key: 'chosen' | 'reset') => () => {
    view.refetch()
    toast({ title: t(`${key}.toast`, { kind: name }), description: t(`${key}.body`) })
  }
  const failed = (e: Error) => toast.error(t('failed'), { description: e.message })

  const onFile = (file: File) => {
    void toBase64(file).then((data) => upload.run(data).then(done('chosen'), failed))
  }
  const drop = useFileDrop(onFile)

  const data = view.data
  const k = data?.kinds.find((x) => x.kind === kind)
  const busy = choose.pending || upload.pending || reset.pending

  return (
    <View ref={drop} style={{ gap: tokens.space['5'] }}>
      <Tabs<ArtworkKind>
        aria-label={t('kinds')}
        options={ARTWORK_KINDS.map((value) => ({ value, label: t(`kind.${value}`) }))}
        value={kind}
        onValueChange={setKind}
      />
      {view.status === 'error' ? (
        <EmptyState
          tone="error"
          icon="error"
          title={t('load.failed')}
          size="sm"
          action={<Button onPress={view.refetch}>{t('retry')}</Button>}
        >
          {view.error.message}
        </EmptyState>
      ) : !k ? (
        <Skeleton height={SHOWN.backdrop / SHAPE.backdrop} />
      ) : (
        <>
          <Shown
            kind={kind}
            view={k}
            busy={busy}
            uploading={upload.pending}
            resetting={reset.pending}
            onUpload={() => pickFile(ACCEPT[kind], onFile)}
            onReset={() => reset.run().then(done('reset'), failed)}
          />
          {data && !data.tmdb.available ? (
            <Banner tone="warning" title={t('tmdb.unavailable')}>
              {t('tmdb.unavailableBody', { reason: data.tmdb.reason ?? '' })}
            </Banner>
          ) : (
            <Options
              kind={kind}
              owner={owner}
              options={k.options}
              disabled={busy}
              onChoose={(o) => choose.run(o.file).then(done('chosen'), failed)}
            />
          )}
        </>
      )}
    </View>
  )
}

/** The image shown now, who chose it and when, the rules for an upload, Upload and Reset. */
function Shown({
  kind,
  view,
  busy,
  uploading,
  resetting,
  onUpload,
  onReset,
}: {
  kind: ArtworkKind
  view: ArtworkKindView
  busy: boolean
  uploading: boolean
  resetting: boolean
  onUpload: () => void
  onReset: () => void
}) {
  const t = useT(messages)
  const { relative } = useRelative()
  const s = tokens.space
  const c = view.chosen
  const state = c
    ? t(c.source === 'upload' ? 'state.upload' : 'state.tmdb', {
        name: c.by?.name ?? t('state.someone'),
        when: relative(c.at),
      })
    : t(view.automatic ? 'state.automatic' : 'state.automaticNone')
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: s['5'] }}>
      <Frame kind={kind} src={view.current} width={SHOWN[kind]} alt={t(`kind.${kind}`)} />
      <View style={{ flex: 1, minWidth: WORDS_MIN, gap: s['3'] }}>
        <View style={{ gap: s['1'] }}>
          <Text variant="label" color="text-3">
            {t('shown')}
          </Text>
          <Text variant="body">{state}</Text>
          <Text variant="caption" color="text-2">
            {t(`rules.${kind}`)}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: s['2'] }}>
          <Button icon="upload" loading={uploading} disabled={busy} onPress={onUpload}>
            {t('upload')}
          </Button>
          {c ? (
            <Tooltip content={t('reset.hint')}>
              <Button
                variant="ghost"
                icon="replay"
                loading={resetting}
                disabled={busy}
                onPress={onReset}
              >
                {t('reset')}
              </Button>
            </Tooltip>
          ) : null}
        </View>
      </View>
    </View>
  )
}

/** TMDB's other images of the kind, best voted first; a tap chooses one. */
function Options({
  kind,
  owner,
  options,
  disabled,
  onChoose,
}: {
  kind: ArtworkKind
  owner: ArtworkOwner
  options: ArtworkOption[]
  disabled: boolean
  onChoose: (o: ArtworkOption) => void
}) {
  const t = useT(messages)
  const locale = useLocale()
  const s = tokens.space
  const languages = new Intl.DisplayNames([locale], { type: 'language' })
  const language = (code: string | null) =>
    code ? (languages.of(code) ?? code.toUpperCase()) : t('option.noLanguage')
  return (
    <View role="region" aria-label={t('fromTmdb')} style={{ gap: s['3'] }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: s['2'] }}>
        <Text variant="title" role="heading" aria-level={3}>
          {t('fromTmdb')}
        </Text>
        {options.length ? (
          <Text variant="caption" color="text-3">
            {t('fromTmdb.count', { count: options.length })}
          </Text>
        ) : null}
      </View>
      {options.length === 0 ? (
        <Text variant="body" color="text-2">
          {owner === 'collection' && kind === 'logo'
            ? t('fromTmdb.collectionLogo')
            : t('fromTmdb.none')}
        </Text>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s['3'] }}>
          {options.map((o) => (
            <Press
              key={o.file}
              role="radio"
              aria-checked={o.current}
              aria-label={t('option.label', {
                kind: t(`kind.${kind}`),
                language: language(o.language),
                width: o.width,
                height: o.height,
              })}
              disabled={disabled || o.current}
              onPress={() => onChoose(o)}
              style={{ gap: s['1.5'], width: TILE[kind], borderRadius: tokens.radius.md }}
            >
              <View>
                <Frame kind={kind} src={o.url} width={TILE[kind]} current={o.current} />
                {o.current ? (
                  <View style={{ position: 'absolute', top: s['1.5'], left: s['1.5'] }}>
                    <Badge tone="accent" overlay>
                      {t('current')}
                    </Badge>
                  </View>
                ) : null}
              </View>
              <Text variant="caption" color="text-2" numberOfLines={1}>
                {language(o.language)}
              </Text>
              <Text variant="caption" color="text-3" mono numberOfLines={1}>
                {`${o.width} × ${o.height}`}
              </Text>
            </Press>
          ))}
        </View>
      )}
    </View>
  )
}

/** An image in its kind's frame; a logo on the raised ground, so its transparency shows. */
function Frame({
  kind,
  src,
  width,
  current,
  alt = '',
}: {
  kind: ArtworkKind
  src: string | null
  width: number
  current?: boolean
  /** The image's text alternative; a tile's is its button's name, so it has none. */
  alt?: string
}) {
  const theme = useTheme()
  const t = useT(messages)
  return (
    <View
      style={{
        width,
        aspectRatio: SHAPE[kind],
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: tokens.radius.md,
        borderWidth: current ? line.thick : line.thin,
        borderColor: current ? theme.colors.accent : theme.colors.line,
        backgroundColor: kind === 'logo' ? theme.colors.s3 : theme.colors.s2,
      }}
    >
      {src ? (
        <Image
          source={{ uri: src }}
          alt={alt}
          contentFit={kind === 'logo' ? 'contain' : 'cover'}
          style={{ width: '100%', height: '100%' }}
        />
      ) : (
        <Text variant="caption" color="text-3">
          {t('none')}
        </Text>
      )}
    </View>
  )
}

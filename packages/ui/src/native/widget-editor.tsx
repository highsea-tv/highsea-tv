// SPDX-License-Identifier: AGPL-3.0-only
// The widget grid's editor off the web: the web's side is ./widget-editor.web.tsx, a platform
// pair (apps/client/README.md › Platform files) imported as `./widget-editor`. Customize mode is
// the admin's, which only a browser draws (one-client-platform-d.md › D2), so here the grid is
// drawn as laid out, without handles or corners.
import { WidgetGrid } from './widget.tsx'
import type { EditableItem, WidgetEditorProps } from './widget-editor-shared.ts'

export function WidgetEditor<T extends EditableItem>({ items, render }: WidgetEditorProps<T>) {
  return (
    <WidgetGrid rows>
      {items.map((item) =>
        render(item, {
          span: item.span,
          rows: item.rows,
          editing: false,
          dataSet: { widgetId: item.id },
        }),
      )}
    </WidgetGrid>
  )
}

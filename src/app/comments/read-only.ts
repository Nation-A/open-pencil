import { useEventListener } from '@vueuse/core'
import { computed } from 'vue'

import { isEditing } from '@/app/shell/keyboard/focus'

import { commentsHost } from './host-provider'

/**
 * workos: a host that says the document is read-only (a viewer, or a commenter who may only comment) gets an
 * editor whose design cannot be changed from the keyboard, the clipboard or a file drop. The tools are limited
 * in `embedded-comments.ts`; this is the rest of the ways in. Text fields (the comment composer) keep working.
 */
export const documentLocked = computed(() => commentsHost.value?.readOnly === true)

/** Paste, cut and drops are swallowed before any editor handler sees them while the document is locked. */
export function bindReadOnlyGuards(): void {
  for (const type of ['paste', 'cut'] as const) {
    useEventListener(
      window,
      type,
      (event: ClipboardEvent) => {
        if (!documentLocked.value || isEditing(event)) return
        event.preventDefault()
        event.stopImmediatePropagation()
      },
      { capture: true }
    )
  }
  for (const type of ['dragover', 'drop'] as const) {
    useEventListener(
      window,
      type,
      (event: DragEvent) => {
        if (!documentLocked.value || isEditing(event)) return
        event.preventDefault()
        event.stopImmediatePropagation()
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'none'
      },
      { capture: true }
    )
  }
}

/**
 * The keys that stay live in a locked document: moving around (zoom, pages), view toggles, leaving a mode,
 * and the comment tools. Everything else would edit the design, change the selection's contents, or start an AI edit.
 */
export const LOCKED_SHORTCUT_IDS: ReadonlySet<string> = new Set([
  'toggle-comments',
  'toggle-rulers',
  'toggle-pixel-grid',
  'toggle-multiplayer-cursors',
  'toggle-ui',
  'zoom-in-unmodified',
  'zoom-out-unmodified',
  'escape',
  'view.zoom100',
  'view.zoomFit',
  'view.zoomSelection',
  'view.zoomNextFrame',
  'view.zoomPreviousFrame',
  'view.nextPage',
  'view.previousPage'
])

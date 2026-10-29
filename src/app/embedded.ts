import { ref } from 'vue'

/**
 * workos: a host page that owns the document (one design per editor frame, saved through its own
 * bridge) switches this on with `window.openPencil.setEmbedded(true)`. The editor then hides what
 * assumes it owns files: the local-file-API banner, the document tab strip, and the New / Open /
 * Save As / Storage / Close menu items. Save and Export are untouched.
 */
export const embedded = ref(false)

export function setEmbedded(value: boolean): void {
  embedded.value = value
}

/** File-management entries that conflict with a host that owns the document. */
export const EMBEDDED_HIDDEN_MENU_IDS: ReadonlySet<string> = new Set([
  'new',
  'open',
  'open-recent',
  'open-storage-workspace',
  'save-as',
  'save-to-storage',
  'close'
])

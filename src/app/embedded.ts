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

/**
 * workos: a host that can open and save local files itself (File System Access in its own window, or a native dialog) passes
 * `{ open }` here. Open and Save As then reappear in the menu: Open calls `open()` instead of opening a tab (the host decides what
 * a local file becomes), and Save As stays `store.saveFigFileAs`, which the host's bridge already owns. `null` turns it off.
 */
export interface EmbeddedLocalFiles {
  open: () => void
}
export const embeddedLocalFiles = ref<EmbeddedLocalFiles | null>(null)

export function setEmbeddedLocalFiles(value: EmbeddedLocalFiles | null): void {
  embeddedLocalFiles.value = value
}

/** Entries that come back when `embeddedLocalFiles` is set. */
export const EMBEDDED_LOCAL_FILE_MENU_IDS: ReadonlySet<string> = new Set(['open', 'save-as'])

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

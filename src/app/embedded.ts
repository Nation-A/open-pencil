import { ref } from 'vue'

import { IS_BROWSER } from '@/constants'

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
 * workos: true when this editor runs inside another page. The host calls `setEmbedded(true)` only after the editor booted, but
 * first-run surfaces (the welcome, the usage-stats question) are decided during boot, so they ask this instead of `embedded`.
 */
export function isHostFramed(): boolean {
  if (!IS_BROWSER) return false
  try {
    return window.self !== window.top
  } catch {
    return true // a cross-origin top that throws on access is a host page
  }
}

/** workos: whether the editor's own onboarding (welcome, tour, "Set up AI", usage stats) is out of place: a host owns the session. */
export function hostOwnsOnboarding(): boolean {
  return embedded.value || isHostFramed()
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

/**
 * workos: a host that owns sharing (its own dialog, its own ACL) passes `{ onShare }`. The Share button then renders no peer-to-peer
 * popover (name, "Share this file", join a room) and a click only calls `onShare()`. `label` replaces the button text, `canShare()`
 * returning false disables it. `null` restores the stock popover.
 */
export interface EmbeddedShare {
  onShare: () => void
  label?: string
  canShare?: () => boolean
}
export const embeddedShare = ref<EmbeddedShare | null>(null)

export function setEmbeddedShare(value: EmbeddedShare | null): void {
  embeddedShare.value = value
}

/** Runs the host's share handler; false when none is set or it reports it cannot share right now. */
export function runEmbeddedShare(): boolean {
  const host = embeddedShare.value
  if (!host || host.canShare?.() === false) return false
  host.onShare()
  return true
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

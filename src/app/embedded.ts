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

/**
 * workos: a host that draws the window's top row itself (traffic lights, title, settings, panel toggle) passes
 * `{ hideHeader: true }`. The sidebar then drops its logo / document name / settings / panel-toggle row and the menubar
 * sits at the very top. `onLeftPanelChange` gets the left panel's open state once when set and on every change, so the
 * host can show its toggle pressed. `null` restores the stock header.
 */
export interface EmbeddedChrome {
  hideHeader: boolean
  onLeftPanelChange?: (open: boolean) => void
}
export const embeddedChrome = ref<EmbeddedChrome | null>(null)

export type EmbeddedChromeCommand = 'open-settings' | 'toggle-left-panel'

let lastLeftPanelOpen: boolean | null = null

export function setEmbeddedChrome(value: EmbeddedChrome | null): void {
  embeddedChrome.value = value
  if (value?.onLeftPanelChange && lastLeftPanelOpen !== null)
    value.onLeftPanelChange(lastLeftPanelOpen)
}

/** The editor reports the left panel's open state here; the host's callback hears every change. */
export function reportLeftPanelOpen(open: boolean): void {
  lastLeftPanelOpen = open
  embeddedChrome.value?.onLeftPanelChange?.(open)
}

/** Runs what the header's settings gear and panel toggle do; false for an unknown name. */
export function runEmbeddedChromeCommand(
  name: string,
  actions: { openSettings: () => void; toggleLeftPanel: () => void }
): boolean {
  if (name === 'open-settings') actions.openSettings()
  else if (name === 'toggle-left-panel') actions.toggleLeftPanel()
  else return false
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

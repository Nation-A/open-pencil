import type { ChatTransport, UIMessage } from 'ai'
import { watch } from 'vue'

import type { CollabReturn } from '@/app/collab/context'
import type { RoomStatus } from '@/app/collab/room/status'
import { setCollabTransportOverride, type JoinCollabRoom } from '@/app/collab/transport'
import type { EditorStore } from '@/app/editor/session/create'
import {
  setEmbedded,
  setEmbeddedLocalFiles,
  setEmbeddedShare,
  setEmbeddedChrome,
  reportLeftPanelOpen,
  runEmbeddedChromeCommand,
  type EmbeddedChrome,
  type EmbeddedChromeCommand,
  type EmbeddedLocalFiles,
  type EmbeddedShare
} from '@/app/embedded'
import { createNavigationBenchmarkHooks } from '@/app/performance/navigation/hooks'
import type { NavigationBenchmarkHooks } from '@/app/performance/navigation/hooks'
import { appRuntimeConfig } from '@/app/runtime/config'
import { openSettingsDialog } from '@/app/settings/dialog'
import { IS_BROWSER } from '@/constants'

export interface OpenPencilTestHooks {
  writeCount?: () => number
  mockHandle?: FileSystemFileHandle
  savedOpen?: Window['open']
  navigation?: NavigationBenchmarkHooks
  collab?: Pick<
    CollabReturn,
    'disconnect' | 'updateCursor' | 'updateSelection' | 'setLocalName'
  > & {
    /** Joins a room in a tab of its own, as pasting its link does. */
    connect: (roomId: string) => boolean
    /** Puts the active tab's document into the room, as Share does. */
    share: (roomId: string) => void
    peerCount: () => number
    peerSelections: () => Array<string[] | undefined>
    status: () => RoomStatus | null
  }
  /** Sends a request through the MCP bridge's command handler, as an MCP client's call arrives. */
  automation?: (command: string, args: unknown) => Promise<unknown>
}

/** workos: room control a host page drives in production builds. */
export interface OpenPencilCollabHost {
  assetProtocol: 2
  ensureAssetsAvailable: () => Promise<void>
  /** Puts the active tab's document into a room (a generated ID when none is given); null if there is no document. */
  shareCurrentDoc: (roomId?: string) => string | null
  /** Opens a room in a tab of its own, as pasting its link does. */
  joinRoom: (roomId: string) => boolean
  leave: () => void
  setLocalName: (name: string) => void
  peerCount: () => number
  status: () => RoomStatus | null
}

export interface OpenPencilWindowAPI {
  /** workos: hides file-management UI (banner, tab strip, New/Open/Save As) for a host that owns the document. */
  setEmbedded?: (embedded: boolean) => void
  /** workos: brings Open and Save As back in embedded mode; Open calls `open()` instead of opening a tab. */
  setEmbeddedLocalFiles?: (handlers: EmbeddedLocalFiles | null) => void
  /** workos: hands the Share button to the host. Set: no peer-to-peer popover, a click calls `onShare()`. Null restores it. */
  setEmbeddedShare?: (share: EmbeddedShare | null) => void
  /** workos: replaces Trystero for every room joined afterwards. Pass null to restore it. */
  /** workos: hands the window's top row to the host. `{ hideHeader: true }` drops the sidebar's logo / name / gear / panel-toggle row; `onLeftPanelChange(open)` fires once and on every change. Null restores it. */
  setEmbeddedChrome?: (chrome: EmbeddedChrome | null) => void
  /** workos: runs what the hidden header's buttons did: 'open-settings' or 'toggle-left-panel'. */
  chromeCommand?: (name: EmbeddedChromeCommand) => void
  setCollabTransport?: (join: JoinCollabRoom | null) => void
  collabHost?: OpenPencilCollabHost
  getStore?: () => EditorStore
  setChatTransport?: (factory: () => ChatTransport<UIMessage>) => void
  openFile?: (path: string) => Promise<void>
  /** workos: opens a document (`.fig`, `.pen`, …) from bytes the host already holds, the way a picked file opens (a tab; the untouched first tab is reused). */
  openDocumentFile?: (file: File) => Promise<void>
  test?: OpenPencilTestHooks
}

let activeStore: EditorStore | null = null

function windowAPI(): OpenPencilWindowAPI {
  window.openPencil ??= {}
  window.openPencil.setEmbedded ??= setEmbedded
  window.openPencil.setEmbeddedLocalFiles ??= setEmbeddedLocalFiles
  window.openPencil.setEmbeddedShare ??= setEmbeddedShare
  window.openPencil.setEmbeddedChrome ??= setEmbeddedChrome
  window.openPencil.chromeCommand ??= (name) => {
    runEmbeddedChromeCommand(name, {
      openSettings: () => openSettingsDialog(),
      toggleLeftPanel: () => {
        if (activeStore) activeStore.state.showUI = !activeStore.state.showUI
      }
    })
  }
  window.openPencil.getStore ??= () => {
    if (!activeStore) throw new Error('OpenPencil store not initialized')
    return activeStore
  }
  return window.openPencil
}

export function setOpenPencilStore(store: EditorStore) {
  activeStore = store
  if (!IS_BROWSER) return
  watch(() => store.state.showUI, reportLeftPanelOpen, { immediate: true })
  const api = windowAPI()
  if (appRuntimeConfig.navigationBenchmark) {
    const testHooks = (api.test ??= {})
    testHooks.navigation = createNavigationBenchmarkHooks(store)
  }
}

export function exposeCollaborationActions(
  collab: CollabReturn,
  joinRoom: (roomId: string) => boolean
) {
  if (!IS_BROWSER || !import.meta.env.DEV) return
  if (!appRuntimeConfig.test) return
  const testHooks = (windowAPI().test ??= {})
  testHooks.collab = {
    connect: joinRoom,
    disconnect: collab.disconnect,
    updateCursor: collab.updateCursor,
    updateSelection: collab.updateSelection,
    setLocalName: collab.setLocalName,
    peerCount: () => collab.remotePeers.value.length,
    peerSelections: () => collab.remotePeers.value.map((peer) => peer.selection),
    share: (roomId: string) => {
      collab.shareCurrentDoc(roomId)
    },
    status: () => collab.state.value.status
  }
}

/** Test runs send MCP requests the way the bridge delivers them, without a separate server. */
export function exposeAutomationRequests(
  handleRequest: (store: EditorStore, command: string, args: unknown) => Promise<unknown>
) {
  if (!IS_BROWSER || !import.meta.env.DEV) return
  if (!appRuntimeConfig.test) return
  const testHooks = (windowAPI().test ??= {})
  testHooks.automation = async (command, args) => {
    const store = windowAPI().getStore?.()
    if (!store) throw new Error('OpenPencil store not initialized')
    return handleRequest(store, command, args)
  }
}

export function exposeChatTransportOverride(
  setChatTransport: (factory: () => ChatTransport<UIMessage>) => void
) {
  windowAPI().setChatTransport = setChatTransport
}

export function setOpenPencilOpenFileHandler(openFile: (path: string) => Promise<void>) {
  windowAPI().openFile = openFile
}

export function setOpenPencilOpenDocumentHandler(openDocument: (file: File) => Promise<void>) {
  windowAPI().openDocumentFile = openDocument
}

/** workos: lets a host page supply the collaboration transport and start or join rooms. */
export function exposeCollabHost(collab: CollabReturn, joinRoom: (roomId: string) => boolean) {
  if (!IS_BROWSER) return
  const api = windowAPI()
  api.setCollabTransport = setCollabTransportOverride
  api.collabHost = {
    assetProtocol: 2,
    ensureAssetsAvailable: collab.ensureAssetsAvailable,
    shareCurrentDoc: (roomId) => collab.shareCurrentDoc(roomId),
    joinRoom,
    leave: collab.disconnect,
    setLocalName: collab.setLocalName,
    peerCount: () => collab.remotePeers.value.length,
    status: () => collab.state.value.status
  }
}

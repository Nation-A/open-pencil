import type { ChatTransport, UIMessage } from 'ai'

import type { CollabReturn } from '@/app/collab/context'
import type { RoomStatus } from '@/app/collab/room/status'
import type { EditorStore } from '@/app/editor/session/create'
import { createNavigationBenchmarkHooks } from '@/app/performance/navigation/hooks'
import type { NavigationBenchmarkHooks } from '@/app/performance/navigation/hooks'
import { setCollabTransportOverride, type JoinCollabRoom } from '@/app/collab/transport'
import { appRuntimeConfig } from '@/app/runtime/config'
import { setEmbedded, setEmbeddedLocalFiles, type EmbeddedLocalFiles } from '@/app/embedded'
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
  /** workos: replaces Trystero for every room joined afterwards. Pass null to restore it. */
  setCollabTransport?: (join: JoinCollabRoom | null) => void
  collabHost?: OpenPencilCollabHost
  getStore?: () => EditorStore
  setChatTransport?: (factory: () => ChatTransport<UIMessage>) => void
  openFile?: (path: string) => Promise<void>
  test?: OpenPencilTestHooks
}

let activeStore: EditorStore | null = null

function windowAPI(): OpenPencilWindowAPI {
  window.openPencil ??= {}
  window.openPencil.setEmbedded ??= setEmbedded
  window.openPencil.setEmbeddedLocalFiles ??= setEmbeddedLocalFiles
  window.openPencil.getStore ??= () => {
    if (!activeStore) throw new Error('OpenPencil store not initialized')
    return activeStore
  }
  return window.openPencil
}

export function setOpenPencilStore(store: EditorStore) {
  activeStore = store
  if (!IS_BROWSER) return
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

/** workos: lets a host page supply the collaboration transport and start or join rooms. */
export function exposeCollabHost(collab: CollabReturn, joinRoom: (roomId: string) => boolean) {
  if (!IS_BROWSER) return
  const api = windowAPI()
  api.setCollabTransport = setCollabTransportOverride
  api.collabHost = {
    shareCurrentDoc: (roomId) => collab.shareCurrentDoc(roomId),
    joinRoom,
    leave: collab.disconnect,
    setLocalName: collab.setLocalName,
    peerCount: () => collab.remotePeers.value.length,
    status: () => collab.state.value.status
  }
}

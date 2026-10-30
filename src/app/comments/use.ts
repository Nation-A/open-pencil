import { createEventHook, createGlobalState } from '@vueuse/core'
import { computed, ref } from 'vue'

import {
  commentTimestamp as now,
  createCommentReply,
  createCommentThread,
  deleteCommentReply,
  deleteCommentThread,
  replyToCommentThread,
  resolveCommentThread,
  type CommentThread
} from '@open-pencil/scene-graph'

import { useCollabIdentity } from '@/app/collab/identity'
import { useActiveEditorStoreRef } from '@/app/editor/active-store'
import type { PagePoint } from '@/app/editor/pages/point'
import { bindHostRules } from '@/app/embedded-comments'
import { setCommentsOnCanvas } from '@/app/settings/preferences/apply'
import { appPreferences } from '@/app/settings/preferences/store'

import { followDocumentComments } from './document'
import { createCommentEditing, type CommentEditing } from './edit-state'
import { createHostActions } from './host-actions'
import {
  applyPinMoves,
  commentsHost,
  hostThreads,
  pendingPinMoves,
  setCommentFocusHandler
} from './host-provider'
import { createListState } from './list-state'

/**
 * The active document's comments and the comment UI's state, one for the whole app: the canvas
 * layer, the sidebar list, menus and shortcuts share it, and it follows whichever tab is active.
 * Changes are document changes but never undo steps, as in Figma.
 *
 * Escape closes things in order: the composer and the card's popover close themselves, and the
 * editor's Escape asks `closeCard` before it leaves the Comment tool.
 */
export const useComments = createGlobalState(() => {
  const identity = useCollabIdentity()
  const storeRef = useActiveEditorStoreRef()

  const activeThreadId = ref<string | null>(null)
  const draft = ref<PagePoint | null>(null)
  /** Deleting asks first; the confirmation dialog listens for which thread. */
  const deleteRequested = createEventHook<string>()
  const showOnCanvas = computed(() => appPreferences.value.comments.showOnCanvas)
  const list = createListState()
  const { listShowResolved } = list
  const editing = ref<CommentEditing>(null)

  // Another document is open: nothing from the last one stays open or half-written.
  const documentComments = followDocumentComments(
    storeRef,
    () => {
      activeThreadId.value = null
      draft.value = null
      editing.value = null
    },
    () => !commentsHost.value
  )
  const { mutate, update, pinPosition } = documentComments

  // workos: with a host the threads are the host's and every change is a request to it.
  const host = commentsHost
  const hosted = computed(() => host.value !== null)
  const threads = computed<CommentThread[]>(() =>
    host.value
      ? applyPinMoves(hostThreads.value, pendingPinMoves.value)
      : documentComments.threads.value
  )
  const remote = createHostActions({ threads, activeThreadId })
  const authorName = computed(() => host.value?.me.name ?? identity.name.value)
  const editor = createCommentEditing({
    editing,
    threads,
    authorName,
    remote,
    update,
    store: () => documentComments.store(),
    draft,
    activeThreadId,
    focusThread: (threadId) => focusThread(threadId)
  })

  bindHostRules(storeRef)

  function me() {
    return { name: authorName.value, color: identity.color }
  }

  function startDraft(at: PagePoint) {
    activeThreadId.value = null
    draft.value = at
  }

  function toggleThread(threadId: string) {
    editing.value = null
    draft.value = null
    activeThreadId.value = activeThreadId.value === threadId ? null : threadId
  }

  /** Close an unsent comment or an open thread; false when neither was open. */
  function closeCard(): boolean {
    const open = draft.value !== null || activeThreadId.value !== null
    editing.value = null
    draft.value = null
    activeThreadId.value = null
    return open
  }

  function addThread(text: string) {
    const place = draft.value
    const body = text.trim()
    const store = documentComments.store()
    if (!store || !place || !body) return
    if (host.value) {
      draft.value = null
      void remote.create(store.graph, place, body)
      return
    }
    const thread = createCommentThread(store.graph, {
      pageId: place.pageId,
      at: place,
      author: me(),
      text: body,
      now: now()
    })
    draft.value = null
    activeThreadId.value = thread.id
    mutate((current) => [...current, thread])
  }

  function reply(threadId: string, text: string) {
    const body = text.trim()
    if (!body) return
    if (host.value) return remote.reply(threadId, body)
    const entry = createCommentReply(me(), body, now())
    update(threadId, (thread) => replyToCommentThread(thread, entry))
  }

  function setResolved(threadId: string, resolved: boolean) {
    if (host.value) remote.resolve(threadId, resolved)
    else update(threadId, (thread) => resolveCommentThread(thread, resolved, now()))
    // A resolved thread leaves the canvas unless resolved comments are shown.
    if (resolved && !listShowResolved.value && activeThreadId.value === threadId) {
      activeThreadId.value = null
    }
  }

  /** Ask before deleting; the confirmation dialog answers with `confirmDelete`. */
  function requestDelete(threadId: string) {
    void deleteRequested.trigger(threadId)
  }

  function confirmDelete(threadId: string) {
    if (host.value) remote.remove(threadId, null)
    else update(threadId, deleteCommentThread)
    if (activeThreadId.value === threadId) activeThreadId.value = null
  }

  function deleteReply(threadId: string, replyId: string) {
    if (host.value) remote.remove(threadId, replyId)
    else update(threadId, (thread) => deleteCommentReply(thread, replyId))
  }

  /** Show a thread: its page, centered on its pin, with its card open. */
  async function focusThread(threadId: string) {
    const store = documentComments.store()
    const thread = threads.value.find((entry) => entry.id === threadId)
    if (!store || !thread) return
    if (store.state.currentPageId !== thread.pageId && store.graph.getNode(thread.pageId)) {
      await store.switchPage(thread.pageId)
    }
    const { x, y } = pinPosition(thread)
    store.centerOn(x, y)
    draft.value = null
    activeThreadId.value = threadId
  }

  function toggleOnCanvas() {
    setCommentsOnCanvas(!showOnCanvas.value)
  }

  return {
    threads,
    activeThreadId,
    draft,
    onDeleteRequested: deleteRequested.on,
    author: authorName,
    hosted,
    can: remote.can,
    members: remote.members,
    meId: remote.meId,
    editing,
    canEdit: editor.canEdit,
    canMovePin: editor.canMovePin,
    startEdit: editor.startEdit,
    cancelEdit: editor.cancelEdit,
    saveEdit: editor.saveEdit,
    react: remote.react,
    showOnCanvas,
    ...list,
    pinPosition,
    startDraft,
    toggleThread,
    closeCard,
    addThread,
    movePin: editor.movePin,
    reply,
    setResolved,
    requestDelete,
    confirmDelete,
    deleteReply,
    focusThread,
    toggleOnCanvas
  }
})

// workos: `window.openPencil.focusComment` reaches the comments through this, as the bridge cannot import them.
setCommentFocusHandler(focusComment)

/**
 * Opens a thread for a host that links to one (a notification, a mention): its page, its pin, its
 * card. A thread the host has not delivered yet is opened as soon as it arrives, for a few seconds.
 */
async function focusComment(threadId: string): Promise<boolean> {
  const comments = useComments()
  const deadline = Date.now() + 5000
  while (!comments.threads.value.some((thread) => thread.id === threadId && !thread.deleted)) {
    if (Date.now() > deadline) return false
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 100)
    })
  }
  await comments.focusThread(threadId)
  return true
}

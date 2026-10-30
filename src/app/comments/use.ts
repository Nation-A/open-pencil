import { createEventHook, createGlobalState } from '@vueuse/core'
import { computed, ref, watch, watchEffect, type WritableComputedRef } from 'vue'

import {
  commentAnchor,
  commentTimestamp as now,
  createCommentReply,
  createCommentThread,
  deleteCommentReply,
  deleteCommentThread,
  replyToCommentThread,
  resolveCommentThread,
  type CommentThread
} from '@open-pencil/scene-graph'
import type { Vector } from '@open-pencil/scene-graph/primitives'

import { useCollabIdentity } from '@/app/collab/identity'
import { useActiveEditorStoreRef } from '@/app/editor/active-store'
import type { PagePoint } from '@/app/editor/pages/point'
import { allowedTools, fallbackTool, importLegacyComments } from '@/app/embedded-comments'
import { setCommentsOnCanvas } from '@/app/settings/preferences/apply'
import {
  appPreferences,
  updateCommentPreferences,
  type CommentPreferences
} from '@/app/settings/preferences/store'

import { followDocumentComments } from './document'
import { createHostActions } from './host-actions'
import { commentsHost, hostThreads, setCommentFocusHandler } from './host-provider'

/** A comment preference the list and menus read and change in place. */
function preference<K extends keyof CommentPreferences>(
  key: K
): WritableComputedRef<CommentPreferences[K]> {
  return computed({
    get: () => appPreferences.value.comments[key],
    set: (value) => updateCommentPreferences({ [key]: value })
  })
}

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
  const listQuery = ref('')
  const showOnCanvas = computed(() => appPreferences.value.comments.showOnCanvas)
  const listShowResolved = preference('showResolved')
  const listOnlyPage = preference('onlyPage')
  const listOnlyMine = preference('onlyMine')
  const listSort = preference('sort')

  // Another document is open: nothing from the last one stays open or half-written.
  const documentComments = followDocumentComments(
    storeRef,
    () => {
      activeThreadId.value = null
      draft.value = null
    },
    () => !commentsHost.value
  )
  const { mutate, update, pinPosition } = documentComments

  // workos: with a host the threads are the host's and every change is a request to it.
  const host = commentsHost
  const hosted = computed(() => host.value !== null)
  const threads = computed<CommentThread[]>(() =>
    host.value ? hostThreads.value : documentComments.threads.value
  )
  const remote = createHostActions({ threads, activeThreadId })
  const authorName = computed(() => host.value?.me.name ?? identity.name.value)

  // workos: a commenter keeps the Comment tool only, and the document's old comments move to the host once.
  watchEffect(() => {
    const store = storeRef.value
    const allowed = allowedTools(host.value)
    if (store && allowed && !allowed.has(store.state.activeTool)) {
      store.setTool(fallbackTool(allowed))
    }
  })
  watch(
    [storeRef, host],
    ([store, current]) => {
      if (store && current) void importLegacyComments(current, store.graph)
    },
    { immediate: true }
  )

  function me() {
    return { name: authorName.value, color: identity.color }
  }

  function startDraft(at: PagePoint) {
    activeThreadId.value = null
    draft.value = at
  }

  function toggleThread(threadId: string) {
    draft.value = null
    activeThreadId.value = activeThreadId.value === threadId ? null : threadId
  }

  /** Close an unsent comment or an open thread; false when neither was open. */
  function closeCard(): boolean {
    const open = draft.value !== null || activeThreadId.value !== null
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

  /** A dragged pin lands on whatever is under it now, as in Figma. */
  function movePin(threadId: string, at: Vector) {
    const store = documentComments.store()
    // workos: a host-stored pin stays where it was placed.
    if (!store || host.value) return
    update(threadId, (thread) => ({ ...thread, ...commentAnchor(store.graph, thread.pageId, at) }))
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
    edit: remote.edit,
    react: remote.react,
    showOnCanvas,
    listQuery,
    listShowResolved,
    listOnlyPage,
    listOnlyMine,
    listSort,
    pinPosition,
    startDraft,
    toggleThread,
    closeCard,
    addThread,
    movePin,
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

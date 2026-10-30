import type { ComputedRef, Ref } from 'vue'

import { commentAnchor, editCommentText, type CommentThread } from '@open-pencil/scene-graph'
import type { Vector } from '@open-pencil/scene-graph/primitives'

import type { EditorStore } from '@/app/editor/active-store'

import type { createHostActions } from './host-actions'
import { commentsHost } from './host-provider'

/**
 * workos: editing a message in place and who may move a pin. With a host a person owns what their actor id
 * wrote; without one, what carries their name. Saving is a request to the host or a change to the document.
 */
export type CommentEditing = { threadId: string; replyId: string | null } | null

export function createCommentEditing(options: {
  /** The message being edited in place: a thread's own text (replyId null) or one reply's. */
  editing: Ref<CommentEditing>
  threads: Readonly<Ref<CommentThread[]>>
  authorName: ComputedRef<string>
  remote: ReturnType<typeof createHostActions>
  update: (id: string, edit: (thread: CommentThread) => CommentThread) => void
  store: () => EditorStore | null
  draft: Ref<unknown>
  activeThreadId: Ref<string | null>
  focusThread: (threadId: string) => Promise<void>
}) {
  const { editing, threads, authorName, remote, update, draft, activeThreadId } = options

  /** A dragged pin lands on whatever is under it now, as in Figma; with a host it moves optimistically and the host has the last word. */
  function movePin(threadId: string, at: Vector) {
    const store = options.store()
    if (!store) return
    if (commentsHost.value) {
      void remote.move(store.graph, threadId, at)
      return
    }
    update(threadId, (thread) => ({ ...thread, ...commentAnchor(store.graph, thread.pageId, at) }))
  }

  /** Whether the person may drag this pin: with a host only their own; without one, any. */
  function canMovePin(thread: CommentThread): boolean {
    return commentsHost.value ? remote.ownsMessage(thread, null) : true
  }

  /** Whether the person may edit the thread's own text (replyId null) or that reply. */
  function canEdit(thread: CommentThread, replyId: string | null): boolean {
    if (commentsHost.value) return remote.ownsMessage(thread, replyId)
    const target = replyId ? thread.replies.find((entry) => entry.id === replyId) : thread
    return !!target && !target.deleted && target.author === authorName.value
  }

  /** Opens the thread's card with the message turned into an editor. */
  async function startEdit(threadId: string, replyId: string | null) {
    const thread = threads.value.find((entry) => entry.id === threadId)
    if (!thread || !canEdit(thread, replyId)) return
    // From the list the pin may be on another page: show it first, then turn the message into an editor.
    if (options.store()?.state.currentPageId !== thread.pageId) await options.focusThread(threadId)
    draft.value = null
    activeThreadId.value = threadId
    editing.value = { threadId, replyId }
  }

  function cancelEdit() {
    editing.value = null
  }

  /** Saves the edit in place: a request to the host, or the document's plugin data. */
  function saveEdit(text: string) {
    const current = editing.value
    const body = text.trim()
    editing.value = null
    if (!current || !body) return
    if (commentsHost.value) return remote.edit(current.threadId, current.replyId, body)
    update(current.threadId, (thread) => editCommentText(thread, current.replyId, body))
  }

  return { movePin, canMovePin, canEdit, startEdit, cancelEdit, saveEdit }
}
